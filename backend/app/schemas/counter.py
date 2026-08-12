from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CounterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    type: str | None = Field(default=None, max_length=64)


class CounterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class CounterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str | None
    is_active: bool
    created_at: datetime