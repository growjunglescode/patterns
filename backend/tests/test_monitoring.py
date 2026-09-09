"""Monitoring-layer tests: distance maths, sighting history, exports, and edit permissions.

Uses an isolated in-memory SQLite database so nothing touches the real dev data,
and calls the endpoint functions directly rather than logging in over HTTP.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models import AuditLog, CameraStation, Detection, Individual, Project, User
from app.routers.monitoring import patch_individual_details
from app.schemas import IndividualDetailsPatch
from app.services.exports import (
    capture_matrix_csv,
    export_coordinates,
    sighting_rows,
    sightings_csv,
    sightings_geojson,
)
from app.services.monitoring import (
    haversine_km,
    max_span_km,
    movement_legs,
    movement_summary,
    sighting_history,
)

NOW = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)

# Two real Osa Jaguar Project camera locations, ~4.9 km apart.
OSA_01 = (8.54, -83.51)
OSA_02 = (8.52, -83.47)
OSA_03 = (8.49, -83.58)


# --------------------------------------------------------------------------- #
# 1. Haversine distance maths
# --------------------------------------------------------------------------- #


def test_haversine_same_point_is_zero():
    assert haversine_km(8.54, -83.51, 8.54, -83.51) == 0.0


def test_haversine_one_degree_of_latitude_is_about_111km():
    assert haversine_km(0.0, 0.0, 1.0, 0.0) == pytest.approx(111.19, abs=0.1)


def test_haversine_one_degree_of_longitude_shrinks_away_from_equator():
    at_equator = haversine_km(0.0, 0.0, 0.0, 1.0)
    at_osa = haversine_km(8.53, -83.51, 8.53, -82.51)
    assert at_equator == pytest.approx(111.19, abs=0.1)
    assert at_osa < at_equator
    assert at_osa == pytest.approx(109.95, abs=0.2)


def test_haversine_matches_known_london_to_paris_distance():
    km = haversine_km(51.5074, -0.1278, 48.8566, 2.3522)
    assert km == pytest.approx(343.5, abs=1.0)


def test_haversine_is_symmetric():
    there = haversine_km(*OSA_01, *OSA_02)
    back = haversine_km(*OSA_02, *OSA_01)
    assert there == pytest.approx(back, abs=1e-9)
    assert there == pytest.approx(4.93, abs=0.05)


def test_haversine_handles_antimeridian_without_wrapping_the_globe():
    km = haversine_km(0.0, 179.9, 0.0, -179.9)
    assert km == pytest.approx(22.24, abs=0.1)


# --------------------------------------------------------------------------- #
# 2. Sighting history and movement, on plain unsaved objects
# --------------------------------------------------------------------------- #


def _sighting(days_ago: int, coords=None, station_id=None, grade="research_grade", ident="jag-1"):
    lat, lon = coords if coords else (None, None)
    return Detection(
        id=f"det-{days_ago}",
        project_id="p1",
        uploader_id="u1",
        individual_id=ident,
        grade=grade,
        species="jaguar",
        latitude=lat,
        longitude=lon,
        station_id=station_id,
        captured_at=NOW - timedelta(days=days_ago),
        created_at=NOW - timedelta(days=days_ago),
        confidence=0.9,
    )


def test_sighting_history_no_sightings_returns_nulls():
    history = sighting_history([], now=NOW)
    assert history["first_seen"] is None
    assert history["last_seen"] is None
    assert history["days_since_seen"] is None
    assert history["sighting_count"] == 0
    assert history["active_last_90_days"] is False


def test_sighting_history_first_last_and_days_since_seen():
    rows = [_sighting(10), _sighting(400), _sighting(120)]
    history = sighting_history(rows, now=NOW)
    assert history["first_seen"] == NOW - timedelta(days=400)
    assert history["last_seen"] == NOW - timedelta(days=10)
    assert history["days_since_seen"] == 10
    assert history["sighting_count"] == 3
    assert history["active_last_90_days"] is True


def test_sighting_history_marks_stale_individual_inactive():
    history = sighting_history([_sighting(200), _sighting(365)], now=NOW)
    assert history["days_since_seen"] == 200
    assert history["active_last_90_days"] is False


def test_sighting_history_ignores_order_of_input():
    ascending = sighting_history([_sighting(300), _sighting(5)], now=NOW)
    descending = sighting_history([_sighting(5), _sighting(300)], now=NOW)
    assert ascending == descending


def test_sighting_history_treats_naive_timestamps_as_utc():
    row = _sighting(30)
    row.captured_at = datetime(2026, 8, 3, 12, 0)
    history = sighting_history([row], now=NOW)
    assert history["days_since_seen"] == 30


def test_movement_legs_are_ordered_in_time_and_measured_pairwise():
    rows = [
        _sighting(60, OSA_02, station_id="s2"),
        _sighting(120, OSA_01, station_id="s1"),
        _sighting(10, OSA_03, station_id="s3"),
    ]
    legs = movement_legs(rows)
    # Legs follow the timeline (120 days ago -> 60 -> 10), not the input order.
    assert [leg["from_detection_id"] for leg in legs] == ["det-120", "det-60"]
    assert [leg["to_detection_id"] for leg in legs] == ["det-60", "det-10"]
    assert legs[0]["km"] == pytest.approx(4.93, abs=0.05)
    assert legs[0]["days_apart"] == 60


def test_movement_summary_totals_last_30_days_cameras_and_span():
    rows = [
        _sighting(120, OSA_01, station_id="s1"),
        _sighting(60, OSA_02, station_id="s2"),
        _sighting(5, OSA_03, station_id="s3"),
    ]
    summary = movement_summary(rows, now=NOW)
    leg_a = haversine_km(*OSA_01, *OSA_02)
    leg_b = haversine_km(*OSA_02, *OSA_03)
    assert summary["total_min_distance_km"] == pytest.approx(round(leg_a + leg_b, 2), abs=0.02)
    # Only the hop that lands inside the window counts.
    assert summary["distance_last_30_days_km"] == pytest.approx(round(leg_b, 2), abs=0.02)
    assert summary["distinct_cameras"] == 3
    assert summary["max_span_km"] == pytest.approx(max_span_km(rows), abs=1e-9)
    assert summary["is_minimum_estimate"] is True
    assert "minimum" in summary["caveat"].lower()


def test_movement_summary_ignores_sightings_without_coordinates():
    rows = [_sighting(50, OSA_01, station_id="s1"), _sighting(20, None, station_id="s2")]
    summary = movement_summary(rows, now=NOW)
    assert summary["leg_count"] == 0
    assert summary["total_min_distance_km"] == 0.0
    assert summary["located_sighting_count"] == 1
    assert summary["distinct_cameras"] == 2


def test_max_span_is_widest_pair_not_the_consecutive_path():
    rows = [
        _sighting(90, OSA_01),
        _sighting(60, OSA_02),
        _sighting(30, OSA_01),
    ]
    assert max_span_km(rows) == pytest.approx(haversine_km(*OSA_01, *OSA_02), abs=0.02)
    assert movement_summary(rows, now=NOW)["total_min_distance_km"] > max_span_km(rows)


# --------------------------------------------------------------------------- #
# Database fixture
# --------------------------------------------------------------------------- #


@pytest.fixture()
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _user(role: str, email: str) -> User:
    return User(
        email=email,
        hashed_password="x",
        display_name=f"{role.title()} Tester",
        role=role,
        verified=True,
    )


@pytest.fixture()
def world(db: Session) -> dict:
    project = Project(name="Osa Jaguar Project", slug="osa-jaguar-project", region="Costa Rica")
    admin = _user("admin", "admin@test.local")
    scientist = _user("scientist", "sci@test.local")
    citizen = _user("citizen", "citizen@test.local")
    viewer = _user("viewer", "viewer@test.local")
    db.add_all([project, admin, scientist, citizen, viewer])
    db.flush()

    station_a = CameraStation(
        project_id=project.id, code="OSA-01", name="OSA-01",
        latitude=OSA_01[0], longitude=OSA_01[1],
    )
    station_b = CameraStation(
        project_id=project.id, code="OSA-02", name="OSA-02",
        latitude=OSA_02[0], longitude=OSA_02[1],
    )
    db.add_all([station_a, station_b])
    db.flush()

    individual = Individual(
        project_id=project.id, code="JAG-0014", species="jaguar",
        sex="M", life_status="unknown", identity_status="named", name="Balam",
    )
    db.add(individual)
    db.flush()

    for offset, station, coords in (
        (120, station_a, OSA_01),
        (40, station_b, OSA_02),
    ):
        db.add(
            Detection(
                project_id=project.id,
                station_id=station.id,
                individual_id=individual.id,
                uploader_id=citizen.id,
                species="jaguar",
                side="L",
                grade="research_grade",
                captured_at=NOW - timedelta(days=offset),
                latitude=coords[0],
                longitude=coords[1],
                confidence=0.91,
                recognition_model_version="resnet50-v1",
            )
        )
    db.commit()
    return {
        "project": project,
        "admin": admin,
        "scientist": scientist,
        "citizen": citizen,
        "viewer": viewer,
        "individual": individual,
    }


# --------------------------------------------------------------------------- #
# 3. Exports respect role-based location blurring
# --------------------------------------------------------------------------- #


def test_export_coordinates_blur_by_role(db: Session, world: dict):
    detection = db.scalars(select(Detection)).first()
    detection.latitude = 8.546789
    detection.longitude = -83.512345

    assert export_coordinates(detection, world["admin"]) == (8.546789, -83.512345)
    assert export_coordinates(detection, world["scientist"]) == (8.55, -83.51)
    assert export_coordinates(detection, world["citizen"]) == (8.5, -83.5)
    assert export_coordinates(detection, world["viewer"]) == (8.5, -83.5)


def test_citizen_export_never_contains_precise_gps_even_for_own_upload(db: Session, world: dict):
    detections = list(db.scalars(select(Detection)))
    for detection in detections:
        detection.latitude = 8.546789
        detection.longitude = -83.512345
    # The citizen is the uploader of every seeded detection here.
    assert all(d.uploader_id == world["citizen"].id for d in detections)

    body = sightings_csv(db, detections, world["citizen"])
    assert "8.546789" not in body
    assert "-83.512345" not in body
    assert "8.5,-83.5" in body


def test_sightings_csv_has_full_ecologist_columns(db: Session, world: dict):
    detections = list(db.scalars(select(Detection)))
    body = sightings_csv(db, detections, world["scientist"])
    header = body.splitlines()[0]
    assert header == (
        "individual_code,individual_name,species,sex,captured_at,camera_station,"
        "latitude,longitude,grade,observer,confidence,model_version"
    )
    assert "JAG-0014" in body
    assert "Balam" in body
    assert "OSA-01" in body
    assert "resnet50-v1" in body
    assert "Citizen Tester" in body


def test_geojson_coordinates_are_blurred_for_citizens(db: Session, world: dict):
    detections = list(db.scalars(select(Detection)))
    for detection in detections:
        detection.latitude = 8.546789
        detection.longitude = -83.512345

    admin_fc = sightings_geojson(db, detections, world["admin"])
    citizen_fc = sightings_geojson(db, detections, world["citizen"])
    assert admin_fc["type"] == "FeatureCollection"
    assert admin_fc["features"][0]["geometry"]["coordinates"] == [-83.512345, 8.546789]
    assert citizen_fc["features"][0]["geometry"]["coordinates"] == [-83.5, 8.5]
    # GeoJSON is lon/lat order, as GIS software expects.
    assert citizen_fc["features"][0]["geometry"]["type"] == "Point"


def test_geojson_skips_sightings_without_coordinates(db: Session, world: dict):
    detections = list(db.scalars(select(Detection)))
    detections[0].latitude = None
    detections[0].longitude = None
    features = sightings_geojson(db, detections, world["admin"])["features"]
    assert len(features) == len(detections) - 1


def test_sighting_rows_blank_location_when_detection_has_none(db: Session, world: dict):
    detection = db.scalars(select(Detection)).first()
    detection.latitude = None
    detection.longitude = None
    row = sighting_rows(db, [detection], world["admin"])[0]
    assert row["latitude"] == ""
    assert row["longitude"] == ""


def test_capture_matrix_csv_is_a_wide_zero_one_grid(db: Session, world: dict):
    body = capture_matrix_csv(db, world["project"].id)
    lines = body.strip().splitlines()
    header = lines[0].split(",")
    assert header[0] == "individual"
    assert len(header) > 1
    cells = lines[1].split(",")
    assert cells[0] == "JAG-0014"
    assert set(cells[1:]) <= {"0", "1"}
    assert cells[1:].count("1") == 2


# --------------------------------------------------------------------------- #
# 4. Permission enforcement on individual edits
# --------------------------------------------------------------------------- #


def test_citizen_cannot_edit_individual_details(db: Session, world: dict):
    with pytest.raises(HTTPException) as err:
        patch_individual_details(
            world["individual"].code,
            IndividualDetailsPatch(age_class="adult"),
            db=db,
            user=world["citizen"],
        )
    assert err.value.status_code == 403
    db.rollback()
    assert db.get(Individual, world["individual"].id).age_class is None


def test_viewer_cannot_edit_individual_details(db: Session, world: dict):
    with pytest.raises(HTTPException) as err:
        patch_individual_details(
            world["individual"].code,
            IndividualDetailsPatch(sex="F"),
            db=db,
            user=world["viewer"],
        )
    assert err.value.status_code == 403


def test_scientist_can_edit_details_and_change_is_audited(db: Session, world: dict):
    out = patch_individual_details(
        world["individual"].code,
        IndividualDetailsPatch(
            sex="F",
            life_status="alive",
            age_class="subadult",
            birth_year_estimate=2019,
            physical_notes="Notched left ear, kinked tail tip.",
        ),
        db=db,
        user=world["scientist"],
    )
    assert out.sex == "F"
    assert out.life_status == "alive"
    assert out.age_class == "subadult"
    assert out.birth_year_estimate == 2019
    assert "Notched left ear" in out.physical_notes
    assert out.details_updated_by == "Scientist Tester"
    assert out.details_updated_at is not None

    entries = db.scalars(
        select(AuditLog).where(AuditLog.action == "edit_individual_details")
    ).all()
    assert len(entries) == 1
    assert entries[0].actor_id == world["scientist"].id
    assert entries[0].entity_id == world["individual"].id
    assert "subadult" in (entries[0].detail or "")


def test_admin_can_edit_details(db: Session, world: dict):
    out = patch_individual_details(
        world["individual"].id,
        IndividualDetailsPatch(age_class="adult"),
        db=db,
        user=world["admin"],
    )
    assert out.age_class == "adult"


def test_unknown_sex_clears_the_seeded_guess(db: Session, world: dict):
    out = patch_individual_details(
        world["individual"].id,
        IndividualDetailsPatch(sex="unknown"),
        db=db,
        user=world["scientist"],
    )
    assert out.sex is None


def test_details_edit_rejects_unknown_age_class(db: Session, world: dict):
    with pytest.raises(HTTPException) as err:
        patch_individual_details(
            world["individual"].id,
            IndividualDetailsPatch(age_class="elderly"),
            db=db,
            user=world["scientist"],
        )
    assert err.value.status_code == 400


def test_details_edit_rejects_impossible_birth_year(db: Session, world: dict):
    with pytest.raises(HTTPException) as err:
        patch_individual_details(
            world["individual"].id,
            IndividualDetailsPatch(birth_year_estimate=2999),
            db=db,
            user=world["scientist"],
        )
    assert err.value.status_code == 400


def test_no_op_edit_does_not_write_an_audit_entry(db: Session, world: dict):
    patch_individual_details(
        world["individual"].id,
        IndividualDetailsPatch(sex="M"),
        db=db,
        user=world["scientist"],
    )
    entries = db.scalars(
        select(AuditLog).where(AuditLog.action == "edit_individual_details")
    ).all()
    assert entries == []


def test_details_edit_404s_for_unknown_individual(db: Session, world: dict):
    with pytest.raises(HTTPException) as err:
        patch_individual_details(
            "JAG-9999",
            IndividualDetailsPatch(age_class="adult"),
            db=db,
            user=world["admin"],
        )
    assert err.value.status_code == 404


# --------------------------------------------------------------------------- #
# Individual API exposes the monitoring fields end to end
# --------------------------------------------------------------------------- #


def test_individual_out_exposes_first_last_seen_and_movement(db: Session, world: dict):
    from app.services.serialize import individual_out

    out = individual_out(db, world["individual"])
    assert out.sighting_count == 2
    assert out.first_seen is not None
    assert out.last_seen is not None
    assert out.days_since_seen is not None and out.days_since_seen >= 40
    assert out.movement is not None
    assert out.movement.distinct_cameras == 2
    assert out.movement.total_min_distance_km == pytest.approx(4.93, abs=0.05)
    assert out.movement.is_minimum_estimate is True


def test_confirmed_sightings_exclude_unreviewed_detections(db: Session, world: dict):
    from app.services.monitoring import confirmed_sightings

    db.add(
        Detection(
            project_id=world["project"].id,
            individual_id=world["individual"].id,
            uploader_id=world["citizen"].id,
            species="jaguar",
            grade="needs_id",
            captured_at=NOW,
            latitude=OSA_03[0],
            longitude=OSA_03[1],
            confidence=0.5,
        )
    )
    db.commit()
    assert len(confirmed_sightings(db, world["individual"].id)) == 2


def test_monitoring_map_covers_individuals_with_no_sightings(db: Session, world: dict):
    from app.services.monitoring import monitoring_map

    empty = Individual(
        project_id=world["project"].id, code="JAG-0099", species="jaguar",
        life_status="unknown", identity_status="unnamed",
    )
    db.add(empty)
    db.commit()
    stats = monitoring_map(db, [world["individual"].id, empty.id], now=NOW)
    assert stats[world["individual"].id]["sighting_count"] == 2
    assert stats[empty.id]["sighting_count"] == 0
    assert stats[empty.id]["last_seen"] is None
    assert stats[empty.id]["movement"]["total_min_distance_km"] == 0.0


def test_public_profile_does_not_expose_who_edited_the_record(db: Session, world: dict):
    from app.routers.public import public_jaguar

    patch_individual_details(
        world["individual"].id,
        IndividualDetailsPatch(age_class="adult"),
        db=db,
        user=world["scientist"],
    )
    world["individual"].share_public = True
    db.commit()

    payload = public_jaguar(world["individual"].code, db=db)
    assert payload["age_class"] == "adult"
    assert "details_updated_by" not in payload
    assert "details_updated_at" not in payload


def test_discovery_curve_only_ever_rises(db: Session, world: dict):
    from app.services.monitoring import discovery_curve, monitoring_map

    second = Individual(
        project_id=world["project"].id, code="JAG-0021", species="jaguar",
        life_status="unknown", identity_status="unnamed",
    )
    db.add(second)
    db.flush()
    db.add(
        Detection(
            project_id=world["project"].id,
            individual_id=second.id,
            uploader_id=world["citizen"].id,
            species="jaguar",
            grade="confirmed",
            captured_at=NOW - timedelta(days=400),
            confidence=0.8,
        )
    )
    db.commit()
    individuals = list(db.scalars(select(Individual)))
    stats = monitoring_map(db, [row.id for row in individuals], now=NOW)
    curve = discovery_curve(individuals, stats)
    assert curve["label"] == "Individuals catalogued to date"
    assert "not a population estimate" in curve["note"]
    assert curve["cumulative"] == sorted(curve["cumulative"])
    assert curve["cumulative"][-1] == len(individuals)
