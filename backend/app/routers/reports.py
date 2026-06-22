import csv
import time
from io import StringIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Student, Mark, Department, Subject
from app.services.analytics import (
    get_department_analytics,
    get_student_risk_score,
    filter_latest_semester_marks
)
from app.routers.auth import get_current_user, User

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/export-csv/{dept_code}")
def export_department_csv(
    dept_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Exports a CSV sheet of all students in the department, their marks and risk scores.
    """
    if current_user.role not in ["Principal", "Vice Principal", "HOD", "Faculty"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")
        
    dept = db.query(Department).filter(Department.code == dept_code.upper()).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    students = db.query(Student).filter(Student.department_id == dept.id).all()
    
    # Create CSV in memory
    stream = StringIO()
    writer = csv.writer(stream)
    
    # Headers
    writer.writerow([
        "USN", "Student Name", "Current Semester", "Academic Year", 
        "Risk Status", "Total Backlogs", "Subject Code", "Subject Name", 
        "Internal Marks", "External Marks", "Total Marks", "Result", "Exam Date"
    ])
    
    for student in students:
        risk = get_student_risk_score(db, student)
        marks = db.query(Mark).filter(Mark.usn == student.usn).all()
        latest_marks = filter_latest_semester_marks(marks)
        
        if not latest_marks:
            writer.writerow([
                student.usn, student.name, student.current_sem, student.academic_year,
                student.status, risk["backlogs"], "N/A", "N/A", 0, 0, 0, "N/A", "N/A"
            ])
        else:
            for m in latest_marks:
                writer.writerow([
                    student.usn, student.name, student.current_sem, student.academic_year,
                    student.status, risk["backlogs"], m.subject_code, 
                    m.subject.name if m.subject else "Unknown",
                    m.internal_marks, m.external_marks, m.total_marks, m.result, m.exam_date
                ])
                
    stream.seek(0)
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={dept_code}_academic_report.csv"
    return response

@router.get("/print-pdf/{usn}", response_class=HTMLResponse)
def print_student_report_card(
    usn: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a print-ready HTML page representing the official Academic Report Card.
    The user can hit Ctrl+P / Cmd+P to save as PDF.
    """
    usn_upper = usn.upper().strip()
    student = db.query(Student).filter(Student.usn == usn_upper).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    marks = db.query(Mark).filter(Mark.usn == usn_upper).all()
    latest_marks = filter_latest_semester_marks(marks)
    risk = get_student_risk_score(db, student)
    
    # Generate grades details
    rows_html = ""
    total_credits = 0
    earned_credits = 0
    weighted_gp = 0
    
    for m in latest_marks:
        # Normalize total marks out of 100
        total = m.total_marks
        if total > 100:
            total = total / 2
            
        if total >= 90:
            grade = "O (Outstanding)"
            gp = 10
        elif total >= 80:
            grade = "S (Excellent)"
            gp = 9
        elif total >= 70:
            grade = "A (Very Good)"
            gp = 8
        elif total >= 60:
            grade = "B (Good)"
            gp = 7
        elif total >= 50:
            grade = "C (Above Average)"
            gp = 6
        elif total >= 40:
            grade = "D (Pass)"
            gp = 5
        else:
            grade = "F (Fail)"
            gp = 0
            
        credits = m.subject.credits if m.subject else 3
        total_credits += credits
        if m.result == "P":
            earned_credits += credits
            
        weighted_gp += gp * credits
        
        status_color = "color: green; font-weight: bold;" if m.result == "P" else "color: red; font-weight: bold;"
        
        rows_html += f"""
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">{m.subject_code}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">{m.subject.name if m.subject else 'Unknown'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">{m.internal_marks}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">{m.external_marks}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">{m.total_marks}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center; {status_color}">{m.result}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">{grade}</td>
        </tr>
        """
        
    sgpa = round(weighted_gp / total_credits, 2) if total_credits > 0 else 0.0
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>EduInsight Academic Report - {student.usn}</title>
        <style>
            body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; line-height: 1.5; }}
            .header {{ display: flex; justify-content: space-between; border-bottom: 3px double #333; padding-bottom: 20px; margin-bottom: 30px; }}
            .logo-section {{ max-width: 70%; }}
            .title {{ font-size: 24px; font-weight: bold; margin: 0; color: #1a365d; }}
            .subtitle {{ font-size: 14px; margin: 5px 0 0 0; color: #4a5568; }}
            .report-title {{ font-size: 20px; font-weight: bold; text-align: center; margin: 20px 0; letter-spacing: 1px; }}
            .student-info {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f7fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }}
            .info-item {{ font-size: 14px; }}
            .info-item span {{ font-weight: bold; color: #2d3748; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }}
            th {{ background-color: #2b6cb0; color: white; border: 1px solid #2b6cb0; padding: 10px; font-weight: 600; text-align: left; }}
            .summary-section {{ display: flex; justify-content: flex-end; margin-bottom: 50px; }}
            .summary-box {{ border: 1px solid #cbd5e0; border-radius: 8px; padding: 15px; min-width: 250px; background: #ebf8ff; }}
            .summary-row {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }}
            .summary-row:last-child {{ margin-bottom: 0; border-top: 1px solid #bee3f8; padding-top: 8px; font-weight: bold; font-size: 16px; color: #2b6cb0; }}
            .footer {{ text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 50px; }}
            @media print {{
                body {{ margin: 20px; }}
                button {{ display: none; }}
                .no-print {{ display: none; }}
            }}
        </style>
    </head>
    <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
            <button onclick="window.print()" style="background: #2b6cb0; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer;">Print Report Card / Save as PDF</button>
        </div>
        <div class="header">
            <div class="logo-section">
                <div class="title">VISVESVARAYA TECHNOLOGICAL UNIVERSITY</div>
                <div class="subtitle">BLDEA's V. P. Dr. P. G. Halakatti College of Engineering & Technology, Vijayapur</div>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: bold; font-size: 14px;">EduInsight Academic Portal</div>
                <div style="font-size: 12px; color: #718096;">Date Generated: {time.strftime('%Y-%m-%d')}</div>
            </div>
        </div>
        
        <div class="report-title">OFFICIAL GRADE CARD REPORT</div>
        
        <div class="student-info">
            <div class="info-item"><span>Student Name:</span> {student.name}</div>
            <div class="info-item"><span>University Seat Number (USN):</span> {student.usn}</div>
            <div class="info-item"><span>Department:</span> {student.department.name} ({student.department.code})</div>
            <div class="info-item"><span>Current Semester:</span> {student.current_sem}</div>
            <div class="info-item"><span>Academic Year:</span> {student.academic_year}</div>
            <div class="info-item"><span>Risk Profile:</span> {risk['status']} ({risk['backlogs']} Active Backlogs)</div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th style="width: 15%;">Subject Code</th>
                    <th style="width: 45%;">Subject Title</th>
                    <th style="width: 10%; text-align: center;">Internal (Max 40)</th>
                    <th style="width: 10%; text-align: center;">External (Max 60)</th>
                    <th style="width: 10%; text-align: center;">Total (Max 100)</th>
                    <th style="width: 10%; text-align: center;">Result</th>
                    <th style="width: 15%; text-align: center;">Grade Letter</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        
        <div class="summary-section">
            <div class="summary-box">
                <div class="summary-row">
                    <span>Total Credits Attempted:</span>
                    <span>{total_credits}</span>
                </div>
                <div class="summary-row">
                    <span>Credits Earned:</span>
                    <span>{earned_credits}</span>
                </div>
                <div class="summary-row">
                    <span>Active Backlogs:</span>
                    <span>{risk['backlogs']}</span>
                </div>
                <div class="summary-row">
                    <span>Calculated SGPA:</span>
                    <span>{sgpa}</span>
                </div>
            </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 100px; font-size: 14px;">
            <div style="text-align: center; border-top: 1px solid #333; width: 200px; padding-top: 5px;">HOD Signature</div>
            <div style="text-align: center; border-top: 1px solid #333; width: 200px; padding-top: 5px;">Principal/VP Signature</div>
        </div>
        
        <div class="footer">
            EduInsight Academic Analytics Platform. Generated automatically via VTU Scraper.
        </div>
    </body>
    </html>
    """
    return html_content
