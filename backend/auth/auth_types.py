import strawberry
from typing import Optional

# Этот декоратор превращает обычный класс в GraphQL-тип
@strawberry.type
class UserType:
    """
    GraphQL-представление пользователя.
    Содержит только те поля, которые безопасно отдавать на фронтенд.
    """
    id: int
    email: str
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False