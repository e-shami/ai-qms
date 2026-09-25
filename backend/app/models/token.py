from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import utcnow


class TokenStatus(str, enum.Enum):
    WAITING = "waiting"
    CALLED = "called"
    IN_SERVICE = "in_service"
    SERVED = "served"
    NO_SHOW = "no_show"
    DECLINED = "declined"


class Token(Base):
    __tablename__ = "tokens"
    __table_args__ = (
        CheckConstraint("customer_cnic IS NULL OR customer_cnic ~ '^[0-9]{13}$'", name="ck_tokens_cnic").ddl_if(dialect="postgresql"),
        CheckConstraint("referral_source IS NULL OR referral_source IN ('website', 'institution', 'other')", name="ck_tokens_referral_source"),
        CheckConstraint("(referral_source IS NOT NULL AND referral_source = 'other' AND referral_organization IS NOT NULL AND length(trim(referral_organization)) > 0) OR ((referral_source IS NULL OR referral_source <> 'other') AND referral_organization IS NULL)", name="ck_tokens_referral_organization"),
        CheckConstraint("requested_priority IN ('normal', 'accessibility')", name="ck_tokens_requested_priority"),
        CheckConstraint("effective_priority IN ('normal', 'accessibility')", name="ck_tokens_effective_priority"),
        CheckConstraint("(requested_priority = 'normal' AND priority_reason IS NULL) OR (requested_priority = 'accessibility' AND priority_reason IS NOT NULL AND priority_reason IN ('elderly', 'disability'))", name="ck_tokens_priority_reason"),
        CheckConstraint("priority_review IN ('not_requested', 'pending', 'approved', 'rejected', 'normal')", name="ck_tokens_priority_review"),
        CheckConstraint("effective_priority = 'normal' OR (requested_priority = 'accessibility' AND priority_review = 'approved')", name="ck_tokens_priority_approval"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    counter_id: Mapped[int] = mapped_column(
        ForeignKey("counters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_number: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    customer_cnic: Mapped[str | None] = mapped_column(String(13), nullable=True)
    referral_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    referral_organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requested_priority: Mapped[str] = mapped_column(String(32), default="normal", server_default="normal")
    effective_priority: Mapped[str] = mapped_column(String(32), default="normal", server_default="normal")
    priority_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    priority_review: Mapped[str] = mapped_column(String(32), default="not_requested", server_default="not_requested")
    priority_reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    priority_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TokenStatus] = mapped_column(
        Enum(TokenStatus, name="token_status"), nullable=False, default=TokenStatus.WAITING
    )
    decline_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    served_by_personnel_id: Mapped[int | None] = mapped_column(
        ForeignKey("personnel.id", ondelete="SET NULL"), nullable=True
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    institution: Mapped["Institution"] = relationship()
    counter: Mapped["Counter"] = relationship()
    served_by: Mapped["Personnel"] = relationship()
