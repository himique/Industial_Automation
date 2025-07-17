from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator, Field, ValidationInfo
from typing import List, Optional

class Token(BaseModel):
    access_token: str
    token_type: str