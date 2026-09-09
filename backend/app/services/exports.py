"""Real exports: sightings CSV, capture-history matrix CSV, and sightings GeoJSON.

Every row goes through the same role-based location generalisation used by the API,
so a bulk download can never leak more precise GPS than the screen already shows.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Detection, User
from app.services.identity import display_label, generalize

SIGHTING_COLUMNS = [
    "individual_code",
    "individual_name",
    "species",
    "sex",
    "captured_at",
    "camera_station",
    "latitude",
    "longitude",
    "grade",
    "observer",
    "confidence",
    "model_version",
]


def export_coordinates(
    detection: Detection, viewer: User
) -> tuple[float | None, float | None]:
    """Location as this viewer is allowed to export it.

    Bulk exports never use the "own upload" exemption: a citizen download is always
    generalised to roughly 11 km, a scientist to roughly 1 km, admins get exact.
    """
    return generalize(detection.latitude, detection.longitude, viewer.role, False)


def _iso(value: datetime | None) -> str:
    return value.isoformat() if value else ""


def sighting_rows(
    db: Session, detections: list[Detection], viewer: User
) -> list[dict]:
    uploader_names: dict[str, str] = {}
    rows: list[dict] = []
    for detection in detections:
        lat, lon = export_coordinates(detection, viewer)
        individual = detection.individual
        if detection.uploader_id not in uploader_names:
            uploader = db.get(User, detection.uploader_id)
            uploader_names[detection.uploader_id] = uploader.display_name if uploader else ""
        rows.append(
            {
                "individual_code": individual.code if individual else "",
                "individual_name": display_label(individual) if individual else "",
                "species": detection.species or "",
                "sex": (individual.sex if individual else None) or "",
                "captured_at": _iso(detection.captured_at or detection.created_at),
                "camera_station": detection.station.code if detection.station else "",
                "latitude": "" if lat is None else lat,
                "longitude": "" if lon is None else lon,
                "grade": detection.grade or "",
                "observer": uploader_names.get(detection.uploader_id, ""),
                "confidence": detection.confidence,
                "model_version": getattr(detection, "recognition_model_version", None) or "",
            }
        )
    return rows


def load_sightings(db: Session, project_id: str | None = None) -> list[Detection]:
    stmt = (
        select(Detection)
        .options(
            selectinload(Detection.individual),
            selectinload(Detection.station),
        )
        .order_by(Detection.captured_at.is_(None), Detection.captured_at.desc())
    )
    if project_id:
        stmt = stmt.where(Detection.project_id == project_id)
    return list(db.scalars(stmt).all())


def sightings_csv(db: Session, detections: list[Detection], viewer: User) -> str:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=SIGHTING_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for row in sighting_rows(db, detections, viewer):
        writer.writerow(row)
    return buffer.getvalue()


def sightings_geojson(db: Session, detections: list[Detection], viewer: User) -> dict:
    features = []
    for detection, row in zip(detections, sighting_rows(db, detections, viewer)):
        if row["latitude"] == "" or row["longitude"] == "":
            continue
        properties = {key: value for key, value in row.items() if key not in {"latitude", "longitude"}}
        properties["detection_id"] = detection.id
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [row["longitude"], row["latitude"]],
                },
                "properties": properties,
            }
        )
    return {
        "type": "FeatureCollection",
        "name": "patterns-sightings",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


def capture_matrix_grid(db: Session, project_id: str) -> tuple[list[str], list[tuple[str, set[str]]]]:
    """Individual-by-occasion presence, using calendar months as occasions."""
    detections = db.scalars(
        select(Detection)
        .options(selectinload(Detection.individual))
        .where(Detection.project_id == project_id, Detection.individual_id.is_not(None))
    ).all()
    occasions: set[str] = set()
    grid: dict[str, set[str]] = defaultdict(set)
    labels: dict[str, str] = {}
    for detection in detections:
        occasion = (detection.captured_at or detection.created_at).strftime("%Y-%m")
        occasions.add(occasion)
        labels[detection.individual_id] = (
            detection.individual.code if detection.individual else detection.individual_id
        )
        grid[detection.individual_id].add(occasion)
    ordered = sorted(occasions)
    rows = sorted(
        ((labels[iid], seen) for iid, seen in grid.items()),
        key=lambda item: item[0],
    )
    return ordered, rows


def capture_matrix_csv(db: Session, project_id: str) -> str:
    """Wide 0/1 detection history — the layout `secr`/`RMark` expect in R."""
    occasions, rows = capture_matrix_grid(db, project_id)
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["individual", *occasions])
    for label, seen in rows:
        writer.writerow([label, *(1 if occasion in seen else 0 for occasion in occasions)])
    return buffer.getvalue()
