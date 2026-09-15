"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SightingsMap } from "@/components/SightingsMap";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { CANDIDATE_SCORE_HELP, InfoTip } from "@/components/InfoTip";
import { api, mediaSrc, type Detection, type Station } from "@/lib/api";
import { isScientist } from "@/lib/roles";

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

export default function ObservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [obs, setObs] = useState<Detection | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [gallery, setGallery] = useState<Detection[]>([]);
  const [galleryLabel, setGalleryLabel] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [when, setWhen] = useState("");
  const [stationId, setStationId] = useState("");
  const [country, setCountry] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .detection(id)
      .then((row) => {
        setObs(row);
        setLat(row.latitude != null ? String(row.latitude) : "");
        setLng(row.longitude != null ? String(row.longitude) : "");
        setWhen(row.captured_at ? row.captured_at.slice(0, 16) : "");
        setStationId(row.station_id || "");
        setCountry(row.country || "");
        setProjectId(row.project_id || "");
        setNotes(row.notes || "");
      })
      .catch((e) => setError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.stations(projectId || undefined).then(setStations).catch(() => undefined);
  }, [projectId]);
  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (!isScientist(me.role)) return;
        return api.portfolio().then((p) => {
          const list = (p?.projects || []).map((row: { id: string; name: string }) => ({
            id: row.id,
            name: row.name,
          }));
          setProjects(list);
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!obs) {
      setGallery([]);
      setGalleryLabel("");
      return;
    }
    const matchId = obs.individual_id || obs.suggested_individual_id;
    const matchName = obs.individual_name || obs.suggested_name;
    if (!matchId) {
      setGallery([]);
      setGalleryLabel("");
      return;
    }
    let cancelled = false;
    api
      .detections(undefined, matchId)
      .then((rows) => {
        if (cancelled) return;
        setGallery(rows);
        setGalleryLabel(
          obs.individual_id
            ? `Matched gallery · ${matchName || "this jaguar"}`
            : `Candidate gallery · ${matchName || "suggested jaguar"}`,
        );
      })
      .catch(() => {
        if (!cancelled) setGallery([]);
      });
    return () => {
      cancelled = true;
    };
  }, [obs?.id, obs?.individual_id, obs?.suggested_individual_id, obs?.individual_name, obs?.suggested_name]);

  async function saveMeta(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setObs(
        await api.patchMetadata(id, {
          latitude: lat ? Number(lat) : undefined,
          longitude: lng ? Number(lng) : undefined,
          captured_at: when || undefined,
          station_id: stationId || undefined,
          notes: notes || undefined,
          country: country.trim() || null,
          project_id: projectId || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save location");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(individualId: string) {
    setError("");
    try {
      setObs(await api.confirm(id, { individual_id: individualId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm");
    }
  }

  async function createNew(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError("Enter a proposed name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setObs(await api.confirm(id, { create_new: true, proposed_name: name.trim() }));
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    } finally {
      setBusy(false);
    }
  }

  async function propose(e: FormEvent) {
    e.preventDefault();
    if (!obs?.individual_id) return;
    try {
      await api.proposeName(obs.individual_id, name);
      load();
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Name rejected");
    }
  }

  if (!obs) return <p>{error || "Loading…"}</p>;
  const stills = obs.media.filter((m) => m.kind !== "video");
  const locationReady = !obs.missing_location;
  const showRegister =
    Boolean(obs.can_register_new) &&
    !obs.individual_id &&
    (obs.review_state === "rejected_match" || !obs.candidates.length);
  const showNameField =
    showRegister || Boolean(obs.individual_id && (obs.needs_name || obs.individual_code === obs.individual_name));
  const namedLocked = Boolean(obs.individual_name && !obs.needs_name && obs.individual_code !== obs.individual_name);
  const mapPoints =
    obs.latitude != null && obs.longitude != null
      ? [
          {
            lat: obs.latitude,
            lng: obs.longitude,
            label: obs.individual_name || obs.suggested_name || "Sighting",
            captured_at: obs.captured_at,
            photo_url: stills[0]?.url || null,
            location: obs.station_name || obs.station_code || null,
            station_code: obs.station_code,
            href: `/observations/${obs.id}`,
          },
        ]
      : [];
  const galleryTrack = gallery
    .filter((d) => d.latitude != null && d.longitude != null)
    .sort((a, b) => (a.captured_at || a.created_at).localeCompare(b.captured_at || b.created_at))
    .map((d) => {
      const thumb = d.media.find((m) => m.kind !== "video");
      return {
        lat: d.latitude as number,
        lng: d.longitude as number,
        label: d.individual_name || galleryLabel,
        captured_at: d.captured_at,
        photo_url: thumb?.url || null,
        location: d.station_name || d.station_code || null,
        station_code: d.station_code,
        href: `/observations/${d.id}`,
      };
    });

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-4">
        {stills.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={mediaSrc(m.url)} alt="" className="w-full rounded-2xl bg-white shadow-card" />
        ))}

        {(mapPoints.length > 0 || galleryTrack.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-title">Geotags</p>
                <p className="text-[12.5px] text-ink/45">
                  {galleryTrack.length > 1
                    ? `${galleryTrack.length} located sightings for this jaguar`
                    : "This photo’s coordinates"}
                </p>
              </div>
              {obs.individual_code && (
                <Link href={`/map?individual=${encodeURIComponent(obs.individual_id || "")}`} className="text-[13px] text-gold">
                  Full map →
                </Link>
              )}
            </div>
            <SightingsMap
              points={galleryTrack.length ? galleryTrack : mapPoints}
              track={galleryTrack.length > 1 ? galleryTrack : undefined}
              height={260}
            />
          </div>
        )}

        {gallery.length > 0 && (
          <div>
            <p className="section-title mb-1">{galleryLabel}</p>
            <p className="mb-3 text-[12.5px] text-ink/45">
              {gallery.length} photo{gallery.length === 1 ? "" : "s"} linked to this identity
              {obs.individual_code ? (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/individuals/${obs.individual_code}`} className="text-gold">
                    Open profile
                  </Link>
                </>
              ) : null}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gallery.map((d) => {
                const thumb = d.media.find((m) => m.kind !== "video");
                const active = d.id === obs.id;
                return (
                  <Link
                    key={d.id}
                    href={`/observations/${d.id}`}
                    className={`overflow-hidden rounded-[8px] border ${
                      active ? "border-[var(--gold)]" : "border-[var(--line)]"
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaSrc(thumb.url)} alt="" className="h-24 w-full object-cover" />
                    ) : (
                      <div className="flex h-24 items-center justify-center text-[11px] text-ink/40">{d.side}</div>
                    )}
                    <p className="truncate px-1.5 py-1 text-[10px] text-ink/45">
                      {fmtDateTime(d.captured_at || d.created_at)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <p className="page-kicker">Detection</p>
        <h1 className="page-title">{obs.individual_name || obs.suggested_name || "Unassigned jaguar"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <GradeBadge grade={obs.grade} />
          <ReviewStateBadge state={obs.review_state} />
        </div>
        <p className="font-mono text-sm text-ink/50">
          {obs.common_name || obs.species}
          {obs.scientific_name ? ` · ${obs.scientific_name}` : ""} · {obs.side} · conf {obs.confidence.toFixed(2)}
          {obs.engine ? ` · ${obs.engine}` : ""}
        </p>

        <form
          onSubmit={saveMeta}
          className={`space-y-4 rounded-2xl border p-5 shadow-card ${
            obs.missing_location || obs.missing_time
              ? "border-gold/45 bg-[#f7f3ea]"
              : "border-[var(--line)] bg-white"
          }`}
        >
          <div>
            <h2 className="section-title">Sighting record</h2>
            <p className="mt-1 text-[13px] text-ink/55">
              {obs.missing_location || !obs.individual_name
                ? "Edit time and location here — then you can match or name this jaguar."
                : "Update field details anytime. Changes apply when you save."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] sm:col-span-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Name</span>
              {namedLocked ? (
                <span className="mt-1 block rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[14px] font-medium text-ink">
                  {obs.individual_name}
                  {obs.individual_code ? (
                    <span className="ml-2 font-mono text-[12px] font-normal text-ink/45">{obs.individual_code}</span>
                  ) : null}
                </span>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-[15px]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={showNameField ? "Type a jaguar name, e.g. Itzel" : "Not named yet — match or register below"}
                  disabled={!showNameField}
                  minLength={2}
                  autoComplete="off"
                />
              )}
              {showNameField && !namedLocked && (
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  {!locationReady && (
                    <span className="text-[12px] text-gold">Save location, then submit the name.</span>
                  )}
                  <button
                    type="button"
                    disabled={busy || !locationReady || name.trim().length < 2}
                    className="rounded-full bg-gold px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    onClick={async () => {
                      if (obs.individual_id) {
                        const fake = { preventDefault() {} } as FormEvent;
                        await propose(fake);
                      } else {
                        const fake = { preventDefault() {} } as FormEvent;
                        await createNew(fake);
                      }
                    }}
                  >
                    {obs.individual_id ? "Submit name" : "Register + submit name"}
                  </button>
                </span>
              )}
            </label>

            <label className="block text-[12px]">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">
                Taken{obs.missing_time ? " · required" : ""}
              </span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>

            <label className="block text-[12px]">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Project</span>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setStationId("");
                }}
              >
                {(projects.length
                  ? projects
                  : obs.project_id
                    ? [{ id: obs.project_id, name: obs.project_name || "Current project" }]
                    : []
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[12px] sm:col-span-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">
                Location{obs.missing_location ? " · required" : ""}
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                value={stationId}
                onChange={(e) => {
                  const next = e.target.value;
                  setStationId(next);
                  const station = stations.find((s) => s.id === next);
                  if (station && Number.isFinite(station.latitude) && Number.isFinite(station.longitude)) {
                    setLat(String(station.latitude));
                    setLng(String(station.longitude));
                  }
                }}
              >
                <option value="">Choose station or pin on the map</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[12px]">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Country</span>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Costa Rica"
                autoComplete="country-name"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 sm:col-span-1">
              <label className="block text-[12px]">
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Latitude</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                  placeholder="e.g. 8.54012"
                  value={lat}
                  onChange={(e) => {
                    setLat(e.target.value);
                    setStationId("");
                  }}
                />
              </label>
              <label className="block text-[12px]">
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Longitude</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
                  placeholder="e.g. -83.50741"
                  value={lng}
                  onChange={(e) => {
                    setLng(e.target.value);
                    setStationId("");
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] text-ink/55">
              {obs.missing_location
                ? "No GPS yet — click the map to place the pin, or fill latitude/longitude above."
                : "Click the map to move the pin."}
            </p>
            <SightingsMap
              height={260}
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
          </div>

          <label className="block text-[12px]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Scientific notes</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]"
              rows={3}
              placeholder="Scientific notes for this photo…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {obs.summary && !notes && (
            <p className="whitespace-pre-line text-[12.5px] text-ink/50">{obs.summary}</p>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="rounded-full bg-forest px-4 py-2 text-sm text-canvas">
            {obs.missing_location ? "Save location" : "Save changes"}
          </button>
        </form>

        {obs.known_match && (
          <p className="rounded-xl bg-teal/10 px-4 py-3 text-[13px]">
            Already in the database as <strong>{obs.individual_name}</strong>. No new name.
          </p>
        )}
        {obs.candidates.length === 0 && !obs.individual_id && obs.match_library_note && (
          <p className="rounded-xl bg-gold/10 px-4 py-3 text-[13px]">{obs.match_library_note}</p>
        )}
        {obs.review_state === "awaiting_second_review" && obs.individual_id && (
          <div className="rounded-2xl border border-gold/30 bg-white p-5 shadow-card">
            <p className="section-title mb-1">Second review needed</p>
            <p className="text-[13px] text-ink/55">
              First reviewer: {obs.reviewer_name || "unknown"}. A different scientist must confirm the same individual.
            </p>
            <button className="btn-gold mt-3 !px-4 !py-2" onClick={() => confirm(obs.individual_id!)} disabled={!locationReady}>
              Confirm as second reviewer
            </button>
          </div>
        )}
        {obs.candidates.length > 0 && !obs.known_match && !obs.individual_id && (
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <p className="inline-flex items-center text-xs uppercase tracking-widest text-ink/40">
              Ranked jaguar candidates
              <InfoTip label="About similarity scores">{CANDIDATE_SCORE_HELP}</InfoTip>
            </p>
            <p className="mt-1 text-[13px] text-ink/55">
              Tap a jaguar to confirm. Or reject and register a new one. The app never auto-names.
            </p>
            {!locationReady && <p className="mt-2 text-[13px] text-gold">Save location before confirming.</p>}
            <div className="mt-4 space-y-2.5">
              {obs.candidates.map((c, index) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => locationReady && !busy && confirm(c.id)}
                  disabled={busy || !locationReady}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-forest/15 bg-[#f7f3ea] px-4 py-3.5 text-left transition hover:border-forest/40 hover:bg-[#efe8d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-[13px] font-semibold text-canvas">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{c.display_name}</span>
                    <span className="mt-0.5 block font-mono text-[12px] text-ink/45">
                      {c.code} · {(c.score * 100).toFixed(0)}% similar
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-forest px-3.5 py-2 text-[12.5px] font-semibold text-canvas">
                    Select
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-3.5 text-[14px] font-semibold text-ink transition hover:border-ink/30 hover:bg-paper"
              onClick={async () => setObs(await api.confirm(id, { reject: true }))}
            >
              None of these — register as a new jaguar
            </button>
          </div>
        )}
        {showRegister && locationReady && !name.trim() && (
          <form onSubmit={createNew} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="section-title">No match — name this jaguar</h2>
            <p className="text-sm text-ink/50">
              <em>{obs.scientific_name || "Panthera onca"}</em>. Propose a unique common name for admin approval — or type it in the Sighting record above.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input
              className="w-full rounded-lg border px-4 py-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Itzel"
              required
              minLength={2}
            />
            <button disabled={busy} className="rounded-full bg-gold px-5 py-2 text-white">
              Register + submit name
            </button>
          </form>
        )}
        {obs.individual_id && (obs.needs_name || obs.individual_code === obs.individual_name) && locationReady && !name.trim() && (
          <form onSubmit={propose} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="section-title">Propose a canonical name</h2>
            <p className="text-sm text-ink/50">Verified researchers propose; an admin approves. Names cannot overlap — or type it in the Sighting record above.</p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input className="w-full rounded-lg border px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Itzel" required />
            <button className="rounded-full bg-gold px-5 py-2 text-white">Submit for approval</button>
          </form>
        )}
      </div>
    </div>
  );
}
