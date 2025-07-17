# Файл: backend/auth/auth_dependencies.py (С ИСПРАВЛЕННЫМ ИМПОРТОМ)

from fastapi import Depends, HTTPException, status
from typing import Annotated

from . import auth_models
# --- ИЗМЕНЕННЫЙ ИМПОРТ ---
# Указываем полный путь от корня 'backend'
from auth.auth_security import get_current_user

async def require_admin_user(
    current_user: Annotated[auth_models.User, Depends(get_current_user)]
) -> auth_models.User:
    """
    Зависимость FastAPI, которая проверяет, что текущий пользователь
    является администратором.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required",
        )
    return current_user