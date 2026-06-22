from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Department, Student, Mark
from app.services.analytics import (
    get_institution_analytics,
    get_department_analytics,
    get_faculty_analytics,
    calculate_student_gpa_trends,
    get_student_risk_score
)
from app.routers.auth import get_current_user, User

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/institution")
def institution_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Principal", "Vice Principal"]:
        raise HTTPException(status_code=403, detail="Permission denied. Principal or VP only.")
    return get_institution_analytics(db)

@router.get("/department/{dept_code}")
def department_metrics(
    dept_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce role boundaries (HOD can only view their own department, or Principal/VP can view any)
    if current_user.role == "HOD" and current_user.department.code != dept_code.upper():
        raise HTTPException(status_code=403, detail="Permission denied. HODs can only view their own department.")
    elif current_user.role not in ["Principal", "Vice Principal", "HOD"]:
        raise HTTPException(status_code=403, detail="Permission denied.")
        
    dept = db.query(Department).filter(Department.code == dept_code.upper()).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    stats = get_department_analytics(db, dept.id)
    
    # Add list of students in the department
    students = db.query(Student).filter(Student.department_id == dept.id).all()
    student_list = []
    for s in students:
        risk = get_student_risk_score(db, s)
        student_list.append({
            "usn": s.usn,
            "name": s.name,
            "semester": s.current_sem,
            "academic_year": s.academic_year,
            "status": s.status,
            "backlogs": risk["backlogs"]
        })
    stats["student_list"] = student_list
    
    return stats

@router.get("/faculty")
def faculty_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Faculty":
        raise HTTPException(status_code=403, detail="Permission denied. Faculty only.")
    return get_faculty_analytics(db, current_user.id)

@router.get("/student/{usn}")
def student_metrics(
    usn: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Student can only access their own USN, others can access any
    usn_upper = usn.strip().upper()
    if current_user.role == "Student" and current_user.username.upper() != usn_upper:
        raise HTTPException(status_code=403, detail="Permission denied. Can only view your own USN.")
        
    student = db.query(Student).filter(Student.usn == usn_upper).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    risk_info = get_student_risk_score(db, student)
    gpa_trends = calculate_student_gpa_trends(db, usn_upper)
    
    # Load latest marks for each subject code (resolves mixed results issue)
    marks_query = db.query(Mark).filter(Mark.usn == usn_upper).all()
    latest_marks = {}
    for m in marks_query:
        subj = m.subject_code
        if subj not in latest_marks or (m.exam_date or "") > (latest_marks[subj].exam_date or ""):
            latest_marks[subj] = m
            
    # Find max semester and keep only marks of that semester (resolves all sem / mixed results issue)
    max_sem = 1
    latest_sem_marks = []
    if latest_marks:
        max_sem = max(m.semester for m in latest_marks.values())
        latest_sem_marks = [m for m in latest_marks.values() if m.semester == max_sem]
            
    marks_list = []
    for m in latest_sem_marks:
        marks_list.append({
            "subject_code": m.subject_code,
            "subject_name": m.subject.name if m.subject else "Unknown",
            "internal_marks": m.internal_marks,
            "external_marks": m.external_marks,
            "total_marks": m.total_marks,
            "result": m.result,
            "exam_date": m.exam_date,
            "semester": m.semester,
            "credits": m.subject.credits if m.subject else 3
        })
        
    return {
        "usn": student.usn,
        "name": student.name,
        "department": student.department.name,
        "department_code": student.department.code,
        "semester": student.current_sem,
        "academic_year": student.academic_year,
        "status": student.status,
        "backlogs": risk_info["backlogs"],
        "gpa_trends": gpa_trends,
        "marks": marks_list
    }
