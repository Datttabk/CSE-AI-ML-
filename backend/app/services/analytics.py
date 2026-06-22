from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models import Student, Mark, Subject, Department, User, FacultySubject, StudentAdvisor
from typing import Dict, List, Any

def filter_latest_marks(marks: List[Mark]) -> List[Mark]:
    """
    Groups marks by (usn, subject_code) and keeps only the latest attempt based on exam_date.
    If exam_dates are identical or null, falls back to the database ID.
    """
    latest = {}
    for m in marks:
        key = (m.usn, m.subject_code)
        if key not in latest:
            latest[key] = m
        else:
            m_date = m.exam_date or ""
            l_date = latest[key].exam_date or ""
            if m_date > l_date:
                latest[key] = m
            elif m_date == l_date and m.id > latest[key].id:
                latest[key] = m
    return list(latest.values())

def filter_latest_semester_marks(marks: List[Mark]) -> List[Mark]:
    """
    Groups marks by student, finds the latest semester for each student,
    and returns only the latest attempts for that latest semester.
    """
    latest_attempts = filter_latest_marks(marks)
    if not latest_attempts:
        return []
        
    student_marks = {}
    for m in latest_attempts:
        if m.usn not in student_marks:
            student_marks[m.usn] = []
        student_marks[m.usn].append(m)
        
    filtered = []
    for usn, s_marks in student_marks.items():
        max_sem = max(m.semester for m in s_marks)
        filtered.extend([m for m in s_marks if m.semester == max_sem])
        
    return filtered

def get_academic_health_score(pass_rate: float, avg_marks_pct: float, backlog_clear_rate: float) -> float:
    """
    Computes Academic Health Score:
    AHS = 0.5 * Pass Rate + 0.3 * Avg Marks Pct + 0.2 * Backlog Clear Rate
    All inputs should be between 0.0 and 100.0. Returns a value out of 100.
    """
    return round((0.5 * pass_rate) + (0.3 * avg_marks_pct) + (0.2 * backlog_clear_rate), 2)

def calculate_student_gpa_trends(db: Session, usn: str) -> List[Dict[str, Any]]:
    """
    Calculates the semester-wise SGPA (GPA) for a student.
    Formula: Sum(Subject Grade * Subject Credits) / Sum(Credits)
    We will map Total Marks to Grade Points:
    90-100: 10 (O), 80-89: 9 (S), 70-79: 8 (A), 60-69: 7 (B), 50-59: 6 (C), 40-49: 5 (D), <40: 0 (F)
    """
    marks = db.query(Mark).filter(Mark.usn == usn).all()
    if not marks:
        return []
        
    # Group by subject code to keep only the latest attempt
    latest_marks = {}
    for m in marks:
        subj = m.subject_code
        if subj not in latest_marks or (m.exam_date or "") > (latest_marks[subj].exam_date or ""):
            latest_marks[subj] = m
            
    sem_marks = {}
    for m in latest_marks.values():
        sem = m.semester
        if sem not in sem_marks:
            sem_marks[sem] = []
        sem_marks[sem].append(m)
        
    trends = []
    for sem, m_list in sorted(sem_marks.items()):
        total_grade_points = 0
        total_credits = 0
        
        for m in m_list:
            # Normalize total marks out of 100
            total = m.total_marks
            if total > 100: # Project / Lab sometimes out of 200
                total = total / 2
                
            if total >= 90:
                gp = 10
            elif total >= 80:
                gp = 9
            elif total >= 70:
                gp = 8
            elif total >= 60:
                gp = 7
            elif total >= 50:
                gp = 6
            elif total >= 40:
                gp = 5
            else:
                gp = 0
                
            credits = m.subject.credits if m.subject else 3
            total_grade_points += gp * credits
            total_credits += credits
            
        gpa = round(total_grade_points / total_credits, 2) if total_credits > 0 else 0
        trends.append({"semester": sem, "gpa": gpa})
        
    return trends

