# Файл: backend/graphic/graphic_crud_orm.py

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload

# Импортируем наши ORM-модели и Pydantic-схемы (для инпутов)
from . import graphic_models as models
from . import graphic_schemas as schemas

# --- Функции чтения (Read) ---
async def get_all_products_orm(db: AsyncSession) -> List[models.Product]:
    
    stmt = select(models.Product).order_by(models.Product.name)
    result = await db.execute(stmt)
    return result.scalars().all()
    
async def get_product_by_id_orm(db: AsyncSession, product_id: int) -> Optional[schemas.Product]:
    
    stmt = select(models.Product).where(models.Product.id == product_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def get_product_id_by_computer_name_orm(db: AsyncSession, computer_name: str) -> Optional[int]:
    
    stmt = select(models.Workstation.product_id).where(models.Workstation.computer_name.ilike(computer_name))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def get_full_assembly_plan_orm(db: AsyncSession, product_id: int) -> Optional[schemas.AssemblyPlan]:
    """
    Собирает полный план сборки по ID продукта и возвращает его
    как ОБЫЧНЫЙ СЛОВАРЬ, а не ORM-объект.
    """
    
    stmt = (
        select(models.AssemblyPlan)
        .where(models.AssemblyPlan.product_id == product_id)
        .options(
            selectinload(models.AssemblyPlan.steps).selectinload(models.AssemblyStep.component),
            selectinload(models.AssemblyPlan.product)
        )
    )
    result = await db.execute(stmt)
    # Получаем ORM-объект, как и раньше
    plan_orm = result.scalar_one_or_none()

    if not plan_orm:
        return None

    # --- ВОТ КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ---
    # Мы не возвращаем `plan_orm` напрямую.
    # Вместо этого мы используем Pydantic-схему, чтобы превратить его в словарь.
    
    # 1. Создаем Pydantic-объект из ORM-объекта (этот шаг у вас и падал)
    plan_pydantic = schemas.AssemblyPlan.model_validate(plan_orm)
    
    
    # И возвращаем именно его!
    return plan_pydantic


# --- Функции создания и обновления (Create/Update) ---
async def create_product_orm(db: AsyncSession, name: str, description: str) -> models.Product:
    # ... (код без изменений)
    new_product = models.Product(name=name, description=description)
    db.add(new_product)
    await db.commit()
    await db.refresh(new_product)
    return new_product
# --- File updload
async def update_product_model_path_orm(db: AsyncSession, product_id: int, relative_path_for_db: str) -> models.Product:
    # ... (код без изменений)
    stmt_update = update(models.Product).where(models.Product.id == product_id).values(model_path=relative_path_for_db)
    await db.execute(stmt_update)
    await db.commit()
    return stmt_update

async def add_component_orm(db: AsyncSession, component_data: schemas.ComponentInput) -> models.Component:
    """Добавляет новый компонент к продукту."""
    new_component = models.Component(
        product_id=component_data.product_id,
        name=component_data.name,
        mesh_id=component_data.mesh_id
    )
    db.add(new_component)
    await db.commit()
    await db.refresh(new_component)
    return new_component

async def create_assembly_plan_orm(db: AsyncSession, product_id: int, name: str, steps_data: List[schemas.AssemblyStepInput]) -> models.AssemblyPlan:
    """Создает полный план сборки с шагами в одной транзакции."""
    
    # 1. Удаляем старый план, если он существует, чтобы избежать дубликатов
    stmt_delete = delete(models.AssemblyPlan).where(models.AssemblyPlan.product_id == product_id)
    await db.execute(stmt_delete)
    
    # 2. Создаем новый план
    new_plan = models.AssemblyPlan(product_id=product_id, name=name)
    db.add(new_plan)
    
    # 3. Создаем шаги и привязываем их к новому плану.
    #    Мы еще не коммитили, поэтому у new_plan нет ID, но SQLAlchemy
    #    сам разберется со связями при коммите.
    for step_input in steps_data:
        new_step = models.AssemblyStep(
            plan=new_plan, # Привязываем к объекту плана
            component_id=step_input.component_id,
            step_number=step_input.step_number,
            action_type=step_input.action_type # Пример значения по умолчанию
        )
        db.add(new_step)

    await db.commit()
    await db.refresh(new_plan) # Обновляем, чтобы получить ID и связанные объекты
    return new_plan