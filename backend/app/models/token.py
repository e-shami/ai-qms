from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import utcnow


class TokenStatus(str, enum.Enum):
    WAITING = "waiting"
    CALLED = "called"
    IN_SERVICE = "in_service"
    SERVED = "served"
    NO_SHOW = "no_show"


class Token(Base):
    __tablename__ = "tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    counter_id: Mapped[int] = mapped_column(
        ForeignKey("counters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_number: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[TokenStatus] = mapped_column(
        Enum(TokenStatus, name="token_status"), nullable=False, default=TokenStatus.WAITING
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    institution: Mapped["Institution"] = relationship()
    counter: Mapped["Counter"] = relationship()