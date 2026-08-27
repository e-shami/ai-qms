from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Institution, User
from app.schemas.institution import InstitutionOut, InstitutionUpdate, PurgeRequest

router = APIRouter(prefix="/institutions", tags=["institutions"])


def _own_institution(user: User, db: Session) -> Institution:
    institution = db.get(Institution, user.institution_id)
    if institution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institution not found",
        )
    return institution


@router.get("/me", response_model=InstitutionOut)
def get_own_institution(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Institution:
    return _own_institution(user, db)


@router.patch("/me", response_model=InstitutionOut)
def update_own_institution(
    payload: InstitutionUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Institution:
    institution = _own_institution(user, db)
    if payload.name is not None:
        institution.name = payload.name
    if payload.type is not None or "type" in payload.model_fields_set:
        institution.type = payload.type
    if payload.whatsapp_number is not None or "whatsapp_number" in payload.model_fields_set:
        institution.whatsapp_number = payload.whatsapp_number
    db.commit()
    db.refresh(institution)
    return institution


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_own_institution(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    institution = _own_institution(user, db)
    institution.is_active = False
    db.commit()


@router.post("/me/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_own_institution(
    payload: PurgeRequest,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    """Permanent delete. FK cascades remove counters, tokens, personnel,
    and every account — sessions die on their next request."""
    institution = _own_institution(user, db)
    if payload.confirm_name.strip() != institution.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation text does not match the institution name",
        )
    # A Core-level DELETE skips ORM relationship handling and lets every
    # ON DELETE rule on the foreign keys resolve in one statement.
    db.execute(sa_delete(Institution).where(Institution.id == institution.id))
    db.commit()