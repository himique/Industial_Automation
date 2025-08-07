# Файл: backend/graphic/graphic_router.py

from typing import List, Optional, Dict, Any, AsyncGenerator
import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.experimental.pydantic import type as pydantic_type
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response
import dataclasses
# --- ЗАВИСИМОСТИ И МОДЕЛИ ---
from dependencies import get_db
from auth import auth_permissions
from . import graphic_schemas as schemas
from . import graphic_crud as crud

# --- GraphQL ТИПЫ (определяются из Pydantic-схем) ---
@pydantic_type(model=schemas.Component, all_fields=True)
class ComponentType: pass

@pydantic_type(model=schemas.AssemblyStep, all_fields=True)
class AssemblyStepType: pass

@pydantic_type(model=schemas.Product, all_fields=True)
class ProductType: pass

@pydantic_type(model=schemas.AssemblyPlan, all_fields=True)
class AssemblyPlanType: pass

# --- GraphQL ТИПЫ ДЛЯ ВВОДА ---
@strawberry.input
class ComponentInput:
    product_id: int
    name: str
    mesh_id: str

@strawberry.input
class AssemblyStepInput:
    component_id: int
    step_number: int
    action_type: str
    
# --- КОРНЕВЫЕ ЗАПРОСЫ (Query) ---
# (Без изменений)
@strawberry.type
class Query:
    @strawberry.field
    async def assembly_plan(self, product_id: int, info: strawberry.Info) -> Optional[AssemblyPlanType]:
        db: AsyncSession = info.context["db"]
        return await crud.get_full_assembly_plan_orm(db, product_id=product_id)

    @strawberry.field
    async def assembly_plan_by_computer_name(self, computer_name: str, info: strawberry.Info) -> Optional[AssemblyPlanType]:
        db: AsyncSession = info.context["db"]
        product_id = await crud.get_product_id_by_computer_name_orm(db, computer_name=computer_name)
        if not product_id:
            return None
        return await crud.get_full_assembly_plan_orm(db, product_id=product_id)
    
    @strawberry.field(permission_classes=[auth_permissions.IsAdmin])
    async def all_products(self, info: strawberry.Info) -> List[ProductType]:
        db: AsyncSession = info.context["db"]
        products_orm = await crud.get_all_products_orm(db)
        plan_pydantic = [schemas.Product.model_validate(product) for product in products_orm]
        # И возвращаем именно его!
        return plan_pydantic
    
    @strawberry.field(permission_classes=[auth_permissions.IsAdmin])
    async def product_by_id(self, productId: strawberry.ID, info: strawberry.Info) -> Optional[ProductType]:
        db: AsyncSession = info.context["db"]
        
        products_orm = await crud.get_product_by_id_orm(db, product_id=int(productId))
        plan_pydantic = schemas.Product.model_validate(products_orm)    
        # И возвращаем именно его!
        return plan_pydantic

# --- МУТАЦИИ (Mutation) - ПОЛНАЯ ВЕРСИЯ ---
@strawberry.type
class Mutation:
    @strawberry.field(permission_classes=[auth_permissions.IsAdmin])
    async def create_product(self, name: str, description: str, info: strawberry.Info) -> ProductType:
        """Создает новый продукт."""
        db: AsyncSession = info.context["db"]
        products_orm = await crud.create_product_orm(db, name=name, description=description)
        plan_pydantic = schemas.Product.model_validate(products_orm)
        # И возвращаем именно его!
        return plan_pydantic
    @strawberry.field(permission_classes=[auth_permissions.IsAdmin])
    async def add_component(self, component: ComponentInput, info: strawberry.Info) -> ComponentType:
        """Добавляет новый компонент к продукту."""
        db: AsyncSession = info.context["db"]
        # Преобразуем Strawberry Input в Pydantic схему для передачи в CRUD
        products_orm = await crud.add_component_orm(db, component)
        return schemas.Component.model_validate(products_orm)
    
    @strawberry.field(permission_classes=[auth_permissions.IsAdmin])
    async def create_assembly_plan(self, product_id: int, name: str, steps: List[AssemblyStepInput], info: strawberry.Info) -> AssemblyPlanType:
        """Создает или перезаписывает план сборки для продукта."""
        db: AsyncSession = info.context["db"]
        # Преобразуем список Strawberry Input в список Pydantic схем
        steps_pydantic = [schemas.AssemblyStepInput.model_validate(dataclasses.asdict(step)) for step in steps]
        
        # Вызываем CRUD-функцию, которая выполнит все в одной транзакции
        new_plan = await crud.create_assembly_plan_orm(db, product_id, name, steps_pydantic)
        
        # Чтобы вернуть полный план, нам нужно подгрузить его заново с `selectinload`
        return await crud.get_full_assembly_plan_orm(db, product_id=new_plan.product_id)


# --- НАСТРОЙКА GraphQL ROUTER (без изменений) ---

async def get_context(request: Request, response: Response) -> AsyncGenerator[Dict[str, Any], None]:
    async for db_session in get_db():
        yield { "request": request, "response": response, "db": db_session }

schema = strawberry.Schema(query=Query, mutation=Mutation)

# Экспортируем готовый роутер для использования в main.py
router = GraphQLRouter(schema, context_getter=get_context, graphiql=True)