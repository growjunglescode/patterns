from __future__ import annotations

import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CameraStation, Organization, Project, ProjectMember, User


def slugify(value: str, *, fallback: str = "project") -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:140] or fallback


def unique_project_slug(db: Session, base: str) -> str:
    slug = slugify(base)
    existing = {row for row in db.scalars(select(Project.slug)).all()}
    if slug not in existing:
        return slug
    n = 2
    while f"{slug}-{n}" in existing:
        n += 1
    return f"{slug}-{n}"


def station_code_from_name(name: str, index: int) -> str:
    raw = slugify(name, fallback=f"cam-{index + 1}").upper().replace("-", "")[:10]
    return raw or f"CAM{index + 1:02d}"


def resolve_user_project(db: Session, user: User, project_id: str | None = None) -> Project | None:
    if project_id:
        project = db.get(Project, project_id)
        if project:
            return project
    home_id = getattr(user, "home_project_id", None)
    if home_id:
        project = db.get(Project, home_id)
        if project:
            return project
    member = db.scalar(select(ProjectMember).where(ProjectMember.user_id == user.id).limit(1))
    if member:
        project = db.get(Project, member.project_id)
        if project:
            return project
    return db.scalar(select(Project).where(Project.active.is_(True)).order_by(Project.created_at.asc()).limit(1))


def complete_onboarding(
    db: Session,
    user: User,
    *,
    affiliation_type: str,
    organization: str | None,
    phone: str | None,
    country: str,
    city: str | None,
    study_country: str | None,
    study_region: str | None,
    project_name: str | None,
    bio: str | None,
    stations: list[dict],
) -> User:
    affiliation = (affiliation_type or "").strip().lower()
    if affiliation not in {"university", "institution", "hobby"}:
        raise ValueError("Choose university, institution, or hobby")

    if affiliation in {"university", "institution"}:
        user.role = "scientist"
        user.verified = False
        if not (study_country or "").strip():
            raise ValueError("Add the country where your camera traps are located")
        if not stations:
            raise ValueError("Add at least one camera trap name")
    else:
        user.role = "citizen"
        user.verified = True

    # First account on an empty install becomes admin so solo testing works end-to-end.
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    if total_users <= 1:
        user.role = "admin"
        user.verified = True

    user.affiliation_type = affiliation
    user.organization = (organization or "").strip() or None
    user.phone = (phone or "").strip() or None
    user.country = country.strip()
    user.city = (city or "").strip() or None
    user.study_country = (study_country or "").strip() or None
    user.study_region = (study_region or "").strip() or None
    if bio is not None:
        user.bio = bio.strip() or None

    region_bits = [bit for bit in [user.study_region, user.study_country or user.country] if bit]
    region = " · ".join(region_bits) if region_bits else user.country

    org_name = user.organization
    org = None
    if org_name and affiliation in {"university", "institution"}:
        org_slug = unique_project_slug(db, org_name)  # reuse uniqueness pattern on org table
        existing_org = db.scalar(select(Organization).where(Organization.name == org_name))
        if existing_org:
            org = existing_org
        else:
            # avoid colliding with project slugs by prefixing
            base = slugify(org_name, fallback="org")
            taken = {row for row in db.scalars(select(Organization.slug)).all()}
            slug = base if base not in taken else f"{base}-org"
            n = 2
            while slug in taken:
                slug = f"{base}-org-{n}"
                n += 1
            org = Organization(name=org_name, slug=slug, region=user.country)
            db.add(org)
            db.flush()

    title = (project_name or "").strip()
    if not title:
        if org_name:
            title = f"{org_name} field catalog"
        else:
            title = f"{user.display_name}'s field catalog"

    project = Project(
        name=title,
        slug=unique_project_slug(db, title),
        region=region,
        active=True,
        organization_id=org.id if org else None,
    )
    db.add(project)
    db.flush()

    db.add(ProjectMember(project_id=project.id, user_id=user.id, role=user.role))

    used_codes: set[str] = set()
    for i, row in enumerate(stations):
        name = (row.get("name") or "").strip()
        if not name:
            continue
        code = (row.get("code") or "").strip().upper() or station_code_from_name(name, i)
        base_code = code
        n = 2
        while code in used_codes:
            code = f"{base_code[:28]}{n}"
            n += 1
        used_codes.add(code)
        lat = row.get("latitude")
        lon = row.get("longitude")
        db.add(
            CameraStation(
                project_id=project.id,
                code=code,
                name=name,
                latitude=float(lat) if lat is not None else 0.0,
                longitude=float(lon) if lon is not None else 0.0,
            )
        )

    # Hobbyists can optionally add traps; if none, create a default "Field upload" station
    if affiliation == "hobby" and not used_codes:
        db.add(
            CameraStation(
                project_id=project.id,
                code="FIELD-01",
                name="Field upload",
                latitude=0.0,
                longitude=0.0,
            )
        )

    user.home_project_id = project.id
    user.onboarding_complete = True
    db.commit()
    db.refresh(user)
    return user
