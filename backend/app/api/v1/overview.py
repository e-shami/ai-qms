from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database import get_db
from app.schemas.overview import AdminOverview
from app.services.overview_service import admin_overview

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/admin", response_model=AdminOverview)
def admin_dashboard(
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> AdminOverview:
    return admin_overview(db, user.institution_id, tz_offset_minutes)
