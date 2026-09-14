"""Hard rules for who may hold the system admin role."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

# Only these accounts may be platform admins. Everyone else is demoted on touch.
# Match full email or the local-part before @ (case-insensitive).
SUPER_ADMIN_LOCAL_PARTS = frozenset({"miguelguevara1012"})


def is_super_admin_email(email: str | None) -> bool:
    raw = (email or "").strip().lower()
    if not raw:
        return False
    local = raw.split("@", 1)[0]
    return local in SUPER_ADMIN_LOCAL_PARTS or raw in {
        f"{part}@gmail.com" for part in SUPER_ADMIN_LOCAL_PARTS
    }


def enforce_admin_exclusivity(user) -> bool:
    """Ensure only the super-admin email keeps role=admin.

    Returns True if the user's role was changed.
    """
    role = (getattr(user, "role", None) or "").strip().lower()
    email = getattr(user, "email", None)
    if is_super_admin_email(email):
        if role != "admin":
            user.role = "admin"
            user.verified = True
            return True
        return False
    if role == "admin":
        # Never leave a non-owner as admin.
        user.role = "scientist"
        return True
    return False


def scrub_admin_roles(db: Session) -> int:
    """Demote every non-owner admin and promote the owner account if present.

    Returns the number of users whose role changed.
    """
    from app.models import User

    changed = 0
    clauses = [User.role == "admin"]
    for part in SUPER_ADMIN_LOCAL_PARTS:
        clauses.append(User.email.ilike(f"{part}@%"))
    users = db.scalars(select(User).where(or_(*clauses))).all()
    for user in users:
        if enforce_admin_exclusivity(user):
            changed += 1
    return changed
