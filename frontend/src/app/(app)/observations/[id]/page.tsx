"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SightingsMap } from "@/components/SightingsMap";
import { GradeBadge, ReviewStateBadge } from "@/components/GradeBadge";
import { api, mediaSrc, type Detection, type Station } from "@/lib/api";

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

export default function ObservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [obs, setObs] = useState<Detection | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [gallery, setGallery] = useState<Detection[]>([]);
  const [galleryLabel, setGalleryLabel] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [when, setWhen] = useState("");
  const [stationId, setStationId] = useState("");
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
        setNotes(row.notes || "");
      })
      .catch((e) => setError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.stations().then(setStations).catch(() => undefined);
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
    locationReady &&
    !obs.individual_id &&
    (obs.review_state === "rejected_match" || !obs.candidates.length);
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

        <div className="surface space-y-3 p-5">
          <p className="section-title">Sighting record</p>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            {[
              ["Name", obs.individual_name || "Not named yet"],
              ["Taken", fmtDateTime(obs.captured_at)],
              ["Location", obs.station_name || obs.station_code || "—"],
              ["Country", obs.country || "—"],
              ["Coordinates", fmtCoords(obs.latitude, obs.longitude)],
              ["Project", obs.project_name || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-[0.12em] text-ink/45">{label}</dt>
                <dd className="mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
          {(obs.notes || obs.summary) && (
            <div className="border-t border-[var(--line)] pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Scientific notes</p>
              <p className="mt-1 whitespace-pre-line text-[13.5px]">{obs.notes || obs.summary}</p>
            </div>
          )}
        </div>

        <form onSubmit={saveMeta} className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-card">
          <h2 className="section-title">{obs.missing_location ? "Field location required" : "Update field metadata"}</h2>
          {obs.missing_location && (
            <p className="text-[13px] text-ink/55">
              Choose a station or enter coordinates before matching or naming.
            </p>
          )}
          <input
            type="datetime-local"
            className="w-full rounded-lg border px-3 py-2"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <select className="w-full rounded-lg border px-3 py-2" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Choose station or type GPS</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded-lg border px-3 py-2" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <textarea
            className="w-full rounded-lg border px-3 py-2"
            rows={3}
            placeholder="Scientific notes for this photo…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="rounded-full bg-forest px-4 py-2 text-sm text-canvas">
            Save metadata
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
            <p className="text-xs uppercase tracking-widest text-ink/40">Ranked jaguar candidates</p>
            <p className="mt-1 text-[13px] text-ink/55">
              Confirm a match, reject, or register as a new jaguar. The app never auto-names.
            </p>
            {!locationReady && <p className="mt-2 text-[13px] text-gold">Save location before confirming.</p>}
            <ul className="mt-3 space-y-2">
              {obs.candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>
                    {c.display_name} <span className="font-mono text-ink/40">{c.code}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm">{c.score.toFixed(2)}</span>
                    <button
                      className="rounded-full bg-forest px-3 py-1 text-xs text-canvas disabled:opacity-40"
                      onClick={() => confirm(c.id)}
                      disabled={!locationReady}
                    >
                      Confirm
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button
              className="mt-4 text-sm text-gold"
              onClick={async () => setObs(await api.confirm(id, { reject: true }))}
            >
              Not a match — register as new jaguar
            </button>
          </div>
        )}
        {showRegister && (
          <form onSubmit={createNew} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="section-title">No match — name this jaguar</h2>
            <p className="text-sm text-ink/50">
              <em>{obs.scientific_name || "Panthera onca"}</em>. Propose a unique common name for admin approval.
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
        {obs.individual_id && (obs.needs_name || obs.individual_code === obs.individual_name) && (
          <form onSubmit={propose} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="section-title">Propose a canonical name</h2>
            <p className="text-sm text-ink/50">Verified researchers propose; an admin approves. Names cannot overlap.</p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input className="w-full rounded-lg border px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Itzel" required />
            <button className="rounded-full bg-gold px-5 py-2 text-white">Submit for approval</button>
          </form>
        )}
      </div>
    </div>
  );
}
