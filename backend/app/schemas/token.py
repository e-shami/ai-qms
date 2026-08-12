from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.token import TokenStatus


class TokenCreate(BaseModel):
    counter_id: int
    customer_name: str | None = Field(default=None, max_length=255)


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
    customer_name: str | None
    status: TokenStatus
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None
    counter_id: int
    position: int | None = None