def get_student_risk_score(db: Session, student: Student) -> Dict[str, Any]:
    """
    Calculates student risk details.
    High Risk: >2 current backlogs or internals < 40% (16/40) in any course.
    Medium Risk: 1-2 backlogs or internals < 50% (20/40) in any course.
    Low Risk: Otherwise.
    """
    marks = db.query(Mark).filter(Mark.usn == student.usn).all()
    if not marks:
        return {"score": 0, "status": "Low Risk", "backlogs": 0}
        
    # Find current backlogs (latest result for each subject code is 'F')
    latest_marks = {}
    for m in marks:
        subj = m.subject_code
        if subj not in latest_marks or (m.exam_date or "") > (latest_marks[subj].exam_date or ""):
            latest_marks[subj] = m
            
    backlog_count = sum(1 for m in latest_marks.values() if m.result == "F")
    
    # Check internals
    low_internals = False
    critical_internals = False
    for m in latest_marks.values():
        if m.internal_marks < 16:  # Less than 40% of 40
            critical_internals = True
        elif m.internal_marks < 20:  # Less than 50% of 40
            low_internals = True
            
    if backlog_count > 2 or critical_internals:
        status = "Critical" if backlog_count > 3 else "High Risk"
        score = 85 if backlog_count > 3 else 70
    elif backlog_count > 0 or low_internals:
        status = "Medium Risk"
        score = 45
    else:
        status = "Low Risk"
        score = 10
        
    return {
        "score": score,
        "status": status,
        "backlogs": backlog_count,
        "total_subjects": len(latest_marks)
    }

def get_department_analytics(db: Session, dept_id: int) -> Dict[str, Any]:
    """
    Generates academic analytics dashboard data for a department.
    """
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        return {}
        
    students = db.query(Student).filter(Student.department_id == dept_id).all()
    if not students:
        return {
            "department_name": dept.name,
            "department_code": dept.code,
            "total_students": 0,
            "pass_rate": 100.0,
            "avg_marks": 0.0,
            "backlog_clear_rate": 100.0,
            "health_score": 100.0
        }
        
    # Students count
    total_students = len(students)
    
    # Calculate pass rate and backlogs
    student_risks = [get_student_risk_score(db, s) for s in students]
    passed_students = sum(1 for r in student_risks if r["backlogs"] == 0)
    pass_rate = round((passed_students / total_students) * 100, 2)
    
    # Calculate average marks
    all_marks_objs = db.query(Mark).join(Student).filter(Student.department_id == dept_id).all()
    latest_marks = filter_latest_semester_marks(all_marks_objs)
    avg_marks = 0.0
    if latest_marks:
        # Normalize: if total_marks > 100, it's out of 200, so scale it down
        normalized_marks = [m.total_marks/2 if m.total_marks > 100 else m.total_marks for m in latest_marks]
        avg_marks = round(sum(normalized_marks) / len(normalized_marks), 2)
        
    # Calculate backlog clearing rate
    # Find all subjects where a student failed historically
    historical_failures = db.query(Mark.usn, Mark.subject_code).join(Student).filter(
        Student.department_id == dept_id, Mark.result == "F"
    ).distinct().all()
    
    backlog_clear_rate = 85.0  # default baseline if no failures
    if historical_failures:
        cleared_count = 0
        for usn, subj_code in historical_failures:
            # Check if there is a later 'P' for this subject
            cleared = db.query(Mark).filter(
                Mark.usn == usn,
                Mark.subject_code == subj_code,
                Mark.result == "P"
            ).first()
            if cleared:
                cleared_count += 1
        backlog_clear_rate = round((cleared_count / len(historical_failures)) * 100, 2)
        
    health_score = get_academic_health_score(pass_rate, avg_marks, backlog_clear_rate)
    
    # Risk breakdown
    risk_counts = {"Low Risk": 0, "Medium Risk": 0, "High Risk": 0, "Critical": 0}
    for r in student_risks:
        risk_counts[r["status"]] = risk_counts.get(r["status"], 0) + 1
        
    return {
        "department_name": dept.name,
        "department_code": dept.code,
        "total_students": total_students,
        "pass_rate": pass_rate,
        "avg_marks": avg_marks,
        "backlog_clear_rate": backlog_clear_rate,
        "health_score": health_score,
        "risk_breakdown": risk_counts
    }

