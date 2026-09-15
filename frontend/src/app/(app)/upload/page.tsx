"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, mediaSrc, reviewStateLabel, type Detection, type Station, type User } from "@/lib/api";
import { canName } from "@/lib/roles";
import { readProjectId } from "@/lib/project";
import { useProjectId } from "@/lib/useProjectId";
import { ReviewStateBadge } from "@/components/GradeBadge";
import { CoatScanOverlay } from "@/components/CoatScanOverlay";
import { CANDIDATE_SCORE_HELP, FLANK_HELP, InfoTip } from "@/components/InfoTip";
import { SightingsMap } from "@/components/SightingsMap";

export default function UploadPage() {
  return (
    <Suspense fallback={<p className="text-ink/40">Loading upload…</p>}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const searchParams = useSearchParams();
  const [stations, setStations] = useState<Station[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [obs, setObs] = useState<Detection | null>(null);
  const [askSpecies, setAskSpecies] = useState(false);
  const [assertSpecies, setAssertSpecies] = useState("jaguar");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [when, setWhen] = useState("");
  const [stationId, setStationId] = useState("");
  const projectId = useProjectId();

  useEffect(() => {
    const qLat = searchParams.get("lat");
    const qLng = searchParams.get("lng");
    if (qLat && Number.isFinite(Number(qLat))) setLat(qLat);
    if (qLng && Number.isFinite(Number(qLng))) setLng(qLng);
  }, [searchParams]);

  useEffect(() => {
    api.stations(projectId).then(setStations).catch(() => undefined);
    api.me().then(setUser).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setScanning(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      const file = form.get("file");
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setLocalPreview(null);
      }
      setPreviewIsVideo(false);
      if (file instanceof File) {
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          setLocalPreview(URL.createObjectURL(file));
          setPreviewIsVideo(file.type.startsWith("video/"));
        }
      }
      const projectId = readProjectId();
      if (projectId) form.set("project_id", projectId);
      const result = await api.upload(form);
      setObs(result);
      setAskSpecies(Boolean(result.needs_species_confirm));
      const pinnedLat = searchParams.get("lat");
      const pinnedLng = searchParams.get("lng");
      setLat(
        result.latitude != null
          ? String(result.latitude)
          : pinnedLat && Number.isFinite(Number(pinnedLat))
            ? pinnedLat
            : "",
      );
      setLng(
        result.longitude != null
          ? String(result.longitude)
          : pinnedLng && Number.isFinite(Number(pinnedLng))
            ? pinnedLng
            : "",
      );
      setWhen(result.captured_at ? result.captured_at.slice(0, 16) : "");
      setScanning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta(e: FormEvent) {
    e.preventDefault();
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.patchMetadata(obs.id, {
        latitude: lat ? Number(lat) : undefined,
        longitude: lng ? Number(lng) : undefined,
        captured_at: when || undefined,
        station_id: stationId || undefined,
      });
      setObs(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save metadata");
    } finally {
      setBusy(false);
    }
  }

  async function confirmKnown(individualId: string) {
    if (!obs) return;
    if (obs.missing_location) {
      setError("Add GPS or choose a station before confirming identity");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setObs(await api.confirm(obs.id, { individual_id: individualId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm");
    } finally {
      setBusy(false);
    }
  }

  async function rejectMatch() {
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      setObs(await api.confirm(obs.id, { reject: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject match");
    } finally {
      setBusy(false);
    }
  }

  async function registerNew(e: FormEvent) {
    e.preventDefault();
    if (!obs) return;
    if (obs.missing_location) {
      setError("Add GPS or choose a station before registering a new jaguar");
      return;
    }
    if (!name.trim() || name.trim().length < 2) {
      setError("Enter a proposed name for this jaguar (admin will approve it)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (obs.individual_id && obs.needs_name) {
        await api.proposeName(obs.individual_id, name.trim());
        setObs(await api.detection(obs.id));
      } else {
        setObs(await api.confirm(obs.id, { create_new: true, proposed_name: name.trim() }));
      }
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register individual");
    } finally {
      setBusy(false);
    }
  }

  async function rejectSpecies() {
    if (!obs) return;
    setBusy(true);
    try {
      await api.discardDetection(obs.id);
      setObs(null);
      setAskSpecies(false);
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setLocalPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discard");
    } finally {
      setBusy(false);
    }
  }

  async function pushSpecies() {
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.assertSpecies(obs.id, assertSpecies);
      setObs(updated);
      setAskSpecies(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not push picture");
    } finally {
      setBusy(false);
    }
  }

  const knownCandidate = obs?.candidates?.[0];
  const alreadyNamed = Boolean(obs?.known_match);
  const missingLocation = Boolean(obs?.missing_location);
  const missingTime = Boolean(obs?.missing_time);
  const missing = missingLocation || missingTime;
  const locationReady = Boolean(obs && !obs.missing_location);
  const reviewLabel = reviewStateLabel(obs?.review_state);
  const libraryNote = obs?.match_library_note;
  const librarySize = obs?.match_library_size ?? 0;
  const isPotential = obs?.review_state === "potential_match" || Boolean(obs?.candidates?.length && !obs.individual_id);
  const isRejected = obs?.review_state === "rejected_match";
  const isNewIndividual = obs?.review_state === "new_jaguar";
  const isConfirmed = obs?.review_state === "confirmed_match" || alreadyNamed;
  const canRegister =
    Boolean(obs?.can_register_new) &&
    !alreadyNamed &&
    !askSpecies &&
    (!isPotential || isRejected || (obs?.candidates?.length ?? 0) === 0);
  const showNameForm = canRegister || Boolean(obs?.needs_name && !askSpecies);
  const mayProposeName = Boolean(user && canName(user.role, user.verified));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="page-kicker">Field collection</p>
        <h1 className="page-title mt-1">Add a field photo</h1>
        <p className="lede">
          Choose the flank you can see. We read EXIF time, GPS, and camera from the file. The coat proposes a match — a person confirms. The system never assigns identity on its own.
        </p>
      </div>

      {!obs && scanning && (
        <div className="space-y-4">
          <CoatScanOverlay previewUrl={localPreview} isVideo={previewIsVideo} />
          {error && (
            <div className="space-y-3 rounded-[1.2rem] bg-paper p-5 shadow-card">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setScanning(false);
                  setError("");
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {!obs && !scanning && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-[1.4rem] bg-paper p-7 shadow-card">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" />
          <select name="station_id" className="w-full rounded-lg border px-3 py-2 text-[0.9375rem]">
            <option value="">Camera station — optional if the photo has GPS</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <label className="block">
            <span className="mb-1 inline-flex items-center text-[12.5px] text-ink/55">
              Flank
              <InfoTip label="About flank">{FLANK_HELP}</InfoTip>
            </span>
            <select name="side" required className="mt-1 w-full rounded-lg border px-3 py-2 text-[0.9375rem]">
              <option value="">Flank — required for matching</option>
              <option value="L">Left flank</option>
              <option value="R">Right flank</option>
              <option value="U">Unknown / not sure</option>
            </select>
          </label>
          <p className="text-[12.5px] text-ink/45">
            Left or right is required for research-grade identifications. Unknown still ranks, but cannot reach research grade.
          </p>
          <textarea name="notes" placeholder="Field notes" className="w-full rounded-lg border px-3 py-2" rows={2} />
          <button disabled={busy} className="btn-gold w-full disabled:opacity-50">
            Analyze photo
          </button>
        </form>
      )}

      {obs && (
        <div className="space-y-5">
          {localPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localPreview} alt="" className="w-full rounded-xl bg-white object-contain shadow-card" />
          ) : (
            obs.media
              .filter((m) => m.kind !== "video")
              .map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={mediaSrc(m.url)} alt="" className="w-full rounded-xl bg-white shadow-card" />
              ))
          )}

          <div className="rounded-xl bg-white p-5 shadow-card text-[0.9375rem]">
              <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="section-title mb-0">Pulled from the file</p>
              <ReviewStateBadge state={obs.review_state} />
            </div>
            <p>
              Camera: {obs.camera_make || "—"} {obs.camera_model || ""}
            </p>
            <p>
              Time: {obs.captured_at ? new Date(obs.captured_at).toLocaleString() : "not in EXIF"}
            </p>
            <p>
              Species:{" "}
              <strong>
                {obs.common_name || obs.species}
                {obs.scientific_name ? (
                  <>
                    {" "}
                    (<em>{obs.scientific_name}</em>)
                  </>
                ) : null}
              </strong>
            </p>
            <p>
              Location:{" "}
              {obs.latitude != null
                ? `${obs.latitude}, ${obs.longitude}${obs.location_from_exif ? " (from EXIF)" : ""}`
                : "missing — add below before naming"}
            </p>
            <p className="mt-1 text-[12.5px] text-ink/45">
              Source: {obs.metadata_source || "none"} · {obs.station_code || "no station"} · flank {obs.side || "U"}
              {obs.engine ? ` · ${obs.engine}${obs.model_version ? ` ${obs.model_version}` : ""}` : ""}
            </p>
            <p className="mt-2 text-[13px] text-ink/55">
              Identity is always human-reviewed. The system never assigns a jaguar name on its own.
            </p>
            {reviewLabel && (
              <p className="mt-2 text-[13px] text-ink/55">
                Identity review: <strong>{reviewLabel}</strong>
                {obs.review_state === "potential_match"
                  ? " — the computer listed possible matches. A person must confirm; it will not assign identity by itself."
                  : null}
              </p>
            )}
          </div>

          {askSpecies && obs && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/80 sm:items-center sm:p-4">
              <div
                className="flex w-full max-w-md flex-col overflow-hidden rounded-t-[1.4rem] border border-gold/25 bg-canvas shadow-lift sm:max-h-[90dvh] sm:rounded-[1.6rem]"
                style={{ maxHeight: "min(100dvh, 100%)" }}
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-5">
                  <p className="section-title">Confirm jaguar?</p>
                  <p className="mt-2 text-[13px] leading-snug text-ink/60">
                    This catalog is jaguar-only (<em>Panthera onca</em>). Confirm if this is a jaguar, or discard the photo.
                  </p>
                  {(localPreview || obs.media.some((m) => m.kind !== "video")) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        localPreview ||
                        mediaSrc(obs.media.find((m) => m.kind !== "video")?.url || "")
                      }
                      alt=""
                      className="mt-3 max-h-[32vh] w-full rounded-xl bg-[#0d1210] object-contain sm:max-h-[40vh]"
                    />
                  )}
                  <p className="mt-3 text-[13px] leading-snug text-ink/55">{obs.summary}</p>
                  <select
                    className="mt-3 w-full rounded-lg border px-3 py-2.5 text-[15px]"
                    value={assertSpecies}
                    onChange={(e) => setAssertSpecies(e.target.value)}
                  >
                    <option value="jaguar">Jaguar — Panthera onca</option>
                  </select>
                  {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
                </div>
                <div
                  className="shrink-0 space-y-2 border-t border-ink/10 bg-canvas px-5 pt-3"
                  style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={pushSpecies}
                    className="btn-gold w-full disabled:opacity-40"
                  >
                    {busy ? "Pushing…" : "Yes — this is a jaguar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={rejectSpecies}
                    className="w-full rounded-full border border-ink/15 bg-white py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
                  >
                    Not a jaguar — discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {!askSpecies && (
            <form onSubmit={saveMeta} className="space-y-3 rounded-xl border border-gold/40 bg-white p-5 shadow-card">
              <h2 className="section-title">
                {missingLocation ? "Location required" : missingTime ? "Capture time missing" : "Field location"}
              </h2>
              <p className="text-[13px] text-ink/55">
                {obs.location_from_exif
                  ? "GPS was read from the file — click the map to adjust if needed."
                  : "Choose a camera station or click the map to pin the jaguar before matching or naming."}
              </p>
              {missingTime && (
                <label className="block text-[13px]">
                  Capture time
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    required={missingTime}
                  />
                </label>
              )}
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                required={missingLocation && (!lat || !lng)}
              >
                <option value="">Choose a station, or pin on the map</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name || s.code}
                  </option>
                ))}
              </select>
              <div>
                <p className="mb-2 text-[12.5px] text-ink/55">Click the map to place or move the pin</p>
                <SightingsMap
                  height={280}
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
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded-lg border px-3 py-2"
                  placeholder="Latitude"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  required={missingLocation && !stationId}
                />
                <input
                  className="rounded-lg border px-3 py-2"
                  placeholder="Longitude"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  required={missingLocation && !stationId}
                />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button disabled={busy} className="rounded-full bg-forest px-4 py-2 text-sm text-canvas">
                {missing ? "Save field location" : "Update location"}
              </button>
            </form>
          )}

          {alreadyNamed && !askSpecies && (
            <div className="rounded-xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-title mb-0">Already in the catalog</p>
                <ReviewStateBadge state={obs.review_state || "confirmed_match"} />
              </div>
              <p className="mt-2">
                This is <strong>{obs.individual_name}</strong>. No new name is needed. Sighting added to their map.
              </p>
              {obs.individual_code && (
                <Link href={`/individuals/${obs.individual_code}`} className="mt-3 inline-block text-gold">
                  Open map and profile
                </Link>
              )}
            </div>
          )}

          {isNewIndividual && !askSpecies && (
            <div className="rounded-xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-title mb-0">Registered as a new individual</p>
                <ReviewStateBadge state="new_jaguar" />
              </div>
              <p className="mt-2">
                Tracked as <strong>{obs.individual_name || obs.individual_code}</strong>. Propose a unique name if it does not have one yet.
              </p>
            </div>
          )}

          {isRejected && !askSpecies && !obs.individual_id && (
            <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-title mb-0">Suggestion declined</p>
                <ReviewStateBadge state="rejected_match" />
              </div>
              <p className="mt-2 text-[13px] text-ink/55">
                The listed match was rejected. You can register this as a new individual below if it is not already in the catalog.
              </p>
            </div>
          )}

          {!askSpecies && !alreadyNamed && !obs.individual_id && obs.candidates.length === 0 && libraryNote && (
            <div className="rounded-xl border border-gold/40 bg-white p-5 shadow-card">
              <p className="section-title">Nothing to compare against yet</p>
              <p className="mt-2 text-[13px] text-ink/55">{libraryNote}</p>
              <p className="mt-2 text-[13px] text-ink/45">
                The library holds {librarySize} confirmed photo{librarySize === 1 ? "" : "s"}. It grows every time
                someone confirms an identity, and an admin can seed it from the existing catalog in one pass.
              </p>
            </div>
          )}

          {!askSpecies && !alreadyNamed && !isConfirmed && isPotential && obs.candidates.length > 0 && !obs.individual_id && (
            <div className="rounded-xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-title mb-0 inline-flex items-center">
                  Possible previous sighting
                  <InfoTip label="About similarity scores">{CANDIDATE_SCORE_HELP}</InfoTip>
                </p>
                <ReviewStateBadge state="potential_match" />
              </div>
              <p className="mt-1 text-[13px] text-ink/55">
                Tap a jaguar to confirm the match. The app never assigns identity on its own.
              </p>
              {!locationReady && (
                <p className="mt-2 text-[13px] text-gold">Save location above before confirming a match.</p>
              )}
              {libraryNote && <p className="mt-1 text-[13px] text-gold">{libraryNote}</p>}
              <div className="mt-4 space-y-2.5">
                {obs.candidates.slice(0, 5).map((candidate, index) => {
                  const canConfirm = Boolean(user && canName(user.role, user.verified));
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => canConfirm && locationReady && !busy && confirmKnown(candidate.id)}
                      disabled={busy || !locationReady || !canConfirm}
                      className="flex w-full items-center gap-3 rounded-2xl border-2 border-forest/15 bg-[#f7f3ea] px-4 py-3.5 text-left transition hover:border-forest/40 hover:bg-[#efe8d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-[13px] font-semibold text-canvas">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">{candidate.display_name}</span>
                        <span className="mt-0.5 block font-mono text-[12px] text-ink/45">
                          {candidate.code} · {(candidate.score * 100).toFixed(0)}% similar
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-forest px-3.5 py-2 text-[12.5px] font-semibold text-canvas">
                        Select
                      </span>
                    </button>
                  );
                })}
              </div>
              {knownCandidate && knownCandidate.score >= 0.68 && (
                <p className="mt-3 text-[13px] text-ink/55">
                  Best match: <strong>{knownCandidate.display_name}</strong>. If this is the same individual, select it above.
                </p>
              )}
              {user && canName(user.role, user.verified) && (
                <button
                  type="button"
                  className="mt-4 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-3.5 text-[14px] font-semibold text-ink transition hover:border-ink/30 hover:bg-paper disabled:opacity-40"
                  onClick={rejectMatch}
                  disabled={busy}
                >
                  None of these — register as a new jaguar
                </button>
              )}
            </div>
          )}

          {showNameForm && (
            <form onSubmit={registerNew} className="space-y-3 rounded-xl border border-gold/35 bg-white p-5 shadow-card">
              <h2 className="section-title">
                {obs.individual_id ? "Name this jaguar" : "Name this jaguar"}
              </h2>
              <p className="text-[13px] text-ink/55">
                Type a unique common name now. You can fill location above first if GPS was missing — then submit for admin approval.
              </p>
              {!locationReady && (
                <p className="text-[13px] text-gold">Save a field location before submitting the name.</p>
              )}
              {!mayProposeName && (
                <p className="text-[13px] text-gold">Only verified scientists can propose names. Ask an admin to verify you.</p>
              )}
              {error && <p className="text-sm text-red-700">{error}</p>}
              <label className="block text-[12px]">
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink/45">Jaguar name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-[15px] text-ink"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sibú"
                  minLength={2}
                  required
                  disabled={!mayProposeName}
                  autoComplete="off"
                />
              </label>
              <button
                disabled={busy || !locationReady || !mayProposeName}
                className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {obs.individual_id ? "Submit name for approval" : "Register jaguar + submit name"}
              </button>
            </form>
          )}

          {!askSpecies && obs.identity_status === "under_review" && (
            <p className="rounded-xl bg-gold/10 px-4 py-3 text-[13px]">
              Name is waiting in the admin queue. It will appear everywhere only after approval.
            </p>
          )}

          {!askSpecies && (
          <p className="text-[13px]">
            <Link href={`/observations/${obs.id}`} className="text-gold">Open full record</Link>
            {" · "}
            <Link href="/map" className="text-gold">Sightings map</Link>
          </p>
          )}
        </div>
      )}
    </div>
  );
}
