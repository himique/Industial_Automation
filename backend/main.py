# Файл: backend/main.py (ФИНАЛЬНАЯ, ПРАВИЛЬНАЯ ВЕРСИЯ)

import os
import shutil
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

# --- Импорты из вашего проекта ---
from core.config import settings
from database import engine, create_tables
from dependencies import get_db

# --- ПРАВИЛЬНЫЕ ИМПОРТЫ РОУТЕРОВ И ЗАВИСИМОСТЕЙ ---
# Мы импортируем объект 'router' из наших модулей-роутеров
from auth.auth_main import app as auth_api_router
from graphic.graphic_main import router as graphql_api_router # Предполагается, что вы переименовали crud в router
from graphic import graphic_crud
from auth.auth_dependencies import require_admin_user
from auth import auth_models, auth_permissions
 
# from graphic import graphic_crud_orm # Вам нужно будет создать этот модуль для ORM-функций

# --- LIFESPAN MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Lifespan: Startup...")
    await create_tables()
    os.makedirs(settings.MODELS_DIR, exist_ok=True)
    print("Lifespan: Startup complete.")
    yield
    print("Lifespan: Shutdown...")
    await engine.dispose()
    print("Lifespan: Shutdown complete.")

# --- FastAPI ПРИЛОЖЕНИЕ ---
app = FastAPI(title="Assembly Helper API", lifespan=lifespan)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ПОДКЛЮЧЕНИЕ РОУТЕРОВ ---
# 1. Подключаем REST API для аутентификации (/auth/token)
app.include_router(auth_api_router, prefix="/auth", tags=["Authentication"])

# 2. Подключаем GraphQL API (/graphql)
app.include_router(graphql_api_router, prefix="/graphql", tags=["GraphQL"])

# --- ОТДЕЛЬНЫЕ ЭНДПОИНТЫ ---
# Этот эндпоинт защищен и требует прав админа
@app.post("/upload-model/{product_id}", tags=["Editor Actions"])
async def upload_model(
    product_id: int,
    user: Annotated[auth_models.User, Depends(auth_permissions.IsAdmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Загружает файл 3D-модели для указанного продукта."""
    
    # Здесь должна быть ваша логика по проверке продукта и обновлению пути в БД.
    # Этот код - просто пример.
    # Сохраняем файл
    if (user):
        print(f"Upload model user is {user}")
        file_path = os.path.join(settings.MODELS_DIR, f"product_{product_id}.glb")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Формируем относительный путь для БД (без static/)
        relative_path_for_db = os.path.join("models", f"product_{product_id}.glb").replace('\\', '/')
    
    # TODO: Вызвать функцию для обновления model_path в БД
    # await graphic_crud_orm.update_product_model_path(db, product_id, relative_path_for_db)
        
    # Формируем относительный URL для ответа фронтенду (с static/)
        url_path_for_response = os.path.join("static", relative_path_for_db).replace('\\', '/')
        await graphic_crud.update_product_model_path_orm(db, product_id, f"/{url_path_for_response}")

        return {"filename": file.filename, "path": url_path_for_response}
    else:
        raise Exception("Acces denied. Admin privelege required")

# Монтируем статику в самом конце
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return {"message": "API is running. Go to /graphql to open the GraphQL interface."}