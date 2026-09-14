from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
import secrets

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.db import get_db
from app.models import User
from app.schemas import (
    AuthProvidersOut,
    GoogleAuthRequest,
    OnboardingRequest,
    ProfilePatch,
    Token,
    UserCreate,
    UserOut,
)
from app.services.google_auth import verify_google_id_token
from app.services.onboarding import complete_onboarding
from app.services.serialize import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/providers", response_model=AuthProvidersOut)
def auth_providers() -> AuthProvidersOut:
    client_id = (get_settings().google_client_id or "").strip()
    return AuthProvidersOut(google=bool(client_id), google_client_id=client_id or None)


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
        auth_provider="password",
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
    provider = getattr(user, "auth_provider", "password") if user else None
    if (
        not user
        or provider == "google"
        or not verify_password(form.password, user.hashed_password)
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user))


@router.post("/google", response_model=Token)
def google_login(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> Token:
    if not (get_settings().google_client_id or "").strip():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        identity = verify_google_id_token(payload.id_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface token problems cleanly
        raise HTTPException(status_code=401, detail="Could not verify Google sign-in") from exc

    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if not user:
        user = db.scalar(select(User).where(User.email == identity.email))

    if user:
        if not getattr(user, "google_sub", None):
            user.google_sub = identity.sub
        provider = getattr(user, "auth_provider", None) or "password"
        if provider == "password":
            user.auth_provider = "both"
        elif provider == "google":
            user.auth_provider = "google"
        if identity.name and (not user.display_name or user.display_name == user.email.split("@")[0]):
            user.display_name = identity.name[:120]
    else:
        display = (identity.name or identity.email.split("@")[0])[:120]
        user = User(
            email=identity.email,
            hashed_password=hash_password(secrets.token_urlsafe(48)),
            display_name=display,
            role="citizen",
            verified=False,
            onboarding_complete=False,
            google_sub=identity.sub,
            auth_provider="google",
        )
        db.add(user)

    db.commit()
    db.refresh(user)
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
    if payload.affiliation_type is not None:
        affiliation = payload.affiliation_type.strip().lower()
        if affiliation and affiliation not in {"university", "institution", "organization", "hobby"}:
            raise HTTPException(status_code=400, detail="Choose university, institute, organization, or hobby")
        user.affiliation_type = affiliation or None
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
