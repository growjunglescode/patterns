import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.config import get_settings
from app.db import Base, SessionLocal, engine, ensure_columns
from app.routers import admin, auth, detections, individuals, institutions, model_report, monitoring, public, workspace
from app.seed import ensure_reference_data, seed_if_empty

settings = get_settings()
app = FastAPI(
    title="Patterns",
    version="0.2.0",
    description="Individual wildlife intelligence.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(institutions.router)
app.include_router(detections.router)
app.include_router(individuals.router)
app.include_router(workspace.router)
app.include_router(monitoring.router)
app.include_router(model_report.router)
app.include_router(public.router)


@app.on_event("startup")
def startup() -> None:
    for _ in range(30):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError:
            time.sleep(1)
    else:
            Base.metadata.create_all(bind=engine)
    settings.media_root.mkdir(parents=True, exist_ok=True)
    ensure_columns()
    db = SessionLocal()
    try:
        seed_if_empty(db)
        ensure_reference_data(db)
    finally:
        db.close()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