def get_institution_analytics(db: Session) -> Dict[str, Any]:
    """
    Generates institution-wide analytics dashboard data (Principal / VP view).
    """
    departments = db.query(Department).all()
    dept_stats = []
    
    total_students = 0
    passed_students = 0
    total_marks_list = []
    
    all_historical_failures = db.query(Mark.usn, Mark.subject_code, Mark.result).all()
    # Backlog clear rate calculation institution-wide (order-independent)
    failures = set(
        (usn, subj) for usn, subj, res in all_historical_failures if res == "F"
    )
    passes_after_failures = set(
        (usn, subj) for usn, subj, res in all_historical_failures if res == "P" and (usn, subj) in failures
    )
                
    backlog_clear_rate = 85.0
    if failures:
        backlog_clear_rate = round((len(passes_after_failures) / len(failures)) * 100, 2)
        
    for d in departments:
        stats = get_department_analytics(db, d.id)
        if stats:
            dept_stats.append(stats)
            total_students += stats["total_students"]
            passed_students += int(stats["total_students"] * (stats["pass_rate"] / 100))
            # Get raw marks for average (filtering for latest attempts)
            dept_marks = db.query(Mark).join(Student).filter(Student.department_id == d.id).all()
            latest_dept_marks = filter_latest_semester_marks(dept_marks)
            total_marks_list.extend([m.total_marks/2 if m.total_marks > 100 else m.total_marks for m in latest_dept_marks])
            
    inst_pass_rate = round((passed_students / total_students) * 100, 2) if total_students > 0 else 100.0
    inst_avg_marks = round(sum(total_marks_list) / len(total_marks_list), 2) if total_marks_list else 0.0
    inst_health_score = get_academic_health_score(inst_pass_rate, inst_avg_marks, backlog_clear_rate)
    
    # Aggregated backlog and risk trend
    critical_alerts = db.query(Student).filter(Student.status == "critical").count()
    
    return {
        "institution_name": "BLDEA's V. P. Dr. P. G. Halakatti College of Engineering",
        "total_students": total_students,
        "pass_rate": inst_pass_rate,
        "avg_marks": inst_avg_marks,
        "backlog_clear_rate": backlog_clear_rate,
        "health_score": inst_health_score,
        "critical_alerts": critical_alerts,
        "departments": dept_stats
    }

def get_faculty_analytics(db: Session, faculty_user_id: int) -> Dict[str, Any]:
    """
    Generates dashboard metrics for a Faculty member.
    """
    faculty = db.query(User).filter(User.id == faculty_user_id, User.role == "Faculty").first()
    if not faculty:
        return {}
        
    # Get subjects assigned to this faculty
    assignments = db.query(FacultySubject).filter(FacultySubject.faculty_user_id == faculty_user_id).all()
    
    subject_stats = []
    total_passed = 0
    total_appeared = 0
    total_marks_sum = 0
    
    for assign in assignments:
        all_marks = db.query(Mark).filter(Mark.subject_code == assign.subject_code).all()
        if not all_marks:
            continue
            
        # Group by USN to keep only the latest attempt
        latest_marks = {}
        for m in all_marks:
            if m.usn not in latest_marks or (m.exam_date or "") > (latest_marks[m.usn].exam_date or ""):
                latest_marks[m.usn] = m
            elif (m.exam_date or "") == (latest_marks[m.usn].exam_date or "") and m.id > latest_marks[m.usn].id:
                latest_marks[m.usn] = m
        
        marks_list = list(latest_marks.values())
        appeared = len(marks_list)
        passed = sum(1 for m in marks_list if m.result == "P")
        subj_pass_rate = round((passed / appeared) * 100, 2) if appeared > 0 else 100.0
        
        normalized_marks = [m.total_marks/2 if m.total_marks > 100 else m.total_marks for m in marks_list]
        subj_avg_marks = round(sum(normalized_marks) / appeared, 2) if appeared > 0 else 0.0
        
        subject_stats.append({
            "subject_code": assign.subject_code,
            "subject_name": assign.subject.name if assign.subject else "Unknown",
            "semester": assign.semester,
            "appeared": appeared,
            "passed": passed,
            "pass_rate": subj_pass_rate,
            "avg_marks": subj_avg_marks
        })
        
        total_passed += passed
        total_appeared += appeared
        total_marks_sum += sum(normalized_marks)
        
    overall_pass_rate = round((total_passed / total_appeared) * 100, 2) if total_appeared > 0 else 100.0
    overall_avg_marks = round(total_marks_sum / total_appeared, 2) if total_appeared > 0 else 0.0
    
    # Get students assigned to this advisor
    advisor_students = db.query(Student).join(StudentAdvisor).filter(StudentAdvisor.faculty_user_id == faculty_user_id).all()
    assigned_students_list = []
    
    for s in advisor_students:
        risk_info = get_student_risk_score(db, s)
        assigned_students_list.append({
            "usn": s.usn,
            "name": s.name,
            "semester": s.current_sem,
            "backlogs": risk_info["backlogs"],
            "risk_status": risk_info["status"]
        })
        
    return {
        "faculty_name": faculty.full_name,
        "overall_pass_rate": overall_pass_rate,
        "overall_avg_marks": overall_avg_marks,
        "assigned_subjects": subject_stats,
        "assigned_students": assigned_students_list
    }
