from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Counter, Personnel, User
from app.schemas.personnel import (
    PersonnelCreate,
    PersonnelOut,
    PersonnelUpdate,
    StaffAccountCreate,
)
from app.utils.security import hash_password

router = APIRouter(prefix="/personnel", tags=["personnel"])


def _owned_personnel(db: Session, institution_id: int, personnel_id: int) -> Personnel:
    personnel = db.get(Personnel, personnel_id)
    if personnel is None or personnel.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personnel not found")
    return personnel


def _owned_counter(db: Session, institution_id: int, counter_id: int) -> None:
    counter = db.get(Counter, counter_id)
    if counter is None or counter.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")


@router.get("", response_model=list[PersonnelOut])
def list_personnel(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Personnel]:
    return (
        db.execute(
            select(Personnel)
            .where(Personnel.institution_id == user.institution_id)
            .order_by(Personnel.id)
        )
        .scalars()
        .all()
    )


@router.post("", response_model=PersonnelOut, status_code=status.HTTP_201_CREATED)
def create_personnel(
    payload: PersonnelCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    if payload.counter_id is not None:
        _owned_counter(db, user.institution_id, payload.counter_id)
    personnel = Personnel(
        institution_id=user.institution_id,
        name=payload.name,
        title=payload.title,
        counter_id=payload.counter_id,
        user_id=payload.user_id,
    )
    db.add(personnel)
    db.commit()
    db.refresh(personnel)
    return personnel


@router.patch("/{personnel_id}", response_model=PersonnelOut)
def update_personnel(
    personnel_id: int,
    payload: PersonnelUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    if payload.counter_id is not None:
        _owned_counter(db, user.institution_id, payload.counter_id)
    elif payload.counter_id is None and "counter_id" in payload.model_fields_set:
        personnel.counter_id = None
    if payload.name is not None:
        personnel.name = payload.name
    if payload.title is not None:
        personnel.title = payload.title
    if payload.is_active is not None:
        personnel.is_active = payload.is_active
    db.commit()
    db.refresh(personnel)
    return personnel


@router.delete("/{personnel_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_personnel(
    personnel_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    personnel.is_active = False
    db.commit()


@router.post("/{personnel_id}/activate", response_model=PersonnelOut)
def activate_personnel(
    personnel_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    personnel.is_active = True
    db.commit()
    db.refresh(personnel)
    return personnel


@router.post("/{personnel_id}/account", response_model=PersonnelOut, status_code=status.HTTP_201_CREATED)
def create_staff_account(
    personnel_id: int,
    payload: StaffAccountCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    """Create a staff login and link it to a personnel record."""
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    if not personnel.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Activate the personnel record first",
        )
    if personnel.user_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This staff member already has a login account",
        )
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )
    staff_user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=personnel.name,
        role="staff",
        institution_id=user.institution_id,
    )
    db.add(staff_user)
    db.flush()
    personnel.user_id = staff_user.id
    db.commit()
    db.refresh(personnel)
    return personnel