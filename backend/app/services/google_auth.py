"""Verify Google ID tokens (Sign in with Google / Gmail)."""

from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import get_settings


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


def verify_google_id_token(credential: str) -> GoogleIdentity:
    settings = get_settings()
    client_id = (settings.google_client_id or "").strip()
    if not client_id:
        raise ValueError("Google sign-in is not configured")

    info = id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        client_id,
        clock_skew_in_seconds=10,
    )
    if info.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("Invalid Google token issuer")

    email = str(info.get("email") or "").strip().lower()
    sub = str(info.get("sub") or "").strip()
    if not email or not sub:
        raise ValueError("Google account is missing email")
    if not info.get("email_verified", False):
        raise ValueError("Google email is not verified")

    name = str(info.get("name") or "").strip() or None
    picture = str(info.get("picture") or "").strip() or None
    return GoogleIdentity(sub=sub, email=email, email_verified=True, name=name, picture=picture)
