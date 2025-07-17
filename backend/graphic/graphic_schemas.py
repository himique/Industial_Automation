# Файл: backend/graphic/graphic_schemas.py (ФИНАЛЬНАЯ ВЕРСИЯ С ALIAS)

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, computed_field, Field
import os

# --- ФУНКЦИЯ ДЛЯ ПРЕОБРАЗОВАНИЯ ИМЕН ---
def to_camel(string: str) -> str:
    """Преобразует snake_case в camelCase."""
    parts = string.split('_')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])

# --- ОБЩАЯ КОНФИГУРАЦИЯ ---
# from_attributes=True - Читать из ORM-объектов
# alias_generator=to_camel - Генерировать camelCase псевдонимы для JSON
# populate_by_name=True - Разрешить заполнять и по имени, и по псевдониму
orm_alias_config = ConfigDict(
    from_attributes=True,
    alias_generator=to_camel,
    populate_by_name=True
)


class Component(BaseModel):
    # Имена полей теперь snake_case, как в ORM-модели
    id: int
    name: str
    mesh_id: str

    model_config = orm_alias_config # <-- Применяем конфиг

class AssemblyStep(BaseModel):
    id: int
    step_number: int
    action_type: str
    component: Component

    model_config = orm_alias_config # <-- Применяем конфиг

class Product(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    model_path: Optional[str] = None

    @computed_field(alias="modelUrl") # Указываем camelCase alias для вычисляемого поля
    @property
    def model_url(self) -> Optional[str]:
        if self.model_path:
            # os.path.join создает путь вида 'static/models/product_1.glb'
            return os.path.join('static', 'models', self.model_path).replace('\\', '/')
        return None

    model_config = orm_alias_config # <-- Применяем конфиг

class AssemblyPlan(BaseModel):
    id: int
    name: str
    product: Product
    steps: List[AssemblyStep]

    model_config = orm_alias_config # <-- Применяем конфиг


# --- СХЕМЫ ДЛЯ ВХОДНЫХ ДАННЫХ ---
# Для них псевдонимы не нужны
class ComponentInput(BaseModel):
    product_id: int
    name: str
    mesh_id: str

class AssemblyStepInput(BaseModel):
    component_id: int
    step_number: int