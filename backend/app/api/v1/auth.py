from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Institution, User
from app.schemas.auth import (
    ChangePasswordRequest,
    InstitutionVerifyRequest,
    InstitutionVerifyResponse,
    LoginRequest,
    ProfileUpdate,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
)
from app.schemas.user import UserOut
from app.utils.institution_code import code_for
from app.utils.rate_limit import institution_verify_limiter, login_limiter
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    institution = Institution(name=payload.institution_name, type=payload.institution_type)
    db.add(institution)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Institution name already registered",
        )
    # The id only exists after flush; the sequential suffix makes codes unique.
    institution.code = code_for(institution.id, institution.name)

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="admin",
        institution_id=institution.id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    db.refresh(user)

    return RegisterResponse(
        access_token=create_access_token(user.id, user.role, user.institution_id),
        refresh_token=create_refresh_token(user.id, user.refresh_token_version),
        institution_code=institution.code,
    )


@router.post("/institution/verify", response_model=InstitutionVerifyResponse)
def verify_institution(
    payload: InstitutionVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> InstitutionVerifyResponse:
    if not institution_verify_limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, try again later",
        )
    institution = db.execute(
        select(Institution).where(Institution.code == payload.code.strip().upper())
    ).scalar_one_or_none()
    if institution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No institution found for this ID",
        )
    return InstitutionVerifyResponse(
        code=institution.code,
        name=institution.name,
        type=institution.type,
        is_active=institution.is_active,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not login_limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts, try again later",
        )
    institution = db.execute(
        select(Institution).where(Institution.code == payload.institution_code.strip().upper())
    ).scalar_one_or_none()
    if institution is None or not institution.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Institution not found or not accepting sign-ins",
        )
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if (
        user is None
        or user.institution_id != institution.id
        or not user.is_active
        or not verify_password(payload.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email, password, or institution ID",
        )
    access = create_access_token(user.id, user.role, user.institution_id)
    refresh = create_refresh_token(user.id, user.refresh_token_version)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        claims = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    if claims.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active or claims.get("version") != user.refresh_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user.refresh_token_version += 1
    db.commit()
    access = create_access_token(user.id, user.role, user.institution_id)
    refresh = create_refresh_token(user.id, user.refresh_token_version)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if payload.email is not None and payload.email != user.email:
        existing = db.execute(
            select(User).where(User.email == payload.email, User.id != user.id)
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            )
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.hashed_password = hash_password(payload.new_password)
    # Invalidate every existing refresh token, then re-issue for this session
    # so the current client stays signed in everywhere else logs out.
    user.refresh_token_version += 1
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, user.institution_id),
        refresh_token=create_refresh_token(user.id, user.refresh_token_version),
    )