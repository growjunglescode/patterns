const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type User = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  verified: boolean;
  orcid?: string | null;
  organization?: string | null;
  bio?: string | null;
  profile_public?: boolean;
  photo_count?: number;
  affiliation_type?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  study_country?: string | null;
  study_region?: string | null;
  onboarding_complete?: boolean;
  home_project_id?: string | null;
};

export type Detection = {
  id: string;
  project_name: string | null;
  country?: string | null;
  region?: string | null;
  station_code: string | null;
  station_name?: string | null;
  individual_id: string | null;
  individual_code: string | null;
  individual_name: string | null;
  suggested_individual_id: string | null;
  suggested_name: string | null;
  uploader_name: string | null;
  uploader_id?: string | null;
  reviewer_name?: string | null;
  reviewer_id?: string | null;
  second_reviewer_name?: string | null;
  second_reviewer_id?: string | null;
  species: string;
  scientific_name?: string | null;
  common_name?: string | null;
  side: string;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  match_score: number | null;
  grade: string;
  summary: string | null;
  notes: string | null;
  created_at: string;
  media: { id: string; kind: string; url: string; is_best_frame: boolean }[];
  candidates: { id: string; code: string; display_name: string; score: number }[];
  missing_location?: boolean;
  missing_time?: boolean;
  location_from_exif?: boolean;
  camera_make?: string | null;
  camera_model?: string | null;
  metadata_source?: string | null;
  identity_status?: string | null;
  known_match?: boolean;
  needs_name?: boolean;
  can_register_new?: boolean;
  is_identifiable?: boolean;
  needs_species_confirm?: boolean;
  engine?: string | null;
  model_version?: string | null;
  review_state?: string | null;
  match_library_size?: number | null;
  match_library_ready?: boolean | null;
  match_library_note?: string | null;
};

export type MovementSummary = {
  total_min_distance_km: number;
  distance_last_30_days_km: number;
  distinct_cameras: number;
  max_span_km: number;
  leg_count: number;
  located_sighting_count: number;
  is_minimum_estimate: boolean;
  caveat: string;
};

export type MovementLeg = {
  from_detection_id: string;
  to_detection_id: string;
  from_station: string | null;
  to_station: string | null;
  from_at: string | null;
  to_at: string | null;
  days_apart: number;
  km: number;
  sentence: string;
};

export type Movement = {
  individual_id: string;
  individual_code: string;
  display_name: string;
  summary: MovementSummary;
  legs: MovementLeg[];
  caveat: string;
};

export type Individual = {
  id: string;
  code: string;
  display_name: string;
  species: string;
  common_name?: string | null;
  scientific_name?: string | null;
  sex: string | null;
  life_status: string;
  identity_status: string;
  detection_count: number;
  project_name: string | null;
  country?: string | null;
  region?: string | null;
  share_public?: boolean;
  first_seen?: string | null;
  last_seen?: string | null;
  days_since_seen?: number | null;
  sighting_count?: number;
  active_last_90_days?: boolean;
  movement?: MovementSummary | null;
  age_class?: string | null;
  birth_year_estimate?: number | null;
  physical_notes?: string | null;
  details_updated_by?: string | null;
  details_updated_at?: string | null;
};

export type IndividualDetailsPatch = {
  sex?: string | null;
  life_status?: string | null;
  age_class?: string | null;
  birth_year_estimate?: number | null;
  physical_notes?: string | null;
};

export type NamingClaim = {
  id: string;
  individual_id: string;
  individual_code: string;
  proposed_name: string;
  proposer_name: string;
  status: string;
  created_at: string;
};

export type Station = {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  camera_model: string | null;
  detection_count: number;
};

export function mediaSrc(url: string) {
  if (url.startsWith("http")) return url;
  return `${API}${url}`;
}

export function token() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("patterns_token");
}

export function gradeLabel(grade: string) {
  return {
    casual: "Field encounter",
    needs_id: "Needs identification",
    confirmed: "Confirmed identity",
    research_grade: "Research-grade identity",
  }[grade] || grade;
}

