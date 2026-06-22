from sqlalchemy import Column, Integer, String, ForeignKey, Float, Table
from sqlalchemy.orm import relationship
from app.db.session import Base

class Department(Base):
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)  # e.g., CI, CS, ME, EC
    
    users = relationship("User", back_populates="department")
    students = relationship("Student", back_populates="department")
    subjects = relationship("Subject", back_populates="department")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # Principal, Vice Principal, HOD, Faculty, Student
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    
    department = relationship("Department", back_populates="users")
    
    # Assignments if HOD/Faculty
    faculty_subjects = relationship("FacultySubject", back_populates="faculty")
    assigned_students = relationship("StudentAdvisor", back_populates="faculty")

class Student(Base):
    __tablename__ = "students"
    
    usn = Column(String, primary_key=True, index=True)  # e.g., 2BL21CI006
    name = Column(String, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    current_sem = Column(Integer, nullable=False)
    academic_year = Column(String, nullable=False)  # e.g., 2024-25
    status = Column(String, default="active")  # active, at_risk, critical
    
    department = relationship("Department", back_populates="students")
    marks = relationship("Mark", back_populates="student", cascade="all, delete-orphan")
    advisors = relationship("StudentAdvisor", back_populates="student", cascade="all, delete-orphan")

class Subject(Base):
    __tablename__ = "subjects"
    
    code = Column(String, primary_key=True, index=True)  # e.g., 21AI71, BCS501
    name = Column(String, nullable=False)
    credits = Column(Integer, default=3)
    semester = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)  # NULL if common subject
    
    department = relationship("Department", back_populates="subjects")
    marks = relationship("Mark", back_populates="subject")
    faculty_assignments = relationship("FacultySubject", back_populates="subject")

class Mark(Base):
    __tablename__ = "marks"
    
    id = Column(Integer, primary_key=True, index=True)
    usn = Column(String, ForeignKey("students.usn"), nullable=False)
    subject_code = Column(String, ForeignKey("subjects.code"), nullable=False)
    internal_marks = Column(Integer, nullable=False)
    external_marks = Column(Integer, nullable=False)
    total_marks = Column(Integer, nullable=False)
    result = Column(String, nullable=False)  # P or F
    exam_date = Column(String, nullable=True)  # e.g. 2025-02-12
    semester = Column(Integer, nullable=False)  # semester of the exam
    
    student = relationship("Student", back_populates="marks")
    subject = relationship("Subject", back_populates="marks")

class FacultySubject(Base):
    __tablename__ = "faculty_subjects"
    
    id = Column(Integer, primary_key=True, index=True)
    faculty_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subject_code = Column(String, ForeignKey("subjects.code"), nullable=False)
    semester = Column(Integer, nullable=False)
    academic_year = Column(String, nullable=False)
    
    faculty = relationship("User", back_populates="faculty_subjects")
    subject = relationship("Subject", back_populates="faculty_assignments")

class StudentAdvisor(Base):
    __tablename__ = "student_advisors"
    
    id = Column(Integer, primary_key=True, index=True)
    faculty_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    usn = Column(String, ForeignKey("students.usn"), nullable=False)
    
    faculty = relationship("User", back_populates="assigned_students")
    student = relationship("Student", back_populates="advisors")
