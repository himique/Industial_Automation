
# --- ИМПОРТЫ ИЗ FASTAPI ---
from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer

# --- ИМПОРТЫ ИЗ ДРУГИХ БИБЛИОТЕК ---
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError
from passlib.context import CryptContext
from typing import Optional, Annotated

# --- ИМПОРТЫ ИЗ ВАШЕГО ПРОЕКТА ---
from core.config import settings
from dependencies import get_db
from . import auth_models, auth_crud

# Контекст для хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Схема OAuth2 для автоматической документации FastAPI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# --- ФУНКЦИИ (остаются без изменений) ---
def get_token_from_cookie(
    access_token_cookie: Annotated[Optional[str], Cookie()] = None
) -> Optional[str]:
    """Зависимость, которая просто извлекает значение из cookie."""
    return access_token_cookie

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> auth_models.User:
    """Зависимость FastAPI: декодирует токен и возвращает пользователя из БД."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    if token is None:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = await auth_crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception

    return user

async def get_current_active_user(
    current_user: Annotated[auth_models.User, Depends(get_current_user)]
) -> auth_models.User:
    """Зависимость FastAPI: проверяет, что пользователь из токена активен."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user