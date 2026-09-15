"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SightingsMap } from "@/components/SightingsMap";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import {
  CANDIDATE_SCORE_HELP,
  FLANK_HELP,
  InfoTip,
  SIMILARITY_SCORE_HELP,
} from "@/components/InfoTip";
import { api, mediaSrc, type Detection, type Individual, type Movement, type Station, type User } from "@/lib/api";
import { isAdmin, isScientist } from "@/lib/roles";
import { useProjectId } from "@/lib/useProjectId";

const AGE_CLASSES = ["unknown", "cub", "juvenile", "subadult", "adult"];
const LIFE_STATUSES = ["unknown", "alive", "dead", "lost"];
const IDENTITY_STATUSES = ["unnamed", "under_review", "named"];
const FLANKS = [
  { value: "L", label: "Left" },
  { value: "R", label: "Right" },
  { value: "B", label: "Both" },
  { value: "U", label: "Unknown" },
];

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCoords(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function km(value?: number | null) {
  if (value == null) return "—";
  return `${value < 0.1 ? "<0.1" : value.toFixed(1)} km`;
}

function flankLabel(side?: string | null) {
  return { L: "Left", R: "Right", B: "Both", U: "Unknown" }[side || "U"] || side || "Unknown";
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitRegion(region?: string | null, country?: string | null) {
  const raw = (region || "").trim();
  if (!raw) return { area: "", country: country || "" };
  if (raw.includes("·")) {
    const [area, c] = raw.split("·").map((part) => part.trim());
    return { area: area || "", country: c || country || "" };
  }
  if (raw.includes(",")) {
    const [area, c] = raw.split(",").map((part) => part.trim());
    return { area: area || "", country: c || country || "" };
  }
  if (country && raw === country) return { area: "", country };
  return { area: raw, country: country || "" };
}

export default function IndividualProfilePage() {
  const { code } = useParams<{ code: string }>();
  const [ind, setInd] = useState<Individual | null>(null);
  const [obs, setObs] = useState<Detection[]>([]);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detection | null>(null);
  const [mergeCode, setMergeCode] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const projectId = useProjectId();

  useEffect(() => {
    api.me().then(setMe).catch(() => undefined);
    api.individual(code).then(async (row) => {
      setInd(row);
      const rows = await api.detections(undefined, row.id);
      setObs(rows);
      const first = rows.find((d) => d.media.some((m) => m.kind !== "video")) || rows[0];
      if (first) setSelectedId(first.id);
      api.movement(row.code).then(setMovement).catch(() => undefined);
      api.stations(row.project_id).then(setStations).catch(() => setStations([]));
    });
  }, [code]);

  useEffect(() => {
    if (!me) return;
    if (!isScientist(me.role)) return;
    api
      .portfolio()
      .then((p) => setProjects((p?.projects || []).map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }))))
      .catch(() => setProjects([]));
  }, [me]);

  useEffect(() => {
    if (!selectedId) return;
    api.detection(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  if (!ind) return <p>Loading…</p>;
  const mine = obs.filter((d) => d.individual_id === ind.id);
  const selected = mine.find((d) => d.id === selectedId) || mine[0];
  const cover =
    (detail || selected)?.media.find((m) => m.kind !== "video") ||
    selected?.media.find((m) => m.kind !== "video");

  const mapped = mine.filter((d) => d.latitude != null && d.longitude != null);
  const track = [...mapped]
    .sort((a, b) => (a.captured_at || a.created_at).localeCompare(b.captured_at || b.created_at))
    .map((d) => {
      const thumb = d.media.find((m) => m.kind !== "video");
      return {
        lat: d.latitude as number,
        lng: d.longitude as number,
        label: ind.display_name,
        captured_at: d.captured_at,
        photo_url: thumb?.url || null,
        location: d.station_name || d.station_code || null,
        station_code: d.station_code,
        href: `/observations/${d.id}`,
      };
    });

  const canEdit = isScientist(me?.role);
  const canEditSighting =
    Boolean(selected) &&
    (isScientist(me?.role) || Boolean(me && selected && selected.uploader_id === me.id));
  const stale = ind.days_since_seen != null && ind.days_since_seen > 180;
  const provenance = detail || selected;
  const candidates = detail?.candidates || [];

  return (
    <div className="space-y-6">
      <div className="xl:grid xl:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:gap-5">
        <aside className="surface mb-5 space-y-4 p-5 xl:mb-0">
          <p className="page-kicker">Identity (catalog record)</p>
          {canEdit ? (
            <CatalogEditor
              individual={ind}
              projects={projects}
              sightingCount={ind.sighting_count ?? mine.length}
              onSaved={async (updated) => {
                setInd(updated);
                setObs(await api.detections(undefined, updated.id));
                if (updated.project_id !== ind.project_id) {
                  api.stations(updated.project_id).then(setStations).catch(() => setStations([]));
                }
              }}
            />
          ) : (
            <>
              <h1 className="page-title mt-1 text-[1.55rem]">{ind.display_name}</h1>
              <p className="font-mono text-[12px] text-ink/50">{ind.code}</p>
              <p className="text-[13px] text-ink/60">
                {ind.common_name || ind.species}
                {ind.scientific_name ? (
                  <>
                    {" "}
                    · <em>{ind.scientific_name}</em>
                  </>
                ) : null}
              </p>
              <dl className="space-y-3 text-[13px]">
                {[
                  ["Status", ind.identity_status],
                  ["Country", ind.country || "—"],
                  ["Region", ind.region && ind.region !== ind.country ? ind.region : "—"],
                  ["Project", ind.project_name || "—"],
                  ["Sex", ind.sex || "unknown"],
                  ["Life", ind.life_status],
                  ["Age", ind.age_class || "unknown"],
                  ["Sightings", String(ind.sighting_count ?? mine.length)],
                  ["First seen", fmtDate(ind.first_seen)],
                  ["Last seen", fmtDate(ind.last_seen)],
                  ["Days silent", ind.days_since_seen == null ? "—" : String(ind.days_since_seen)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-ink/[0.06] pb-2">
                    <dt className="text-ink/45">{label}</dt>
                    <dd className={label === "Status" || label === "Sex" || label === "Life" || label === "Age" ? "capitalize" : ""}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {stale && (
            <p className="text-[12.5px] text-[var(--signal-warn)]">Not seen in {ind.days_since_seen} days.</p>
          )}
          {isScientist(me?.role) && (
            <div className="space-y-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(ind.share_public)}
                  onChange={async (e) => {
                    const updated = await api.shareIndividual(ind.id, e.target.checked);
                    setInd(updated);
                  }}
                />
                Share public profile
              </label>
              {ind.share_public && (
                <button
                  type="button"
                  className="font-semibold text-gold-deep"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/share/individuals/${ind.code}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  {copied ? "Copied" : "Copy share link"}
                </button>
              )}
            </div>
          )}
        </aside>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper)]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(cover.url)} alt="" className="max-h-[28rem] w-full object-contain bg-black" />
            ) : (
              <div className="flex h-64 items-center justify-center text-[13px] text-ink/45">No photo yet</div>
            )}
            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5 text-[12.5px] text-ink/50">
                <span>
                  {selected.station_name || selected.station_code || "No station"} · {flankLabel(selected.side)} ·{" "}
                  {fmtDateTime(selected.captured_at || selected.created_at)}
                </span>
                <span className="flex items-center gap-2">
                  <GradeBadge grade={selected.grade} />
                  <ReviewStateBadge state={selected.review_state} />
                </span>
              </div>
            )}
          </div>

          {selected && (
            <div className="surface p-4">
              <p className="section-title mb-3">Selected sighting</p>
              {canEditSighting ? (
                <SightingEditor
                  key={selected.id}
                  detection={detail || selected}
                  stations={stations}
                  fallbackCountry={ind.country || ""}
                  onSaved={async (updated) => {
                    setDetail(updated);
                    setObs((rows) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                    const refreshed = await api.individual(ind.code);
                    setInd(refreshed);
                  }}
                />
              ) : (
                <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                  {[
                    ["Taken", fmtDateTime(selected.captured_at || selected.created_at)],
                    ["Location", selected.station_name || selected.station_code || "—"],
                    ["Country", selected.country || ind.country || "—"],
                    ["Coordinates", fmtCoords(selected.latitude, selected.longitude)],
                    ["Flank", flankLabel(selected.side), FLANK_HELP],
                    ["Camera", [selected.camera_make, selected.camera_model].filter(Boolean).join(" ") || "—"],
                  ].map(([label, value, help]) => (
                    <div key={label as string}>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-ink/45">
                        <span className="inline-flex items-center">
                          {label}
                          {help ? <InfoTip label={`About ${label}`}>{help as string}</InfoTip> : null}
                        </span>
                      </dt>
                      <dd className="mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {(selected.notes || selected.summary) && !canEditSighting && (
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Scientific notes</p>
                  <p className="mt-1 whitespace-pre-line text-[13.5px]">{selected.notes || selected.summary}</p>
                </div>
              )}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="surface p-4">
              <p className="section-title mb-2 inline-flex items-center">
                Capture candidates
                <InfoTip label="About candidate scores">{CANDIDATE_SCORE_HELP}</InfoTip>
              </p>
              <p className="mb-3 text-[12.5px] text-ink/45">
                Ranked from the method record. Identity is never assigned automatically.
              </p>
              <ul className="space-y-2 text-[13.5px]">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <Link href={`/individuals/${c.code}`} className="hover:text-gold">
                      {c.display_name} <span className="font-mono text-[12px] text-ink/45">{c.code}</span>
                    </Link>
                    <span className="font-mono text-[12px]" title={SIMILARITY_SCORE_HELP}>
                      {(c.score * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="section-title">Geotags</p>
                <p className="text-[12.5px] text-ink/45">
                  {mapped.length} located sighting{mapped.length === 1 ? "" : "s"} on the map
                </p>
              </div>
              <Link href={`/map?individual=${encodeURIComponent(ind.id)}`} className="text-[13px] text-gold">
                Open full map →
              </Link>
            </div>
            {track.length > 0 ? (
              <SightingsMap points={track} track={track} height={280} />
            ) : (
              <div className="surface flex h-40 items-center justify-center text-[13px] text-ink/45">
                No GPS yet on linked sightings
              </div>
            )}
          </div>

          <div>
            <p className="section-title mb-1">Matched gallery</p>
            <p className="mb-3 text-[12.5px] text-ink/45">
              All photos confirmed as this jaguar ({mine.length}). Select one to inspect time, place, and notes.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {mine.map((d) => {
                const thumb = d.media.find((m) => m.kind !== "video");
                const active = d.id === selected?.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`overflow-hidden rounded-[8px] border text-left ${
                      active ? "border-[var(--gold)]" : "border-[var(--line)]"
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaSrc(thumb.url)} alt="" className="h-20 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 items-center justify-center text-[11px] text-ink/40">{d.side}</div>
                    )}
                    <p className="truncate px-1.5 py-1 text-[10px] text-ink/45">
                      {fmtDate(d.captured_at || d.created_at)}
                    </p>
                  </button>
                );
              })}
              {mine.length === 0 && (
                <p className="col-span-full text-[13px] text-ink/45">No matched photos yet.</p>
              )}
            </div>
          </div>
        </section>

        <aside className="mt-5 space-y-4 xl:mt-0">
          <div className="surface p-5">
            <p className="section-title mb-3">Method record</p>
            <dl className="space-y-3 text-[13px]">
              {(
                [
                  ["Recognition method", provenance?.engine || "—"],
                  ["Model / calibration", provenance?.model_version || "—"],
                  [
                    "Similarity score",
                    provenance?.match_score != null ? `${(provenance.match_score * 100).toFixed(0)}%` : "—",
                    SIMILARITY_SCORE_HELP,
                  ],
                  ["Flank", flankLabel(provenance?.side), FLANK_HELP],
                  ["Observer", provenance?.uploader_name || "—"],
                  ["Confirmed by", provenance?.reviewer_name || "Not yet confirmed"],
                  ["Second review", provenance?.second_reviewer_name || "Pending"],
                  ["Review status", provenance?.review_state?.replaceAll("_", " ") || "—"],
                ] as [string, string, string?][]
              ).map(([label, value, help]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-ink/45">
                    <span className="inline-flex items-center">
                      {label}
                      {help ? <InfoTip label={`About ${label}`}>{help}</InfoTip> : null}
                    </span>
                  </dt>
                  <dd className="mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
            {selected && (
              <Link href={`/observations/${selected.id}`} className="mt-4 inline-block text-[13px] text-gold">
                Open full record
              </Link>
            )}
          </div>
          {(isAdmin(me?.role) || isScientist(me?.role)) && (
            <div className="surface p-5">
              <p className="section-title mb-2">Merge into this ID</p>
              <p className="mb-3 text-[12.5px] text-ink/45">
                Absorb another individual in this project. Sightings move here; the other code is removed.
              </p>
              <input
                className="w-full"
                placeholder="Code to absorb, e.g. JAG-0012"
                value={mergeCode}
                onChange={(e) => setMergeCode(e.target.value)}
              />
              {mergeError && <p className="mt-2 text-[12.5px] text-[#e8a39c]">{mergeError}</p>}
              <button
                type="button"
                className="btn-forest mt-3 !px-3 !py-1.5 text-[13px]"
                disabled={mergeBusy || !mergeCode.trim()}
                onClick={async () => {
                  setMergeBusy(true);
                  setMergeError("");
                  try {
                    const others = await api.individuals(mergeCode.trim(), projectId);
                    const absorb = others.find(
                      (row) => row.code.toLowerCase() === mergeCode.trim().toLowerCase() && row.id !== ind.id,
                    );
                    if (!absorb) throw new Error("No matching individual in this project");
                    if (
                      !window.confirm(
                        `Merge ${absorb.code} into ${ind.code}? Sightings move here and ${absorb.code} is permanently removed.`,
                      )
                    ) {
                      return;
                    }
                    const updated = await api.mergeIndividuals(ind.id, absorb.id);
                    setInd(updated);
                    setMergeCode("");
                    setObs(await api.detections(undefined, updated.id, undefined, undefined, projectId));
                  } catch (e) {
                    setMergeError(e instanceof Error ? e.message : "Merge failed");
                  } finally {
                    setMergeBusy(false);
                  }
                }}
              >
                {mergeBusy ? "Merging…" : "Merge"}
              </button>
            </div>
          )}
          <div className="surface p-5">
            <p className="section-title mb-3">Minimum movement (field trail)</p>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink/45">Total</dt>
                <dd>{km(ind.movement?.total_min_distance_km)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/45">Last 30 days</dt>
                <dd>{km(ind.movement?.distance_last_30_days_km)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/45">Cameras</dt>
                <dd>{ind.movement?.distinct_cameras ?? 0}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12px] text-ink/45">
              {movement?.caveat ||
                ind.movement?.caveat ||
                "Straight-line distances between cameras. The real path is always longer."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CatalogEditor({
  individual,
  projects,
  sightingCount,
  onSaved,
}: {
  individual: Individual;
  projects: { id: string; name: string }[];
  sightingCount: number;
  onSaved: (updated: Individual) => void | Promise<void>;
}) {
  const split = useMemo(
    () => splitRegion(individual.region, individual.country),
    [individual.region, individual.country],
  );
  const [displayName, setDisplayName] = useState(individual.display_name);
  const [status, setStatus] = useState(individual.identity_status || "unnamed");
  const [country, setCountry] = useState(split.country);
  const [region, setRegion] = useState(split.area);
  const [projectId, setProjectId] = useState(individual.project_id);
  const [sex, setSex] = useState(individual.sex || "unknown");
  const [lifeStatus, setLifeStatus] = useState(individual.life_status || "unknown");
  const [ageClass, setAgeClass] = useState(individual.age_class || "unknown");
  const [firstSeen, setFirstSeen] = useState(toLocalInput(individual.first_seen));
  const [lastSeen, setLastSeen] = useState(toLocalInput(individual.last_seen));
  const [notes, setNotes] = useState(individual.physical_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const next = splitRegion(individual.region, individual.country);
    setDisplayName(individual.display_name);
    setStatus(individual.identity_status || "unnamed");
    setCountry(next.country);
    setRegion(next.area);
    setProjectId(individual.project_id);
    setSex(individual.sex || "unknown");
    setLifeStatus(individual.life_status || "unknown");
    setAgeClass(individual.age_class || "unknown");
    setFirstSeen(toLocalInput(individual.first_seen));
    setLastSeen(toLocalInput(individual.last_seen));
    setNotes(individual.physical_notes || "");
  }, [individual]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const updated = await api.patchIndividualDetails(individual.code, {
        display_name: displayName,
        identity_status: status,
        country: country || null,
        region: region || null,
        project_id: projectId,
        sex,
        life_status: lifeStatus,
        age_class: ageClass,
        physical_notes: notes,
        first_seen: firstSeen ? new Date(firstSeen).toISOString() : null,
        last_seen: lastSeen ? new Date(lastSeen).toISOString() : null,
      });
      await onSaved(updated);
      setSaved("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-[13px]">
      <label className="block">
        <span className="text-ink/45">Name</span>
        <input className="mt-1 w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <p className="font-mono text-[12px] text-ink/50">{individual.code}</p>
      <p className="text-[13px] text-ink/60">
        {individual.common_name || individual.species}
        {individual.scientific_name ? (
          <>
            {" "}
            · <em>{individual.scientific_name}</em>
          </>
        ) : null}
      </p>
      <label className="block">
        <span className="text-ink/45">Status</span>
        <select className="mt-1 w-full capitalize" value={status} onChange={(e) => setStatus(e.target.value)}>
          {IDENTITY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-ink/45">Country</span>
        <input
          className="mt-1 w-full"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="e.g. Costa Rica"
          autoComplete="country-name"
        />
      </label>
      <label className="block">
        <span className="text-ink/45">Region</span>
        <input className="mt-1 w-full" value={region} onChange={(e) => setRegion(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-ink/45">Project</span>
        <select className="mt-1 w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {[...projects, { id: individual.project_id, name: individual.project_name || "Current project" }]
            .filter((row, index, all) => row.id && all.findIndex((item) => item.id === row.id) === index)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        <span className="text-ink/45">Sex</span>
        <select className="mt-1 w-full" value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="unknown">Unknown</option>
          <option value="F">Female</option>
          <option value="M">Male</option>
        </select>
      </label>
      <label className="block">
        <span className="text-ink/45">Life</span>
        <select className="mt-1 w-full capitalize" value={lifeStatus} onChange={(e) => setLifeStatus(e.target.value)}>
          {LIFE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-ink/45">Age</span>
        <select className="mt-1 w-full capitalize" value={ageClass} onChange={(e) => setAgeClass(e.target.value)}>
          {AGE_CLASSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-between gap-3 border-b border-ink/[0.06] pb-2">
        <span className="text-ink/45">Sightings</span>
        <span>{sightingCount}</span>
      </div>
      <label className="block">
        <span className="text-ink/45">First seen</span>
        <input
          type="datetime-local"
          className="mt-1 w-full"
          value={firstSeen}
          onChange={(e) => setFirstSeen(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-ink/45">Last seen</span>
        <input
          type="datetime-local"
          className="mt-1 w-full"
          value={lastSeen}
          onChange={(e) => setLastSeen(e.target.value)}
        />
      </label>
      <div className="flex justify-between gap-3 border-b border-ink/[0.06] pb-2">
        <span className="text-ink/45">Days silent</span>
        <span>{individual.days_since_seen == null ? "—" : individual.days_since_seen}</span>
      </div>
      <label className="block">
        <span className="text-ink/45">Scientific notes</span>
        <textarea className="mt-1 w-full" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="text-[12.5px] text-[#e8a39c]">{error}</p>}
      {saved && <p className="text-[12.5px] text-teal">{saved}</p>}
      <button type="submit" className="btn-forest w-full !py-2 text-[13px]" disabled={saving}>
        {saving ? "Saving…" : "Save identity"}
      </button>
    </form>
  );
}

function SightingEditor({
  detection,
  stations,
  fallbackCountry,
  onSaved,
}: {
  detection: Detection;
  stations: Station[];
  fallbackCountry: string;
  onSaved: (updated: Detection) => void | Promise<void>;
}) {
  const [taken, setTaken] = useState(toLocalInput(detection.captured_at || detection.created_at));
  const [stationId, setStationId] = useState(detection.station_id || "");
  const [country, setCountry] = useState(detection.country || fallbackCountry || "");
  const [lat, setLat] = useState(detection.latitude != null ? String(detection.latitude) : "");
  const [lng, setLng] = useState(detection.longitude != null ? String(detection.longitude) : "");
  const [side, setSide] = useState(detection.side || "U");
  const [cameraMake, setCameraMake] = useState(detection.camera_make || "");
  const [cameraModel, setCameraModel] = useState(detection.camera_model || "");
  const [notes, setNotes] = useState(detection.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const body: Record<string, unknown> = {
        side,
        camera_make: cameraMake || null,
        camera_model: cameraModel || null,
        notes,
        country: country || null,
      };
      if (taken) body.captured_at = new Date(taken).toISOString();
      if (stationId) body.station_id = stationId;
      if (lat.trim() && lng.trim()) {
        body.latitude = Number(lat);
        body.longitude = Number(lng);
      }
      const updated = await api.patchMetadata(detection.id, body);
      await onSaved(updated);
      setSaved("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sighting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 text-[13px] sm:grid-cols-2">
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Taken</span>
        <input type="datetime-local" className="mt-1 w-full" value={taken} onChange={(e) => setTaken(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Location</span>
        <select className="mt-1 w-full" value={stationId} onChange={(e) => setStationId(e.target.value)}>
          <option value="">No station</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name} ({station.code})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Country</span>
        <input className="mt-1 w-full" value={country} onChange={(e) => setCountry(e.target.value)} />
      </label>
      <label className="block">
        <span className="inline-flex items-center text-[11px] uppercase tracking-[0.12em] text-ink/45">
          Flank
          <InfoTip label="About flank">{FLANK_HELP}</InfoTip>
        </span>
        <select className="mt-1 w-full" value={side} onChange={(e) => setSide(e.target.value)}>
          {FLANKS.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-ink/45">Pin on map</span>
        <SightingsMap
          height={220}
          pickable
          pickHint="Click to place the jaguar pin"
          pin={
            lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
              ? { lat: Number(lat), lng: Number(lng) }
              : null
          }
          points={stations
            .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
            .map((s) => ({
              lat: s.latitude,
              lng: s.longitude,
              label: s.name || s.code,
              kind: "station",
              station_code: s.code,
            }))}
          onPick={(nextLat, nextLng) => {
            setLat(String(nextLat));
            setLng(String(nextLng));
            setStationId("");
          }}
        />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Latitude</span>
        <input className="mt-1 w-full" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="0.00000" />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Longitude</span>
        <input className="mt-1 w-full" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="0.00000" />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Camera make</span>
        <input className="mt-1 w-full" value={cameraMake} onChange={(e) => setCameraMake(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Camera model</span>
        <input className="mt-1 w-full" value={cameraModel} onChange={(e) => setCameraModel(e.target.value)} />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Notes</span>
        <textarea className="mt-1 w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="sm:col-span-2 text-[12.5px] text-[#e8a39c]">{error}</p>}
      {saved && <p className="sm:col-span-2 text-[12.5px] text-teal">{saved}</p>}
      <button type="submit" className="btn-forest sm:col-span-2 !py-2 text-[13px]" disabled={saving}>
        {saving ? "Saving…" : "Save sighting"}
      </button>
    </form>
  );
}
