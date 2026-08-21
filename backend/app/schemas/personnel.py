from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PersonnelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    title: str | None = Field(default=None, max_length=128)
    counter_id: int | None = None
    user_id: int | None = None


class PersonnelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    title: str | None = Field(default=None, max_length=128)
    counter_id: int | None = None
    is_active: bool | None = None


class PersonnelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    title: str | None
    counter_id: int | None
    user_id: int | None
    is_active: bool
    created_at: datetime