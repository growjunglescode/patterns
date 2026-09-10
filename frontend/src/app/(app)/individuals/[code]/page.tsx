"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SightingsMap } from "@/components/SightingsMap";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { api, mediaSrc, type Detection, type Individual, type Movement, type User } from "@/lib/api";
import { isAdmin, isScientist } from "@/lib/roles";
import { useProjectId } from "@/lib/useProjectId";

const AGE_CLASSES = ["unknown", "cub", "juvenile", "subadult", "adult"];
const LIFE_STATUSES = ["unknown", "alive", "dead", "lost"];

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

export default function IndividualProfilePage() {
  const { code } = useParams<{ code: string }>();
  const [ind, setInd] = useState<Individual | null>(null);
  const [obs, setObs] = useState<Detection[]>([]);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detection | null>(null);
  const [mergeCode, setMergeCode] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState("");
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
    });
  }, [code]);

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
  const stale = ind.days_since_seen != null && ind.days_since_seen > 180;
  const provenance = detail || selected;
  const candidates = detail?.candidates || [];

  return (
    <div className="space-y-6">
      <div className="xl:grid xl:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:gap-5">
        <aside className="surface mb-5 space-y-4 p-5 xl:mb-0">
          <p className="page-kicker">Identity (catalog record)</p>
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
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                {[
                  ["Taken", fmtDateTime(selected.captured_at || selected.created_at)],
                  ["Location", selected.station_name || selected.station_code || "—"],
                  ["Country", selected.country || ind.country || "—"],
                  ["Coordinates", fmtCoords(selected.latitude, selected.longitude)],
                  ["Flank", flankLabel(selected.side)],
                  ["Camera", [selected.camera_make, selected.camera_model].filter(Boolean).join(" ") || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-ink/45">{label}</dt>
                    <dd className="mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
              {(selected.notes || selected.summary) && (
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Scientific notes</p>
                  <p className="mt-1 whitespace-pre-line text-[13.5px]">{selected.notes || selected.summary}</p>
                </div>
              )}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="surface p-4">
              <p className="section-title mb-2">Capture candidates</p>
              <p className="mb-3 text-[12.5px] text-ink/45">
                Ranked from the method record. Identity is never assigned automatically.
              </p>
              <ul className="space-y-2 text-[13.5px]">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <Link href={`/individuals/${c.code}`} className="hover:text-gold">
                      {c.display_name} <span className="font-mono text-[12px] text-ink/45">{c.code}</span>
                    </Link>
                    <span className="font-mono text-[12px]">{(c.score * 100).toFixed(0)}%</span>
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
              {[
                ["Recognition method", provenance?.engine || "—"],
                ["Model / calibration", provenance?.model_version || "—"],
                [
                  "Similarity score",
                  provenance?.match_score != null ? `${(provenance.match_score * 100).toFixed(0)}%` : "—",
                ],
                ["Flank", flankLabel(provenance?.side)],
                ["Observer", provenance?.uploader_name || "—"],
                ["Confirmed by", provenance?.reviewer_name || "Not yet confirmed"],
                ["Second review", provenance?.second_reviewer_name || "Pending"],
                ["Review status", provenance?.review_state?.replaceAll("_", " ") || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-ink/45">{label}</dt>
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

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="section-title">Scientific notes</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-ink/15 bg-paper px-4 py-1.5 text-[13px]"
            >
              {editing ? "Cancel" : "Edit details"}
            </button>
          )}
        </div>
        {editing && canEdit ? (
          <DetailsForm
            individual={ind}
            onSaved={(updated) => {
              setInd(updated);
              setEditing(false);
            }}
          />
        ) : (
          <div className="surface p-6">
            <p className="whitespace-pre-line text-[13.5px]">
              {ind.physical_notes || "No scientific notes recorded for this jaguar yet."}
            </p>
            <p className="mt-4 text-[12.5px] text-ink/45">
              {ind.details_updated_by
                ? `Last updated by ${ind.details_updated_by} on ${fmtDate(ind.details_updated_at)}.`
                : "Identity notes, scars, morph, and field remarks belong here."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function DetailsForm({
  individual,
  onSaved,
}: {
  individual: Individual;
  onSaved: (updated: Individual) => void;
}) {
  const [sex, setSex] = useState(individual.sex || "unknown");
  const [lifeStatus, setLifeStatus] = useState(individual.life_status || "unknown");
  const [ageClass, setAgeClass] = useState(individual.age_class || "unknown");
  const [birthYear, setBirthYear] = useState(
    individual.birth_year_estimate ? String(individual.birth_year_estimate) : "",
  );
  const [notes, setNotes] = useState(individual.physical_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.patchIndividualDetails(individual.code, {
        sex,
        life_status: lifeStatus,
        age_class: ageClass,
        birth_year_estimate: birthYear.trim() ? Number(birthYear) : null,
        physical_notes: notes,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save these details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-[13px]">
          <span className="kpi-label !mt-0 block">Sex</span>
          <select className="mt-1.5" value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="unknown">Unknown</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </label>
        <label className="block text-[13px]">
          <span className="kpi-label !mt-0 block">Life status</span>
          <select className="mt-1.5" value={lifeStatus} onChange={(e) => setLifeStatus(e.target.value)}>
            {LIFE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px]">
          <span className="kpi-label !mt-0 block">Age class</span>
          <select className="mt-1.5" value={ageClass} onChange={(e) => setAgeClass(e.target.value)}>
            {AGE_CLASSES.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px]">
          <span className="kpi-label !mt-0 block">Estimated birth year</span>
          <input
            className="mt-1.5"
            inputMode="numeric"
            placeholder="e.g. 2019"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </label>
      </div>
      <label className="mt-4 block text-[13px]">
        <span className="kpi-label !mt-0 block">Scientific notes</span>
        <textarea
          className="mt-1.5"
          rows={3}
          placeholder="Scars, ear notches, morph, behavior…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error && <p className="mt-3 text-[13px] text-[#e8a39c]">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-gold !px-5 !py-2">
          {saving ? "Saving…" : "Save details"}
        </button>
        <p className="text-[12.5px] text-ink/45">Every change is written to the audit log.</p>
      </div>
    </div>
  );
}
