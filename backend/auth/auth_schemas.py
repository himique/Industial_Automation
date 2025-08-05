from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator, Field, ValidationInfo
from typing import List, Optional

class Token(BaseModel):
    access_token: str
    token_type: str
    
class User (BaseModel):
    id:int
    username: str
    is_admin: bool
    is_active: bool