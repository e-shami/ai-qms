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
    ResetPasswordRequest,
    SetLoginRequest,
    StaffAccountCreate,
)
from app.services.broadcast import broadcast_all
from app.utils.security import hash_password

router = APIRouter(prefix="/personnel", tags=["personnel"])


def _owned_personnel(db: Session, institution_id: int, personnel_id: int) -> Personnel:
    personnel = db.get(Personnel, personnel_id)
    if personnel is None or personnel.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personnel not found")
    return personnel


def _owned_counter(db: Session, institution_id: int, counter_id: int | None) -> None:
    if counter_id is None:
        return
    counter = db.get(Counter, counter_id)
    if counter is None or counter.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Counter not found")


def _assign_counter(
    db: Session,
    personnel: Personnel,
    counter_id: int | None,
) -> None:
    if counter_id is None:
        personnel.counter_id = None
        return

    _owned_counter(db, personnel.institution_id, counter_id)
    counter = db.execute(
        select(Counter).where(Counter.id == counter_id).with_for_update()
    ).scalar_one()
    if not counter.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Counter is inactive")

    occupant = db.execute(
        select(Personnel).where(
            Personnel.institution_id == personnel.institution_id,
            Personnel.counter_id == counter.id,
            Personnel.is_active.is_(True),
            Personnel.work_status != "off_duty",
            Personnel.id != personnel.id,
        )
    ).scalars().first()
    if occupant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Counter in use by {occupant.name}",
        )
    personnel.counter_id = counter.id


def _ensure_email_free(db: Session, email: str) -> None:
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )


def _linked_account(db: Session, personnel: Personnel) -> User | None:
    if personnel.user_id is None:
        return None
    return db.get(User, personnel.user_id)


@router.get("", response_model=list[PersonnelOut])
def list_personnel(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PersonnelOut]:
    personnel = (
        db.execute(
            select(Personnel)
            .where(Personnel.institution_id == user.institution_id)
            .order_by(Personnel.id)
        )
        .scalars()
        .all()
    )
    return [
        PersonnelOut.model_validate(personnel_member).model_copy(
            update={
                "account_email": (
                    db.get(User, personnel_member.user_id).email
                    if personnel_member.user_id is not None
                    and db.get(User, personnel_member.user_id) is not None
                    else None
                )
            }
        )
        for personnel_member in personnel
    ]


@router.post("", response_model=PersonnelOut, status_code=status.HTTP_201_CREATED)
async def create_personnel(
    payload: PersonnelCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    creates_login = payload.account_email is not None or payload.account_password is not None
    if creates_login and (payload.account_email is None or payload.account_password is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="account_email and account_password must be provided together",
        )

    personnel = Personnel(
        institution_id=user.institution_id,
        name=payload.name,
        title=payload.title,
    )
    if payload.account_email is not None:
        _ensure_email_free(db, payload.account_email)
        staff_user = User(
            email=payload.account_email,
            hashed_password=hash_password(payload.account_password),
            full_name=payload.name,
            role="staff",
            institution_id=user.institution_id,
        )
        db.add(staff_user)
        db.flush()
        personnel.user_id = staff_user.id

    db.add(personnel)
    db.flush()
    _assign_counter(db, personnel, payload.counter_id)
    db.commit()
    db.refresh(personnel)
    await broadcast_all(db, user.institution_id)
    return personnel


@router.patch("/{personnel_id}", response_model=PersonnelOut)
async def update_personnel(
    personnel_id: int,
    payload: PersonnelUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    if "counter_id" in payload.model_fields_set:
        _assign_counter(db, personnel, payload.counter_id)
    if payload.name is not None:
        personnel.name = payload.name
        # Keep the linked login's display name in sync.
        account = _linked_account(db, personnel)
        if account is not None:
            account.full_name = payload.name
    if payload.title is not None:
        personnel.title = payload.title
    if payload.account_email is not None:
        account = _linked_account(db, personnel)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This staff member has no login account",
            )
        if account.email != payload.account_email:
            _ensure_email_free(db, payload.account_email)
            account.email = payload.account_email
    if payload.is_active is not None:
        personnel.is_active = payload.is_active
    db.commit()
    db.refresh(personnel)
    await broadcast_all(db, user.institution_id)
    return personnel


@router.patch("/{personnel_id}/counter", response_model=PersonnelOut)
async def update_personnel_counter(
    personnel_id: int,
    payload: PersonnelUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    if "counter_id" not in payload.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="counter_id is required",
        )
    _assign_counter(db, personnel, payload.counter_id)
    db.commit()
    db.refresh(personnel)
    await broadcast_all(db, user.institution_id)
    return personnel


@router.delete("/{personnel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_personnel(
    personnel_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    personnel.is_active = False
    db.commit()
    await broadcast_all(db, user.institution_id)


@router.post("/{personnel_id}/activate", response_model=PersonnelOut)
async def activate_personnel(
    personnel_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Personnel:
    personnel = _owned_personnel(db, user.institution_id, personnel_id)
    personnel.is_active = True
    db.commit()
    db.refresh(personnel)
    await broadcast_all(db, user.institution_id)
    return personnel


@router.post("/{personnel_id}/account", response_model=PersonnelOut, status_code=status.HTTP_201_CREATED)
async def create_staff_account(
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
    _ensure_email_free(db, payload.email)
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


@router.post("/{personnel_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_staff_password(
    personnel_id: int,
    payload: ResetPasswordRequest,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    account = _linked_account(db, _owned_personnel(db, user.institution_id, personnel_id))
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This staff member has no login account",
        )
    account.hashed_password = hash_password(payload.new_password)
    # Rotating the version invalidates every refresh token they hold.
    account.refresh_token_version += 1
    db.commit()


@router.post("/{personnel_id}/set-login", status_code=status.HTTP_204_NO_CONTENT)
async def set_staff_login_enabled(
    personnel_id: int,
    payload: SetLoginRequest,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    account = _linked_account(db, _owned_personnel(db, user.institution_id, personnel_id))
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This staff member has no login account",
        )
    account.is_active = payload.enabled
    db.commit()
