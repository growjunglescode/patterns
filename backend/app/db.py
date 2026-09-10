from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def ensure_columns() -> None:
    statements = [
        "ALTER TABLE detections ADD COLUMN camera_make VARCHAR(80)",
        "ALTER TABLE detections ADD COLUMN camera_model VARCHAR(80)",
        "ALTER TABLE detections ADD COLUMN metadata_source VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN organization VARCHAR(160)",
        "ALTER TABLE users ADD COLUMN bio VARCHAR(500)",
        "ALTER TABLE users ADD COLUMN profile_public BOOLEAN DEFAULT 0",
        "ALTER TABLE individuals ADD COLUMN share_public BOOLEAN DEFAULT 0",
        "ALTER TABLE detections ADD COLUMN review_state VARCHAR(32)",
        "ALTER TABLE detections ADD COLUMN recognition_engine VARCHAR(24)",
        "ALTER TABLE detections ADD COLUMN recognition_model_version VARCHAR(64)",
        "ALTER TABLE individuals ADD COLUMN age_class VARCHAR(24)",
        "ALTER TABLE individuals ADD COLUMN birth_year_estimate INTEGER",
        "ALTER TABLE individuals ADD COLUMN physical_notes TEXT",
        "ALTER TABLE individuals ADD COLUMN details_updated_by_id VARCHAR(36)",
        "ALTER TABLE individuals ADD COLUMN details_updated_at TIMESTAMP",
        "ALTER TABLE projects ADD COLUMN organization_id VARCHAR(36)",
        "ALTER TABLE detections ADD COLUMN second_reviewer_id VARCHAR(36)",
        "ALTER TABLE users ADD COLUMN affiliation_type VARCHAR(32)",
        "ALTER TABLE users ADD COLUMN phone VARCHAR(40)",
        "ALTER TABLE users ADD COLUMN country VARCHAR(80)",
        "ALTER TABLE users ADD COLUMN city VARCHAR(80)",
        "ALTER TABLE users ADD COLUMN study_country VARCHAR(80)",
        "ALTER TABLE users ADD COLUMN study_region VARCHAR(120)",
        "ALTER TABLE users ADD COLUMN onboarding_complete BOOLEAN DEFAULT 0",
        "ALTER TABLE users ADD COLUMN home_project_id VARCHAR(36)",
        "ALTER TABLE projects ADD COLUMN created_by_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for sql in statements:
            try:
                conn.execute(text(sql))
            except Exception:
                pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
