from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.db.models import User, Department
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str  # Principal, Vice Principal, HOD, Faculty, Student
    department_code: Optional[str] = None
    email: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str
    full_name: str
    department_code: Optional[str] = None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials
    username = decode_access_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
        
    dept_code = None
    if user.department:
        dept_code = user.department.code
        
    token = create_access_token(subject=user.username)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "full_name": user.full_name,
        "department_code": dept_code
    }

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.username == data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    # Find department if code provided
    dept_id = None
    if data.department_code:
        dept = db.query(Department).filter(Department.code == data.department_code.upper()).first()
        if not dept:
            raise HTTPException(status_code=404, detail=f"Department code '{data.department_code}' not found")
        dept_id = dept.id
        
    hashed = get_password_hash(data.password)
    new_user = User(
        username=data.username,
        hashed_password=hashed,
        role=data.role,
        full_name=data.full_name,
        email=data.email,
        department_id=dept_id
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully", "username": new_user.username}

@router.get("/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    dept_code = current_user.department.code if current_user.department else None
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "department_code": dept_code
    }
