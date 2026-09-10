from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(24), default="citizen")  # admin|scientist|citizen|viewer
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    orcid: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    profile_public: Mapped[bool] = mapped_column(Boolean, default=False)
    # Onboarding / field profile
    affiliation_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # university|institution|hobby
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    study_country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    study_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    home_project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpeciesProfile(Base):
    """Deployed species is a row, not the schema. Jaguar is the first profile."""

    __tablename__ = "species_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    common_name: Mapped[str] = mapped_column(String(80))
    scientific_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    id_prefix: Mapped[str] = mapped_column(String(8))
    pattern_bearing: Mapped[bool] = mapped_column(Boolean, default=True)
    flank_required: Mapped[bool] = mapped_column(Boolean, default=True)
    deployed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[Optional[str]] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    created_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    stations: Mapped[list[CameraStation]] = relationship(back_populates="project")
    individuals: Mapped[list[Individual]] = relationship(back_populates="project")
    detections: Mapped[list[Detection]] = relationship(back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(24), default="researcher")


class CameraStation(Base):
    __tablename__ = "camera_stations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    code: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    camera_model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    active_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    active_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship(back_populates="stations")
    detections: Mapped[list[Detection]] = relationship(back_populates="station")


class Individual(Base):
    __tablename__ = "individuals"
    __table_args__ = (UniqueConstraint("code", name="uq_individual_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    code: Mapped[str] = mapped_column(String(24), index=True)  # JAG-0247
    species: Mapped[str] = mapped_column(String(64), default="jaguar")
    sex: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    life_status: Mapped[str] = mapped_column(String(24), default="unknown")  # unknown|alive|dead|lost
    identity_status: Mapped[str] = mapped_column(String(24), default="unnamed")  # unnamed|under_review|named
    name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    name_key: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    named_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    embedding_left_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    embedding_right_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    share_public: Mapped[bool] = mapped_column(Boolean, default=False)
    # Editable field notes (monitoring layer). Seeded sex/life_status came from the
    # demo generator, so these are corrections a scientist is expected to make.
    age_class: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)  # cub|juvenile|subadult|adult|unknown
    birth_year_estimate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    physical_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details_updated_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    details_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="individuals")
    detections: Mapped[list[Detection]] = relationship(
        back_populates="individual",
        foreign_keys="Detection.individual_id",
    )
    naming_claims: Mapped[list[NamingClaim]] = relationship(back_populates="individual")


class NamingClaim(Base):
    __tablename__ = "naming_claims"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    individual_id: Mapped[str] = mapped_column(ForeignKey("individuals.id"), index=True)
    proposed_name: Mapped[str] = mapped_column(String(80))
    name_key: Mapped[str] = mapped_column(String(80), index=True)
    proposer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="pending")  # pending|approved|rejected
    approver_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    individual: Mapped[Individual] = relationship(back_populates="naming_claims")


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    station_id: Mapped[Optional[str]] = mapped_column(ForeignKey("camera_stations.id"), nullable=True, index=True)
    individual_id: Mapped[Optional[str]] = mapped_column(ForeignKey("individuals.id"), nullable=True, index=True)
    suggested_individual_id: Mapped[Optional[str]] = mapped_column(ForeignKey("individuals.id"), nullable=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    reviewer_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    second_reviewer_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    species: Mapped[str] = mapped_column(String(64), default="unknown")
    side: Mapped[str] = mapped_column(String(8), default="U")  # L|R|B|U
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    match_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[str] = mapped_column(String(32), default="needs_id")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    camera_make: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    camera_model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    metadata_source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    review_state: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    recognition_engine: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    recognition_model_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="detections")
    station: Mapped[Optional[CameraStation]] = relationship(back_populates="detections")
    individual: Mapped[Optional[Individual]] = relationship(
        foreign_keys=[individual_id],
        back_populates="detections",
    )
    suggested_individual: Mapped[Optional[Individual]] = relationship(foreign_keys=[suggested_individual_id])
    media: Mapped[list[Media]] = relationship(back_populates="detection", cascade="all, delete-orphan")
    coat_embeddings: Mapped[list[CoatEmbedding]] = relationship(
        back_populates="detection",
        cascade="all, delete-orphan",
    )
    match_reviews: Mapped[list[MatchReview]] = relationship(
        back_populates="detection",
        cascade="all, delete-orphan",
    )


class Media(Base):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    detection_id: Mapped[str] = mapped_column(ForeignKey("detections.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(128))
    original_filename: Mapped[str] = mapped_column(String(255))
    is_best_frame: Mapped[bool] = mapped_column(Boolean, default=False)
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    detection: Mapped[Detection] = relationship(back_populates="media")


class CoatEmbedding(Base):
    """Per-photo ML coat embedding. Separate from OpenCV Media.embedding_json."""

    __tablename__ = "coat_embeddings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    media_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL"), nullable=True, index=True
    )
    detection_id: Mapped[str] = mapped_column(
        ForeignKey("detections.id", ondelete="CASCADE"), index=True
    )
    individual_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("individuals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    embedding_json: Mapped[str] = mapped_column(Text)
    side: Mapped[str] = mapped_column(String(8), default="U")
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    model_name: Mapped[str] = mapped_column(String(64))
    model_version: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    detection: Mapped[Detection] = relationship(back_populates="coat_embeddings")


class MatchReview(Base):
    """Human identity decisions for later evaluation of the matching engine."""

    __tablename__ = "match_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    detection_id: Mapped[str] = mapped_column(
        ForeignKey("detections.id", ondelete="CASCADE"), index=True
    )
    media_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    engine: Mapped[str] = mapped_column(String(24))
    model_version: Mapped[str] = mapped_column(String(64))
    review_state: Mapped[str] = mapped_column(String(32), index=True)
    suggested_individual_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    confirmed_individual_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    similarity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    candidate_snapshot_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    was_correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    detection: Mapped[Detection] = relationship(back_populates="match_reviews")


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("user_id", "individual_id", name="uq_follow"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    individual_id: Mapped[str] = mapped_column(ForeignKey("individuals.id"), index=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    actor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    entity: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(36))
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
