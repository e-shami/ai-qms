from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PersonnelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    title: str | None = Field(default=None, max_length=128)
    counter_id: int | None = None
    # When present, a staff login (role="staff" User) is created and linked
    # atomically. The link can never be supplied as a raw user id — that
    # would allow pointing a personnel record at an arbitrary account.
    account_email: EmailStr | None = None
    account_password: str | None = Field(default=None, min_length=8, max_length=128)


class StaffAccountCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class SetLoginRequest(BaseModel):
    enabled: bool


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
    work_status: str
    counter_id: int | None
    user_id: int | None
    is_active: bool
    created_at: datetime
