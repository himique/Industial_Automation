# Файл: backend/auth/auth_permissions.py

import strawberry
from strawberry.permission import BasePermission
from strawberry.types import Info
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from . import auth_crud # импортируем crud-функции
from core.config import settings

class IsAdmin(BasePermission):
    message = "Administrator privileges are required for this action."

    # Strawberry вызовет этот метод для проверки прав
    async def has_permission(self, source: Any, info: Info, **kwargs) -> bool:
        request = info.context.get("request")
        if not request:
            return False

        token = request.cookies.get("access_token_cookie")

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            username: Optional[str] = payload.get("sub")
            if username is None:
                return False
        except JWTError:
            return False
            
        db_session: AsyncSession = info.context.get("db")
        if not db_session:
            return False # Если нет сессии, нет и доступа
            
        user = await auth_crud.get_user_by_username(db_session, username=username)

        # Проверяем, что пользователь существует, активен и является админом
        if user and user.is_active and user.is_admin: # или user.is_admin
            return True
        
        return False