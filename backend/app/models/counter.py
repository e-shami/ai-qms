from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import utcnow


class Counter(Base):
    __tablename__ = "counters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    # CV Integration fields
    cv_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cv_queue_length: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cv_service_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cv_estimated_wait_min: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cv_last_update: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    camera_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    roi_polygon: Mapped[str | None] = mapped_column(String, nullable=True)  # GeoJSON

    institution: Mapped["Institution"] = relationship(back_populates="counters")