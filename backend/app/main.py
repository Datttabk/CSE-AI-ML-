import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import engine, Base, SessionLocal
from app.db.models import Department, User, Student, Subject, Mark, FacultySubject, StudentAdvisor
from app.core.security import get_password_hash
from app.routers import auth, upload, analytics, reports
from app.routers.upload import save_parsed_results, DEPT_MAP

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Automated Academic Analytics Platform for VTU Colleges",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(upload.router, prefix=settings.API_V1_STR)
app.include_router(analytics.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)

def seed_database(db: Session):
    # Proactively write .seeded sentinel if database already initialized to prevent re-seeding
    sentinel_file = os.path.join(os.path.dirname(__file__), ".seeded")
    principal_exists = db.query(User).filter(User.username == "principal").first()
    if principal_exists and not os.path.exists(sentinel_file):
        try:
            with open(sentinel_file, "w") as f:
                f.write("seeded")
        except Exception:
            pass

    # 1. Seed Departments
    seeded_depts = {}
    for code, name in DEPT_MAP.items():
        dept = db.query(Department).filter(Department.code == code).first()
        if not dept:
            dept = Department(name=name, code=code)
            db.add(dept)
            db.commit()
            db.refresh(dept)
        seeded_depts[code] = dept
        
    # 2. Seed Default Users for each role
    default_users = [
        {"username": "principal", "password": "principal123", "role": "Principal", "full_name": "Dr. Satish Kumar (Principal)", "dept": None},
        {"username": "viceprincipal", "password": "vp123", "role": "Vice Principal", "full_name": "Dr. Ramesh Patil (Vice Principal)", "dept": None},
        {"username": "hod_ci", "password": "hod123", "role": "HOD", "full_name": "Dr. Anand Joshi (HOD AI&ML)", "dept": "CI"},
        {"username": "hod_cs", "password": "hod123", "role": "HOD", "full_name": "Dr. Sanjay Pujar (HOD CSE)", "dept": "CS"},
        {"username": "faculty1", "password": "faculty123", "role": "Faculty", "full_name": "Prof. Bhavana (AI Faculty)", "dept": "CI"},
        {"username": "faculty2", "password": "faculty123", "role": "Faculty", "full_name": "Prof. Shridevi (CS Faculty)", "dept": "CS"},
        {"username": "student", "password": "student123", "role": "Student", "full_name": "ADITYA R HIREMATH (Student)", "dept": "CI"}
    ]
    
    seeded_faculty_ids = []
    
    for u_info in default_users:
        user = db.query(User).filter(User.username == u_info["username"]).first()
        if not user:
            dept_id = seeded_depts[u_info["dept"]].id if u_info["dept"] else None
            user = User(
                username=u_info["username"],
                hashed_password=get_password_hash(u_info["password"]),
                role=u_info["role"],
                full_name=u_info["full_name"],
                department_id=dept_id
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
        if user.role == "Faculty":
            seeded_faculty_ids.append(user.id)
            
    # 3. Seed Students and Marks from VTU_Results_All.csv if empty and not seeded before
    sentinel_file = os.path.join(os.path.dirname(__file__), ".seeded")
    student_count = db.query(Student).count()
    if student_count == 0 and not os.path.exists(sentinel_file):
        try:
            with open(sentinel_file, "w") as f:
                f.write("seeded")
        except Exception:
            pass
            
        csv_path = "VTU_Results_All.csv"
        if os.path.exists(csv_path):
            print("Seeding database with records from VTU_Results_All.csv...")
            try:
                import pandas as pd
                df = pd.read_csv(csv_path)
                
                # Group results by USN to import student-by-student
                grouped = df.groupby("USN")
                for usn, group in grouped:
                    student_rows = []
                    for _, row in group.iterrows():
                        student_rows.append([
                            row["USN"],
                            row["Student Name"],
                            row["Semester"],
                            row["Subject Code"],
                            row["Subject Name"],
                            row["Internal Marks"],
                            row["External Marks"],
                            row["Total Marks"],
                            row["Result"],
                            row["Date"]
                        ])
                    
                    # Allocate to first seeded faculty if CI department
                    fac_id = seeded_faculty_ids[0] if len(seeded_faculty_ids) > 0 and usn.upper().startswith("2BL21CI") else None
                    save_parsed_results(db, student_rows, faculty_id=fac_id)
                print("Seeding from CSV completed successfully!")
            except Exception as e:
                print(f"Error seeding database from CSV: {e}")
                
    # 4. Create sample Faculty-Subject associations if empty
    if db.query(FacultySubject).count() == 0 and len(seeded_faculty_ids) > 0:
        # Prof. Bhavana (AI Faculty) teaches 21AI71 and 21AI733
        subjects = ["21AI71", "21AI733", "BCS501"]
        for sub_code in subjects:
            subj = db.query(Subject).filter(Subject.code == sub_code).first()
            if subj:
                fs = FacultySubject(
                    faculty_user_id=seeded_faculty_ids[0],
                    subject_code=sub_code,
                    semester=subj.semester,
                    academic_year="2024-25"
                )
                db.add(fs)
        
        # Link advisor relationships
        ci_students = db.query(Student).filter(Student.usn.like("2BL%CI%")).all()
        for s in ci_students:
            existing = db.query(StudentAdvisor).filter(
                StudentAdvisor.faculty_user_id == seeded_faculty_ids[0],
                StudentAdvisor.usn == s.usn
            ).first()
            if not existing:
                advisor = StudentAdvisor(
                    faculty_user_id=seeded_faculty_ids[0],
                    usn=s.usn
                )
                db.add(advisor)
        
        db.commit()

@app.on_event("startup")
def on_startup():
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Seed
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "EduInsight Backend is running!", "docs": "/docs"}