export function reviewStateLabel(state?: string | null) {
  return (
    {
      potential_match: "Likely match (needs confirmation)",
      confirmed_match: "Confirmed identity",
      rejected_match: "Rejected match",
      new_jaguar: "Uncatalogued individual",
      awaiting_second_review: "Awaiting second confirmation",
    }[state || ""] || ""
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

/** Fetch a protected file with the bearer token, then save it locally. */
async function download(path: string, filename: string) {
  const headers = new Headers();
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  register: (body: object) => request<User>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const data = await request<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    localStorage.setItem("patterns_token", data.access_token);
    return data;
  },
  me: () => request<User>("/api/auth/me"),
  patchMe: (body: object) => request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  completeOnboarding: (body: object) =>
    request<User>("/api/auth/onboarding", { method: "POST", body: JSON.stringify(body) }),
  searchInstitutions: (q: string, affiliation?: string) => {
    const p = new URLSearchParams();
    p.set("q", q);
    if (affiliation) p.set("affiliation", affiliation);
    return request<{
      query: string;
      results: {
        id?: string | null;
        name: string;
        country?: string | null;
        city?: string | null;
        types?: string[];
        acronyms?: string[];
      }[];
    }>(`/api/institutions/search?${p.toString()}`);
  },
  overview: (projectId?: string) =>
    request<any>(`/api/overview${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  portfolio: () => request<any>("/api/portfolio"),
  analytics: (projectId?: string) =>
    request<any>(`/api/analytics${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  map: (mode = "sightings", individualId?: string, uploaderId?: string, projectId?: string) => {
    const p = new URLSearchParams();
    p.set("mode", mode);
    if (individualId) p.set("individual_id", individualId);
    if (uploaderId) p.set("uploader_id", uploaderId);
    if (projectId) p.set("project_id", projectId);
    return request<{ points: any[]; track?: any[] }>(`/api/map?${p.toString()}`);
  },
  stations: (projectId?: string) =>
    request<Station[]>(`/api/stations${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  detections: (
    grade?: string,
    individualId?: string,
    uploaderId?: string,
    reviewState?: string,
    projectId?: string,
  ) => {
    const p = new URLSearchParams();
    if (grade) p.set("grade", grade);
    if (individualId) p.set("individual_id", individualId);
    if (uploaderId) p.set("uploader_id", uploaderId);
    if (reviewState) p.set("review_state", reviewState);
    if (projectId) p.set("project_id", projectId);
    const q = p.toString();
    return request<Detection[]>(`/api/detections${q ? `?${q}` : ""}`);
  },
  detection: (id: string) => request<Detection>(`/api/detections/${id}`),
  confirm: (id: string, body: object) =>
    request<Detection>(`/api/detections/${id}/confirm`, { method: "POST", body: JSON.stringify(body) }),
  upload: (form: FormData) => request<Detection>("/api/uploads", { method: "POST", body: form }),
  patchMetadata: (id: string, body: object) =>
    request<Detection>(`/api/detections/${id}/metadata`, { method: "PATCH", body: JSON.stringify(body) }),
  assertSpecies: (id: string, species = "jaguar") =>
    request<Detection>(`/api/detections/${id}/assert-species`, {
      method: "POST",
      body: JSON.stringify({ species }),
    }),
  discardDetection: (id: string) =>
    request<{ status: string }>(`/api/detections/${id}`, { method: "DELETE" }),
  individuals: (q?: string, projectId?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (projectId) p.set("project_id", projectId);
    const qs = p.toString();
    return request<Individual[]>(`/api/individuals${qs ? `?${qs}` : ""}`);
  },
  individual: (code: string) => request<Individual>(`/api/individuals/${code}`),
  mergeIndividuals: (keepId: string, absorbId: string) =>
    request<Individual>("/api/individuals/merge", {
      method: "POST",
      body: JSON.stringify({ keep_id: keepId, absorb_id: absorbId }),
    }),
  proposeName: (id: string, name: string) =>
    request<NamingClaim>(`/api/individuals/${id}/name`, { method: "POST", body: JSON.stringify({ name }) }),
  claims: (projectId?: string, status: string = "pending") => {
    const p = new URLSearchParams();
    if (projectId) p.set("project_id", projectId);
    if (status) p.set("status", status);
    const qs = p.toString();
    return request<NamingClaim[]>(`/api/naming-claims${qs ? `?${qs}` : ""}`);
  },
  decideClaim: (id: string, approve: boolean) =>
    request<NamingClaim>(`/api/naming-claims/${id}/decision`, { method: "POST", body: JSON.stringify({ approve }) }),
  projectData: (projectId: string) => request<any[]>(`/api/projects/${projectId}/data`),
  captureMatrix: (projectId: string) => request<any>(`/api/projects/${projectId}/capture-matrix`),
  dashboard: (projectId?: string) =>
    request<any>(`/api/dashboard${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  movement: (code: string) => request<Movement>(`/api/individuals/${encodeURIComponent(code)}/movement`),
  patchIndividualDetails: (code: string, body: IndividualDetailsPatch) =>
    request<Individual>(`/api/individuals/${encodeURIComponent(code)}/details`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  exportSightingsCsv: (projectId?: string) =>
    download(
      `/api/exports/sightings.csv${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
      "patterns-sightings.csv",
    ),
  exportCaptureMatrixCsv: (projectId?: string) =>
    download(
      `/api/exports/capture-matrix.csv${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
      "patterns-capture-matrix.csv",
    ),
  exportSightingsGeoJson: (projectId?: string) =>
    download(
      `/api/exports/sightings.geojson${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
      "patterns-sightings.geojson",
    ),
  users: () => request<User[]>("/api/users"),
  patchUser: (id: string, body: object) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminOverview: () => request<any>("/api/admin/overview"),
  adminPeople: () => request<any[]>("/api/admin/people"),
  adminEstate: () => request<any>("/api/admin/estate"),
  adminWorkspace: (id: string) => request<any>(`/api/admin/workspaces/${id}`),
  adminCreateProject: (body: {
    name: string;
    region?: string | null;
    organization_id?: string | null;
    organization_name?: string | null;
    owner_user_id?: string | null;
    active?: boolean;
  }) => request<any>("/api/admin/projects", { method: "POST", body: JSON.stringify(body) }),
  adminPatchProject: (id: string, body: object) =>
    request<any>(`/api/admin/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminAddMember: (projectId: string, body: { user_id: string; member_role?: string }) =>
    request<any>(`/api/admin/projects/${projectId}/members`, { method: "POST", body: JSON.stringify(body) }),
  adminRemoveMember: (projectId: string, userId: string) =>
    request<any>(`/api/admin/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  adminSetHomeProject: (userId: string, projectId: string | null) =>
    request<any>(`/api/admin/people/${userId}/home-project`, {
      method: "PATCH",
      body: JSON.stringify({ project_id: projectId }),
    }),
  adminCatalog: (params?: { q?: string; grade?: string; review_state?: string; project_id?: string }) => {
    const p = new URLSearchParams();
    if (params?.q) p.set("q", params.q);
    if (params?.grade) p.set("grade", params.grade);
    if (params?.review_state) p.set("review_state", params.review_state);
    if (params?.project_id) p.set("project_id", params.project_id);
    const qs = p.toString();
    return request<any>(`/api/admin/catalog${qs ? `?${qs}` : ""}`);
  },
  adminSpecies: () => request<any[]>("/api/admin/species"),
  adminPatchSpecies: (id: string, body: object) =>
    request<any>(`/api/admin/species/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminAudit: (params?: {
    action?: string;
    entity?: string;
    actor_id?: string;
    project_id?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.action) p.set("action", params.action);
    if (params?.entity) p.set("entity", params.entity);
    if (params?.actor_id) p.set("actor_id", params.actor_id);
    if (params?.project_id) p.set("project_id", params.project_id);
    if (params?.q) p.set("q", params.q);
    if (params?.page) p.set("page", String(params.page));
    if (params?.page_size) p.set("page_size", String(params.page_size));
    const qs = p.toString();
    return request<any>(`/api/admin/audit${qs ? `?${qs}` : ""}`);
  },
  adminRecognition: (page = 1) => request<any>(`/api/admin/recognition?page=${page}&page_size=40`),
  adminRecognitionExport: () => request<any>("/api/admin/recognition/export", { method: "POST", body: "{}" }),
  adminRecognitionTrain: (body: { force?: boolean; epochs?: number; activate?: boolean; backfill?: boolean } = {}) =>
    request<any>("/api/admin/recognition/train", { method: "POST", body: JSON.stringify(body) }),
  adminRecognitionActivate: () => request<any>("/api/admin/recognition/activate", { method: "POST", body: "{}" }),
  shareIndividual: (id: string, share_public: boolean) =>
    request<Individual>(`/api/individuals/${id}/sharing`, { method: "PATCH", body: JSON.stringify({ share_public }) }),
  publicPerson: (id: string) => request<any>(`/api/public/people/${id}`),
  publicIndividual: (code: string) => request<any>(`/api/public/individuals/${encodeURIComponent(code)}`),
  modelSummary: (params?: {
    start?: string;
    end?: string;
    engine?: string;
    model_version?: string;
    project_id?: string;
  }) => {
    const p = new URLSearchParams();
    if (params?.start) p.set("start", params.start);
    if (params?.end) p.set("end", params.end);
    if (params?.engine) p.set("engine", params.engine);
    if (params?.model_version) p.set("model_version", params.model_version);
    if (params?.project_id) p.set("project_id", params.project_id);
    const q = p.toString();
    return request<any>(`/api/model/summary${q ? `?${q}` : ""}`);
  },
  modelScoreDistribution: (params?: {
    start?: string;
    end?: string;
    engine?: string;
    model_version?: string;
    project_id?: string;
  }) => {
    const p = new URLSearchParams();
    if (params?.start) p.set("start", params.start);
    if (params?.end) p.set("end", params.end);
    if (params?.engine) p.set("engine", params.engine);
    if (params?.model_version) p.set("model_version", params.model_version);
    if (params?.project_id) p.set("project_id", params.project_id);
    const q = p.toString();
    return request<any>(`/api/model/score-distribution${q ? `?${q}` : ""}`);
  },
  modelDecisions: (params?: {
    start?: string;
    end?: string;
    engine?: string;
    model_version?: string;
    review_state?: string;
    outcome?: string;
    page?: number;
    page_size?: number;
    project_id?: string;
  }) => {
    const p = new URLSearchParams();
    if (params?.start) p.set("start", params.start);
    if (params?.end) p.set("end", params.end);
    if (params?.engine) p.set("engine", params.engine);
    if (params?.model_version) p.set("model_version", params.model_version);
    if (params?.review_state) p.set("review_state", params.review_state);
    if (params?.outcome) p.set("outcome", params.outcome);
    if (params?.page) p.set("page", String(params.page));
    if (params?.page_size) p.set("page_size", String(params.page_size));
    if (params?.project_id) p.set("project_id", params.project_id);
    const q = p.toString();
    return request<any>(`/api/model/decisions${q ? `?${q}` : ""}`);
  },
  logout: () => {
    if (typeof window !== "undefined") localStorage.removeItem("patterns_token");
  },
};
