"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SightingsMap } from "@/components/SightingsMap";
import { AdminAccountFilter } from "@/components/AdminFilters";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { api, type Individual } from "@/lib/api";
import { matchesQuery, uniqueSorted } from "@/lib/filter";
import { useProjectId } from "@/lib/useProjectId";

type PinMode = "view" | "camera" | "jaguar";

function MapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"sightings" | "stations">("sightings");
  const [pinMode, setPinMode] = useState<PinMode>("view");
  const [individualId, setIndividualId] = useState(searchParams.get("individual") || "");
  const [uploader, setUploader] = useState("");
  const [species, setSpecies] = useState("");
  const [grade, setGrade] = useState("");
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [payload, setPayload] = useState<{ points: any[]; track?: any[] }>({ points: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [stationName, setStationName] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const projectId = useProjectId();

  useEffect(() => {
    const fromUrl = searchParams.get("individual") || "";
    if (fromUrl) {
      setIndividualId(fromUrl);
      setMode("sightings");
    }
  }, [searchParams]);

  useEffect(() => {
    api.individuals(undefined, projectId).then(setIndividuals).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .map(
        mode,
        mode === "sightings" ? individualId || undefined : undefined,
        mode === "sightings" ? uploader || undefined : undefined,
        projectId,
      )
      .then((next) => {
        if (!cancelled) {
          setPayload({
            points: Array.isArray(next?.points) ? next.points : [],
            track: Array.isArray(next?.track) ? next.track : [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPayload({ points: [] });
          setError(err instanceof Error ? err.message : "Could not load map data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, individualId, uploader, projectId, reloadKey]);

  const selected = useMemo(() => individuals.find((c) => c.id === individualId), [individuals, individualId]);
  const individualOptions = useMemo(() => individuals.filter((c) => matchesQuery(c, query)), [individuals, query]);

  const visiblePoints = useMemo(() => {
    let points = payload.points || [];
    if (mode === "sightings") {
      if (species) points = points.filter((p: any) => p.species === species);
      if (grade) points = points.filter((p: any) => p.grade === grade);
    }
    if (!query.trim() || individualId) return points;
    const names = new Set(individualOptions.map((c) => c.display_name.toLowerCase()));
    return points.filter(
      (p: any) =>
        matchesQuery(p, query) ||
        names.has(String(p.label || "").toLowerCase()) ||
        matchesQuery({ uploader: p.uploader_name }, query),
    );
  }, [payload.points, query, individualId, individualOptions, species, grade, mode]);

  const mapPoints = useMemo(
    () =>
      visiblePoints.map((p: any) => ({
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        captured_at: p.captured_at,
        kind: p.kind || (mode === "stations" ? "station" : undefined),
        photo_url: p.photo_url,
        location: p.location,
        station_code: p.station_code,
        href: mode === "sightings" && p.id ? `/observations/${p.id}` : undefined,
        id: p.id,
      })),
    [visiblePoints, mode],
  );

  const track = useMemo(() => {
    if (mode !== "sightings") return [];
    const ids = new Set(visiblePoints.map((p: any) => p.id));
    const source = individualId ? payload.track || visiblePoints : visiblePoints;
    return source
      .filter((p: any) => ids.has(p.id) || !individualId)
      .filter((p: any) => p.lat != null && p.lng != null)
      .map((p: any) => ({
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        captured_at: p.captured_at,
      }));
  }, [mode, individualId, payload.track, visiblePoints]);

  function setPinTool(next: PinMode) {
    setPinMode(next);
    setPin(null);
    setNotice("");
    setError("");
    if (next === "camera") setMode("stations");
    if (next === "jaguar") setMode("sightings");
  }

  async function saveCamera(e: FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createStation({
        name: stationName.trim(),
        code: stationCode.trim() || undefined,
        latitude: pin.lat,
        longitude: pin.lng,
        project_id: projectId,
      });
      setNotice(`Camera ${created.code} pinned.`);
      setStationName("");
      setStationCode("");
      setPin(null);
      setPinMode("view");
      setMode("stations");
      setReloadKey((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save camera");
    } finally {
      setBusy(false);
    }
  }

  async function applyJaguarPin() {
    if (!pin) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (individualId) {
        const rows = await api.detections(undefined, individualId, undefined, undefined, projectId);
        const target =
          rows.find((d) => d.latitude == null || d.longitude == null) ||
          rows[0];
        if (target) {
          await api.patchMetadata(target.id, {
            latitude: pin.lat,
            longitude: pin.lng,
          });
          setNotice(`Jaguar pin saved on the latest sighting for ${selected?.display_name || "this animal"}.`);
          setPin(null);
          setPinMode("view");
          setReloadKey((n) => n + 1);
          return;
        }
      }
      router.push(`/upload?lat=${pin.lat}&lng=${pin.lng}${individualId ? `&individual=${encodeURIComponent(individualId)}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save jaguar pin");
    } finally {
      setBusy(false);
    }
  }

  const pickHint =
    pinMode === "camera"
      ? "Click the map to place a camera station in Costa Rica"
      : pinMode === "jaguar"
        ? selected
          ? `Click to pin ${selected.display_name}`
          : "Click to place a jaguar pin, then upload or attach to a sighting"
        : "Click the map to place the pin";

  return (
    <div className="space-y-4">
      <FilterBar query={query} onQuery={setQuery} placeholder="Filter map…" showing={mapPoints.length} total={(payload.points || []).length}>
        <AdminAccountFilter value={uploader} onChange={setUploader} label="All uploaders" />
        {mode === "sightings" && (
          <>
            <FilterSelect
              label="All species"
              value={species}
              onChange={setSpecies}
              options={uniqueSorted((payload.points || []).map((p: any) => p.species))}
            />
            <FilterSelect
              label="All grades"
              value={grade}
              onChange={setGrade}
              options={uniqueSorted((payload.points || []).map((p: any) => p.grade))}
            />
          </>
        )}
      </FilterBar>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-kicker">Field</p>
          <h1 className="page-title mt-1">Map</h1>
          <p className="mt-1 text-[0.9375rem] text-ink/55">
            {selected
              ? `Tracking ${selected.display_name} from camera-trap re-sightings — not a GPS collar.`
              : "Starts in Costa Rica. Pin cameras or jaguars, or browse geotagged sightings."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select
            className="rounded-full border bg-white px-3 py-1.5"
            value={individualId}
            onChange={(e) => {
              setIndividualId(e.target.value);
              setMode("sightings");
            }}
          >
            <option value="">All animals</option>
            {individualOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${mode === "sightings" && pinMode === "view" ? "bg-forest text-canvas" : "bg-white"}`}
            onClick={() => {
              setMode("sightings");
              setPinTool("view");
            }}
          >
            Sightings
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${mode === "stations" && pinMode === "view" ? "bg-forest text-canvas" : "bg-white"}`}
            onClick={() => {
              setMode("stations");
              setPinTool("view");
            }}
          >
            Stations
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${pinMode === "camera" ? "bg-gold text-white" : "bg-white"}`}
            onClick={() => setPinTool(pinMode === "camera" ? "view" : "camera")}
          >
            Pin camera
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${pinMode === "jaguar" ? "bg-gold text-white" : "bg-white"}`}
            onClick={() => setPinTool(pinMode === "jaguar" ? "view" : "jaguar")}
          >
            Pin jaguar
          </button>
        </div>
      </div>
      {error && <p className="text-[13px] text-[var(--signal-warn)]">{error}</p>}
      {notice && <p className="text-[13px] text-[var(--signal-ok,#6fbf9a)]">{notice}</p>}
      {loading && <p className="text-[13px] text-[var(--muted)]">Loading map…</p>}
      <SightingsMap
        points={mapPoints}
        track={individualId ? track : []}
        height={640}
        pickable={pinMode !== "view"}
        pickHint={pickHint}
        pin={pin}
        onPick={(lat, lng) => setPin({ lat, lng })}
        onRemovePoint={async (point) => {
          if (point.kind !== "station" || !point.id) return;
          try {
            await api.deleteStation(point.id);
            setNotice(`Removed camera pin ${point.label}.`);
            setReloadKey((n) => n + 1);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not remove pin");
          }
        }}
      />
      {pinMode === "camera" && pin && (
        <form onSubmit={saveCamera} className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-card">
          <p className="section-title">New camera station</p>
          <p className="text-[13px] text-ink/55">
            Pin at {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}. Click the map again to move it.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="rounded-lg border px-3 py-2"
              placeholder="Station name"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              required
              minLength={2}
            />
            <input
              className="rounded-lg border px-3 py-2"
              placeholder="Code (optional)"
              value={stationCode}
              onChange={(e) => setStationCode(e.target.value)}
            />
          </div>
          <button disabled={busy} className="rounded-full bg-forest px-4 py-2 text-sm text-canvas disabled:opacity-40">
            Save camera pin
          </button>
        </form>
      )}
      {pinMode === "jaguar" && pin && (
        <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-card">
          <p className="section-title">Jaguar pin</p>
          <p className="text-[13px] text-ink/55">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            {selected ? ` · for ${selected.display_name}` : " · no animal selected — continues to Upload"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={applyJaguarPin}
            className="rounded-full bg-forest px-4 py-2 text-sm text-canvas disabled:opacity-40"
          >
            {selected ? "Save on latest sighting" : "Continue on Upload"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading map…</p>}>
      <MapPageInner />
    </Suspense>
  );
}
