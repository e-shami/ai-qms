from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InstitutionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)


class InstitutionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, max_length=64)
    whatsapp_number: str | None = Field(default=None, max_length=32)


class PurgeRequest(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=255)


class InstitutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    type: str | None
    whatsapp_number: str | None
    is_active: bool
    created_at: datetime


class PublicInstitutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str | None
    whatsapp_number: str | None