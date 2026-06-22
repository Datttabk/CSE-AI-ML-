import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "EduInsight Academic Analytics Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkeyforjwttokeneduinsight")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./eduinsight.db")
    
    # Playwright Settings
    PLAYWRIGHT_HEADLESS: bool = True
    
    class Config:
        case_sensitive = True

settings = Settings()
