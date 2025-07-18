# Файл: backend/auth/auth_crud.py (ПРАВИЛЬНАЯ ВЕРСИЯ)

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from . import auth_models
from core.config import settings

# Контекст для хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяет, совпадает ли обычный пароль с хешированным."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Возвращает хеш пароля."""
    return pwd_context.hash(password)

async def get_user_by_username(db: AsyncSession, username: str) -> Optional[auth_models.User]:
    """Получает пользователя из БД по имени пользователя."""
    stmt = select(auth_models.User).where(auth_models.User.username == username)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создает JWT токен."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_token_from_cookie(request: Request) -> str:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return token

def get_username_from_token(token: str) -> Optional[str]:
    """
    Декодирует JWT токен и возвращает имя пользователя (sub).
    Возвращает None, если токен недействителен или истек.
    """
    # В cookie мы сохраняли токен в формате "Bearer <token>"
    # Нужно сначала убрать префикс
    if token.startswith("Bearer "):
        token = token.split(" ")[1]
        
    try:
        # Декодируем токен с теми же параметрами, что и при создании
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM]
        )
        
        # Извлекаем "subject" (имя пользователя) из данных токена
        username: Optional[str] = payload.get("sub")
        
        if username is None:
            return None # В токене нет поля 'sub'
            
        return username
        
    except JWTError:
        # Исключение JWTError возникает, если токен:
        # - недействителен (неверная подпись)
        # - просрочен (истек срок действия 'exp')
        # - имеет неверный формат
        return None
    
