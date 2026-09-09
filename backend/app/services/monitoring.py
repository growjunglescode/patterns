"""Monitoring layer: sighting history, movement geometry, and catalogue statistics.

Everything here is derived from confirmed sightings — detections that a human has
linked to a known individual. Nothing in this module estimates population size;
that needs spatial capture-recapture and is deliberately out of scope.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Detection, Individual

EARTH_RADIUS_KM = 6371.0088

# Grades that mean "a human tied this photo to this individual".
CONFIRMED_GRADES = frozenset({"confirmed", "research_grade"})

MOVEMENT_CAVEAT = (
    "Straight-line distances between camera detections. The real path an animal "
    "walked is always longer, so treat every figure as a minimum."
)

DISCOVERY_CURVE_NOTE = (
    "This is a discovery curve, not a population estimate: it can only rise as new "
    "individuals are catalogued. A curve that flattens out suggests most of the "
    "population in the surveyed area has now been found."
)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two WGS84 points."""
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = radians(lon2 - lon1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(a)))


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def sighting_timestamp(detection: Detection) -> datetime | None:
    return _aware(detection.captured_at) or _aware(detection.created_at)


def is_confirmed_sighting(detection: Detection) -> bool:
    return bool(detection.individual_id) and detection.grade in CONFIRMED_GRADES


def confirmed_sightings(db: Session, individual_id: str) -> list[Detection]:
    """Confirmed sightings for one individual, oldest first."""
    rows = db.scalars(
        select(Detection)
        .options(selectinload(Detection.station))
        .where(Detection.individual_id == individual_id)
    ).all()
    return order_sightings([row for row in rows if is_confirmed_sighting(row)])


def order_sightings(rows: list[Detection]) -> list[Detection]:
    dated = [row for row in rows if sighting_timestamp(row) is not None]
    dated.sort(key=lambda row: sighting_timestamp(row))
    return dated


def sighting_history(rows: list[Detection], *, now: datetime | None = None) -> dict:
    """First seen, last seen and days-since-seen from an individual's sightings."""
    now = now or datetime.now(timezone.utc)
    ordered = order_sightings(rows)
    if not ordered:
        return {
            "first_seen": None,
            "last_seen": None,
            "days_since_seen": None,
            "sighting_count": 0,
            "active_last_90_days": False,
        }
    first = sighting_timestamp(ordered[0])
    last = sighting_timestamp(ordered[-1])
    days_since = max(0, (now - last).days)
    return {
        "first_seen": first,
        "last_seen": last,
        "days_since_seen": days_since,
        "sighting_count": len(ordered),
        "active_last_90_days": days_since <= 90,
    }


def _located(rows: list[Detection]) -> list[Detection]:
    return [
        row
        for row in rows
        if row.latitude is not None and row.longitude is not None
    ]


def movement_legs(rows: list[Detection]) -> list[dict]:
    """Consecutive point-to-point hops, in time order, for located sightings."""
    points = _located(order_sightings(rows))
    legs: list[dict] = []
    for previous, current in zip(points, points[1:]):
        km = haversine_km(
            previous.latitude, previous.longitude, current.latitude, current.longitude
        )
        start = sighting_timestamp(previous)
        end = sighting_timestamp(current)
        legs.append(
            {
                "from_detection_id": previous.id,
                "to_detection_id": current.id,
                "from_station": previous.station.code if previous.station else None,
                "to_station": current.station.code if current.station else None,
                "from_at": start,
                "to_at": end,
                "days_apart": max(0, (end - start).days),
                "km": round(km, 2),
            }
        )
    return legs


def max_span_km(rows: list[Detection]) -> float:
    """Largest straight-line gap between any two located sightings."""
    points = _located(rows)
    widest = 0.0
    for i, a in enumerate(points):
        for b in points[i + 1 :]:
            widest = max(
                widest, haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
            )
    return round(widest, 2)


def movement_summary(rows: list[Detection], *, now: datetime | None = None) -> dict:
    """Minimum distances moved, camera spread, and the widest detection span."""
    now = now or datetime.now(timezone.utc)
    ordered = order_sightings(rows)
    legs = movement_legs(ordered)
    cutoff = now - timedelta(days=30)
    recent_km = sum(
        leg["km"] for leg in legs if leg["to_at"] is not None and leg["to_at"] >= cutoff
    )
    stations = {row.station_id for row in ordered if row.station_id}
    return {
        "total_min_distance_km": round(sum(leg["km"] for leg in legs), 2),
        "distance_last_30_days_km": round(recent_km, 2),
        "distinct_cameras": len(stations),
        "max_span_km": max_span_km(ordered),
        "leg_count": len(legs),
        "located_sighting_count": len(_located(ordered)),
        "is_minimum_estimate": True,
        "caveat": MOVEMENT_CAVEAT,
    }


def leg_sentence(label: str, leg: dict) -> str:
    """Plain-English description of one hop, e.g. the sentence shown in the UI."""
    km = leg["km"]
    distance = f"{km:.1f} km" if km >= 0.1 else "less than 100 m"
    return f"{label} travelled approximately {distance} between these two sightings."


def individual_monitoring(
    db: Session, individual_id: str, *, now: datetime | None = None
) -> dict:
    rows = confirmed_sightings(db, individual_id)
    history = sighting_history(rows, now=now)
    movement = movement_summary(rows, now=now)
    return {**history, "movement": movement}


def monitoring_map(
    db: Session, individual_ids: list[str] | None = None, *, now: datetime | None = None
) -> dict[str, dict]:
    """Batched monitoring stats keyed by individual id (one query for all rows)."""
    now = now or datetime.now(timezone.utc)
    stmt = select(Detection).options(selectinload(Detection.station)).where(
        Detection.individual_id.is_not(None)
    )
    if individual_ids is not None:
        if not individual_ids:
            return {}
        stmt = stmt.where(Detection.individual_id.in_(individual_ids))
    grouped: dict[str, list[Detection]] = defaultdict(list)
    for row in db.scalars(stmt).all():
        if is_confirmed_sighting(row):
            grouped[row.individual_id].append(row)
    result: dict[str, dict] = {}
    for iid in individual_ids if individual_ids is not None else grouped.keys():
        rows = grouped.get(iid, [])
        result[iid] = {
            **sighting_history(rows, now=now),
            "movement": movement_summary(rows, now=now),
        }
    return result


def catalogue_date(individual: Individual, history: dict | None) -> datetime | None:
    """When an individual entered the catalogue: first confirmed sighting, else record creation."""
    if history and history.get("first_seen"):
        return history["first_seen"]
    return _aware(individual.created_at)


def discovery_curve(
    individuals: list[Individual], monitoring: dict[str, dict]
) -> dict:
    """Cumulative count of individuals catalogued, by month. Only ever increases."""
    per_month: dict[str, int] = defaultdict(int)
    for individual in individuals:
        when = catalogue_date(individual, monitoring.get(individual.id))
        if when is None:
            continue
        per_month[when.strftime("%Y-%m")] += 1
    months = sorted(per_month)
    running = 0
    cumulative: list[int] = []
    for month in months:
        running += per_month[month]
        cumulative.append(running)
    return {
        "months": months,
        "cumulative": cumulative,
        "label": "Individuals catalogued to date",
        "note": DISCOVERY_CURVE_NOTE,
    }
