import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
import shutil
import os

from app.db.session import get_db
from app.db.models import Student, Subject, Mark, Department, StudentAdvisor
from app.services.processor import (
    load_usns_from_file, parse_result, detect_department_from_usn, detect_batch_from_usn
)
from app.services.scraper import initiate_vtu_scrape, complete_vtu_scrape, get_simulated_vtu_text
from app.services.analytics import get_student_risk_score
from app.routers.auth import get_current_user, User

router = APIRouter(prefix="/process", tags=["process"])

# Map common VTU department codes to full names
DEPT_MAP = {
    "CI": "Artificial Intelligence & Machine Learning",
    "CS": "Computer Science & Engineering",
    "IS": "Information Science & Engineering",
    "EC": "Electronics & Communication Engineering",
    "ME": "Mechanical Engineering",
    "EE": "Electrical & Electronics Engineering",
    "CV": "Civil Engineering"
}

class USNProcessRequest(BaseModel):
    usn: str

class CaptchaSubmitRequest(BaseModel):
    session_id: str
    captcha_code: str

def save_parsed_results(db: Session, rows: list, faculty_id: int = None) -> str:
    """
    Saves parsed result rows to the database.
    Each row is: [usn, name, sem, subject_code, subject_name, internal, external, total, result, date]
    """
    if not rows:
        return "No rows to save."
        
    first_row = rows[0]
    usn = first_row[0]
    student_name = first_row[1]
    sem = int(first_row[2])
    
    # 1. Detect and create Department
    dept_code = detect_department_from_usn(usn)
    dept_name = DEPT_MAP.get(dept_code, f"Department of {dept_code}")
    
    dept = db.query(Department).filter(Department.code == dept_code).first()
    if not dept:
        dept = Department(name=dept_name, code=dept_code)
        db.add(dept)
        db.commit()
        db.refresh(dept)
        
    # 2. Find or create Student
    student = db.query(Student).filter(Student.usn == usn).first()
    batch_year = detect_batch_from_usn(usn)
    academic_year = f"{batch_year}-{str(batch_year+1)[2:]}"
    
    if not student:
        student = Student(
            usn=usn,
            name=student_name,
            department_id=dept.id,
            current_sem=sem,
            academic_year=academic_year,
            status="active"
        )
        db.add(student)
        db.commit()
        db.refresh(student)
    else:
        # Update semester if newer
        if sem > student.current_sem:
            student.current_sem = sem
            db.commit()
            
    # 3. Associate student with Faculty/Advisor if uploaded by faculty
    if faculty_id:
        existing_advisor = db.query(StudentAdvisor).filter(
            StudentAdvisor.faculty_user_id == faculty_id,
            StudentAdvisor.usn == usn
        ).first()
        if not existing_advisor:
            advisor = StudentAdvisor(faculty_user_id=faculty_id, usn=usn)
            db.add(advisor)
            db.commit()
            
    # 4. Insert subjects and marks
    for row in rows:
        subj_code = row[3]
        subj_name = row[4]
        internal = int(row[5])
        external = int(row[6])
        total = int(row[7])
        res = row[8]
        date = row[9]
        
        # Check if subject exists
        subject = db.query(Subject).filter(Subject.code == subj_code).first()
        if not subject:
            # Determine credits based on subject type (e.g. labs are 1 or 2 credits, theory is 3 or 4)
            credits = 1 if "LAB" in subj_name.upper() or "MINI" in subj_name.upper() else 3
            subject = Subject(
                code=subj_code,
                name=subj_name,
                credits=credits,
                semester=sem,
                department_id=dept.id
            )
            db.add(subject)
            db.commit()
            db.refresh(subject)
            
        # Check if marks already recorded for this subject and exam_date
        mark = db.query(Mark).filter(
            Mark.usn == usn,
            Mark.subject_code == subj_code,
            Mark.exam_date == date
        ).first()
        
        if not mark:
            mark = Mark(
                usn=usn,
                subject_code=subj_code,
                internal_marks=internal,
                external_marks=external,
                total_marks=total,
                result=res,
                exam_date=date,
                semester=sem
            )
            db.add(mark)
        else:
            # Update values
            mark.internal_marks = internal
            mark.external_marks = external
            mark.total_marks = total
            mark.result = res
            
        db.commit()
        
    # 5. Update Student risk status
    risk_info = get_student_risk_score(db, student)
    student.status = risk_info["status"].lower()
    db.commit()
    
    return student.name

@router.post("/upload-csv")
def upload_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Accepts an uploaded CSV/Excel file, parses valid USNs, and returns them to the UI
    for batch execution.
    """
    os.makedirs("./temp", exist_ok=True)
    temp_file_path = f"./temp/{uuid.uuid4()}_{file.filename}"
    
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        usn_list = load_usns_from_file(temp_file_path)
        
        # Clear all student, mark, and student advisor records from the database to replace the active dataset completely
        db.query(StudentAdvisor).delete(synchronize_session=False)
        db.query(Mark).delete(synchronize_session=False)
        db.query(Student).delete(synchronize_session=False)
        db.commit()
            
        return {
            "filename": file.filename,
            "total_usns": len(usn_list),
            "usns": usn_list
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/process-usn")
async def process_usn(
    data: USNProcessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Processes a single USN.
    1. Checks if we have local results for this USN. If so, stores them and returns SUCCESS.
    2. Otherwise, initiates a Playwright scrape. If CAPTCHA required, returns CAPTCHA details.
    """
    usn = data.usn.strip().upper()
    
    # Check if student already in DB with marks (bypassed to force CAPTCHA request for all students)
    # existing_student = db.query(Student).filter(Student.usn == usn).first()
    # if existing_student and db.query(Mark).filter(Mark.usn == usn).count() > 0:
    #     return {
    #         "status": "SUCCESS",
    #         "usn": usn,
    #         "student_name": existing_student.name,
    #         "source": "database"
    #     }
        
    session_id = f"{usn}_{uuid.uuid4().hex[:6]}"
    
    try:
        # Initiate scraping
        captcha_res = await initiate_vtu_scrape(usn, session_id)
        
        # Real scraping path - requires CAPTCHA solver
        return {
            "status": "CAPTCHA",
            "session_id": session_id,
            "captcha_image": captcha_res,
            "usn": usn
        }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape {usn}: {str(e)}")

@router.post("/solve-captcha")
async def solve_captcha(
    data: CaptchaSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Resumes a pending Playwright scrape with the user's solved CAPTCHA code,
    parses the resulting page, and saves details to the database.
    """
    try:
        result_text = await complete_vtu_scrape(data.session_id, data.captcha_code)
        rows = parse_result(result_text)
        
        # Post-CAPTCHA Fallback: If no results are found/parsed (e.g. mock student), load simulated data
        if not rows:
            usn = data.session_id.split("_")[0]
            simulated_text = get_simulated_vtu_text(usn)
            rows = parse_result(simulated_text)
            if not rows:
                raise HTTPException(status_code=400, detail="Student result could not be found.")
            
            student_name = save_parsed_results(db, rows, faculty_id=current_user.id if current_user.role == "Faculty" else None)
            return {
                "status": "SUCCESS",
                "usn": usn,
                "student_name": student_name,
                "source": "simulator"
            }
            
        student_name = save_parsed_results(db, rows, faculty_id=current_user.id if current_user.role == "Faculty" else None)
        # Get USN from rows
        usn = rows[0][0]
        
        return {
            "status": "SUCCESS",
            "usn": usn,
            "student_name": student_name,
            "source": "vtu_portal"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
