from pydantic_settings import BaseSettings
from typing import ClassVar
import os
class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 4
    MODELS_DIR: str= 'static/models'
    os.makedirs(MODELS_DIR, exist_ok=True)
    DATABASE_URL: str
    class Config:
        env_file = ".env"

settings = Settings()