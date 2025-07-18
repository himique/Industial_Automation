from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import JSONResponse
from . import auth_schemas
from . import auth_crud
from dependencies import get_db
from core.config import settings # Импортируем настройки

app = APIRouter()

@app.post("/token", tags=["Authentication"]) 
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    
)-> dict:
    user = await auth_crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth_crud.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth_crud.create_access_token(data={"sub": user.username})
    content = {"message": "Login successful", "access_token": access_token, "token_type": "bearer"}
    response = JSONResponse(content=content)
    response.set_cookie(
        key="access_token", # Имя cookie
        value=access_token,
        httponly=True,   # <-- Самый важный флаг! Запрещает доступ из JS.
        samesite="lax",  # Рекомендуемая защита от CSRF. 'strict' более безопасен, но может ломать редиректы.
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, # Время жизни в секундах
        path="/",        # Cookie доступен для всего сайта
        secure=False,   # Включайте это, когда ваш сайт будет работать по HTTPS!
    )
    return response

@app.get("/token/me", tags=["Authentication"])
async def read_users_me(
    token: str = Depends(auth_crud.get_token_from_cookie), 
    db: AsyncSession = Depends(get_db)
):
    # У вас уже есть токен, теперь нужно его верифицировать и найти пользователя
    # Предполагается, что в auth_crud есть функция для этого
    username = auth_crud.get_username_from_token(token) # Эта функция должна обрабатывать исключения, если токен невалиден
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    user = await auth_crud.get_user_by_username(db, username=username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    return {"username": user.username}