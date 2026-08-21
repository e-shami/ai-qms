from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.token import TokenStatus


class TokenCreate(BaseModel):
    counter_id: int
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=32)


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
    customer_name: str | None
    customer_phone: str | None
    status: TokenStatus
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None
    counter_id: int
    position: int | None = None


class TokenPage(BaseModel):
    items: list[TokenOut]
    total: int


class PublicTokenIssue(BaseModel):
    institution_id: int
    counter_id: int
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=32)


class PublicTicketOut(BaseModel):
    token_number: str
    status: TokenStatus
    counter_id: int
    counter_name: str
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None
    position: int | None = None
    people_ahead: int | None = None
    estimated_wait_min: float | None = None