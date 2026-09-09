from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models import User
from app.schemas import OnboardingRequest, ProfilePatch, Token, UserCreate, UserOut
from app.services.onboarding import complete_onboarding
from app.services.serialize import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    # Role and affiliation are set during onboarding — start as citizen pending profile.
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        role="citizen",
        verified=False,
        onboarding_complete=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def patch_me(
    payload: ProfilePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    if payload.display_name:
        user.display_name = payload.display_name.strip()
    if payload.organization is not None:
        user.organization = payload.organization.strip() or None
    if payload.bio is not None:
        user.bio = payload.bio.strip() or None
    if payload.orcid is not None:
        user.orcid = payload.orcid.strip() or None
    if payload.profile_public is not None:
        user.profile_public = payload.profile_public
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None
    if payload.country is not None:
        user.country = payload.country.strip() or None
    if payload.city is not None:
        user.city = payload.city.strip() or None
    if payload.study_country is not None:
        user.study_country = payload.study_country.strip() or None
    if payload.study_region is not None:
        user.study_region = payload.study_region.strip() or None
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/onboarding", response_model=UserOut)
def onboarding(
    payload: OnboardingRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    if getattr(user, "onboarding_complete", False):
        raise HTTPException(status_code=400, detail="Profile setup is already complete")
    try:
        updated = complete_onboarding(
            db,
            user,
            affiliation_type=payload.affiliation_type,
            organization=payload.organization,
            phone=payload.phone,
            country=payload.country,
            city=payload.city,
            study_country=payload.study_country,
            study_region=payload.study_region,
            project_name=payload.project_name,
            bio=payload.bio,
            stations=[row.model_dump() for row in payload.stations],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return user_out(updated)
