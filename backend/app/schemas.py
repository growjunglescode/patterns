from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=2, max_length=120)
    role: str = "citizen"


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    verified: bool
    orcid: str | None = None
    organization: str | None = None
    bio: str | None = None
    profile_public: bool = False
    photo_count: int = 0
    affiliation_type: str | None = None
    phone: str | None = None
    country: str | None = None
    city: str | None = None
    study_country: str | None = None
    study_region: str | None = None
    onboarding_complete: bool = False
    home_project_id: str | None = None

    model_config = {"from_attributes": True}


class UserAdminPatch(BaseModel):
    role: str | None = None
    verified: bool | None = None
    display_name: str | None = None
    profile_public: bool | None = None


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    organization: str | None = Field(default=None, max_length=160)
    bio: str | None = Field(default=None, max_length=500)
    orcid: str | None = Field(default=None, max_length=32)
    profile_public: bool | None = None
    phone: str | None = Field(default=None, max_length=40)
    country: str | None = Field(default=None, max_length=80)
    city: str | None = Field(default=None, max_length=80)
    study_country: str | None = Field(default=None, max_length=80)
    study_region: str | None = Field(default=None, max_length=120)


class OnboardingStationIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    code: str | None = Field(default=None, max_length=32)
    latitude: float | None = None
    longitude: float | None = None


class OnboardingRequest(BaseModel):
    affiliation_type: str = Field(description="university | institution | hobby")
    organization: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    country: str = Field(min_length=2, max_length=80)
    city: str | None = Field(default=None, max_length=80)
    study_country: str | None = Field(default=None, max_length=80)
    study_region: str | None = Field(default=None, max_length=120)
    project_name: str | None = Field(default=None, max_length=160)
    bio: str | None = Field(default=None, max_length=500)
    stations: list[OnboardingStationIn] = Field(default_factory=list)


class SharePatch(BaseModel):
    share_public: bool


class ProjectOut(BaseModel):
    id: str
    name: str
    slug: str
    region: str | None
    active: bool
    organization_id: str | None = None
    organization_name: str | None = None
    individual_count: int = 0
    detection_count: int = 0
    station_count: int = 0

    model_config = {"from_attributes": True}


class StationOut(BaseModel):
    id: str
    code: str
    name: str
    latitude: float
    longitude: float
    camera_model: str | None
    project_id: str
    detection_count: int = 0

    model_config = {"from_attributes": True}


class MovementSummaryOut(BaseModel):
    """Minimum straight-line movement between camera detections."""

    total_min_distance_km: float = 0.0
    distance_last_30_days_km: float = 0.0
    distinct_cameras: int = 0
    max_span_km: float = 0.0
    leg_count: int = 0
    located_sighting_count: int = 0
    is_minimum_estimate: bool = True
    caveat: str = ""


class MovementLegOut(BaseModel):
    from_detection_id: str
    to_detection_id: str
    from_station: str | None = None
    to_station: str | None = None
    from_at: datetime | None = None
    to_at: datetime | None = None
    days_apart: int = 0
    km: float = 0.0
    sentence: str = ""


class IndividualDetailsPatch(BaseModel):
    sex: str | None = None
    life_status: str | None = None
    age_class: str | None = None
    birth_year_estimate: int | None = None
    physical_notes: str | None = Field(default=None, max_length=2000)


class IndividualOut(BaseModel):
    id: str
    code: str
    display_name: str
    species: str
    sex: str | None
    life_status: str
    identity_status: str
    named_by_id: str | None
    detection_count: int = 0
    project_id: str
    project_name: str | None = None
    share_public: bool = False
    created_at: datetime
    # Monitoring layer (derived from confirmed sightings)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    days_since_seen: int | None = None
    sighting_count: int = 0
    active_last_90_days: bool = False
    movement: MovementSummaryOut | None = None
    # Editable field details
    age_class: str | None = None
    birth_year_estimate: int | None = None
    physical_notes: str | None = None
    details_updated_by: str | None = None
    details_updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class MediaOut(BaseModel):
    id: str
    kind: str
    url: str
    content_type: str
    original_filename: str
    is_best_frame: bool


class CandidateOut(BaseModel):
    id: str
    code: str
    display_name: str
    score: float


class DetectionOut(BaseModel):
    id: str
    project_id: str
    project_name: str | None = None
    station_code: str | None = None
    individual_id: str | None
    individual_code: str | None = None
    individual_name: str | None = None
    suggested_individual_id: str | None
    suggested_name: str | None = None
    uploader_name: str | None = None
    uploader_id: str | None = None
    reviewer_name: str | None = None
    reviewer_id: str | None = None
    second_reviewer_name: str | None = None
    second_reviewer_id: str | None = None
    species: str
    side: str
    captured_at: datetime | None
    latitude: float | None
    longitude: float | None
    confidence: float
    match_score: float | None
    grade: str
    summary: str | None
    notes: str | None
    created_at: datetime
    media: list[MediaOut] = []
    candidates: list[CandidateOut] = []
    missing_location: bool = False
    missing_time: bool = False
    camera_make: str | None = None
    camera_model: str | None = None
    metadata_source: str | None = None
    identity_status: str | None = None
    known_match: bool = False
    needs_name: bool = False
    is_identifiable: bool = False
    needs_species_confirm: bool = False
    engine: str | None = None
    model_version: str | None = None
    review_state: str | None = None
    match_library_size: int | None = None
    match_library_ready: bool | None = None
    match_library_note: str | None = None


class MergeIndividualsRequest(BaseModel):
    keep_id: str
    absorb_id: str


class AssertSpeciesRequest(BaseModel):
    species: str = "jaguar"


class MetadataPatch(BaseModel):
    captured_at: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    station_id: str | None = None
    notes: str | None = None


class NamingClaimOut(BaseModel):
    id: str
    individual_id: str
    individual_code: str
    proposed_name: str
    proposer_name: str
    status: str
    created_at: datetime


class NameRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class ConfirmRequest(BaseModel):
    individual_id: str | None = None
    reject: bool = False
    create_new: bool = False
    proposed_name: str | None = None
    side: str | None = None
    species: str | None = None


class ClaimDecision(BaseModel):
    approve: bool
