"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaSrc } from "@/lib/api";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  captured_at?: string | null;
  href?: string | null;
  kind?: string | null;
  photo_url?: string | null;
  location?: string | null;
  station_code?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function popupHtml(point: MapPoint) {
  const when = point.captured_at
    ? new Date(point.captured_at).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time unknown";
  const place = point.location || point.station_code || "Location unknown";
  const coords = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  const photo = point.photo_url
    ? `<img class="map-popup-photo" src="${escapeHtml(mediaSrc(point.photo_url))}" alt="" />`
    : `<div class="map-popup-photo map-popup-photo--empty">No photo</div>`;
  const link = point.href
    ? `<a class="map-popup-link" href="${escapeHtml(point.href)}">Open record →</a>`
    : "";
  return `
    <div class="map-popup">
      ${photo}
      <div class="map-popup-body">
        <p class="map-popup-name">${escapeHtml(point.label)}</p>
        <p class="map-popup-meta">${escapeHtml(when)}</p>
        <p class="map-popup-meta">${escapeHtml(place)}</p>
        <p class="map-popup-coords">${escapeHtml(coords)}</p>
        ${link}
      </div>
    </div>
  `;
}

/** Nudge coincident pins so stacked sightings remain clickable. */
function spreadPoints(points: MapPoint[]): MapPoint[] {
  const groups = new Map<string, number>();
  return points.map((point) => {
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const index = groups.get(key) || 0;
    groups.set(key, index + 1);
    if (index === 0) return point;
    const angle = (index * 2.4) % (Math.PI * 2);
    const radius = 0.0012 * Math.ceil(index / 6);
    return {
      ...point,
      lat: point.lat + Math.cos(angle) * radius,
      lng: point.lng + Math.sin(angle) * radius,
    };
  });
}

async function loadLeaflet() {
  const mod = await import("leaflet");
  return (mod as { default?: typeof import("leaflet") }).default ?? mod;
}

/**
 * Fixed OSM endpoint — no `{s}` / subdomains option.
 * Passing `subdomains: undefined` crashes Leaflet with
 * "Cannot read properties of undefined (reading 'length')".
 */
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function SightingsMap({
  points,
  track = [],
  height = 420,
  pickable = false,
  pin = null,
  onPick,
  pickHint = "Click the map to place the jaguar pin",
}: {
  points?: MapPoint[];
  track?: MapPoint[];
  height?: number;
  pickable?: boolean;
  pin?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  pickHint?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const pinLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const [mapHeight, setMapHeight] = useState(height);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  onPickRef.current = onPick;

  const dark =
    typeof document !== "undefined" && Boolean(document.querySelector(".ops"));
  const plotted = useMemo(() => {
    const list = Array.isArray(points) ? points : [];
    return spreadPoints(list.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)));
  }, [points]);
  const plottedTrack = useMemo(() => {
    const list = Array.isArray(track) ? track : [];
    return list.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  }, [track]);
  const pinValid = pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng) ? pin : null;

  useEffect(() => {
    function sync() {
      setMapHeight(window.innerWidth < 640 ? Math.min(height, 320) : height);
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [height]);

  // Create map once
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let map: import("leaflet").Map | null = null;

    (async () => {
      try {
        const L = await loadLeaflet();
        const el = containerRef.current;
        if (cancelled || !el) return;

        // React Strict Mode remount: clear stale Leaflet state on the DOM node
        if ((el as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
          try {
            mapRef.current?.remove();
          } catch {
            /* ignore */
          }
          delete (el as HTMLElement & { _leaflet_id?: number })._leaflet_id;
          el.innerHTML = "";
        }

        map = L.map(el, {
          zoomControl: true,
          attributionControl: true,
        }).setView([9.63, -84.0], 8);

        // Never pass a subdomains option — omit entirely
        L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTR,
          maxZoom: 19,
        }).addTo(map);

        markersRef.current = L.layerGroup().addTo(map);
        pinLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        if (!cancelled) {
          setReady(true);
          setError("");
        }

        resizeObserver = new ResizeObserver(() => {
          map?.invalidateSize();
        });
        resizeObserver.observe(el);
        requestAnimationFrame(() => map?.invalidateSize());
        setTimeout(() => map?.invalidateSize(), 200);
        setTimeout(() => map?.invalidateSize(), 600);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Map failed to load");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      try {
        map?.remove();
      } catch {
        /* ignore */
      }
      try {
        mapRef.current?.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      markersRef.current = null;
      pinLayerRef.current = null;
    };
  }, []);

  // Dark ops theme: invert OSM tiles instead of swapping providers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.toggle("sightings-map--dark", dark);
  }, [dark, ready]);

  // Click-to-pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const onClick = (e: { latlng: { lat: number; lng: number } }) => {
      if (!pickable || !onPickRef.current) return;
      onPickRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    };
    map.on("click", onClick);
    const container = map.getContainer();
    container.style.cursor = pickable ? "crosshair" : "";
    return () => {
      map.off("click", onClick);
      container.style.cursor = "";
    };
  }, [pickable, ready]);

  // Draw markers / track / pin
  useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    const pinGroup = pinLayerRef.current;
    if (!map || !group || !ready) return;

    let cancelled = false;
    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRef.current || !markersRef.current) return;

        group.clearLayers();
        pinGroup?.clearLayers();

        for (const point of plotted) {
          const marker = L.circleMarker([point.lat, point.lng], {
            radius: point.kind === "station" ? 9 : 7,
            color: "#c4a35a",
            weight: 1.5,
            fillColor: dark ? "#c4a35a" : point.kind === "station" ? "#1f6b52" : "#0c2b21",
            fillOpacity: 0.92,
          });
          marker.bindPopup(popupHtml(point), {
            maxWidth: 260,
            minWidth: 200,
            className: "map-popup-wrap",
            autoPanPadding: [24, 24],
          });
          group.addLayer(marker);
        }

        if (plottedTrack.length > 1) {
          group.addLayer(
            L.polyline(
              plottedTrack.map((p) => [p.lat, p.lng] as [number, number]),
              { color: "#c4a35a", dashArray: "2 10", weight: 2.4 },
            ),
          );
        }

        if (pinValid && pinGroup) {
          const pinMarker = L.circleMarker([pinValid.lat, pinValid.lng], {
            radius: 10,
            color: "#f0e6d2",
            weight: 2.5,
            fillColor: "#c45a3a",
            fillOpacity: 0.95,
          });
          pinMarker.bindPopup(
            `<div class="map-popup"><div class="map-popup-body"><p class="map-popup-name">Pinned location</p><p class="map-popup-coords">${pinValid.lat.toFixed(5)}, ${pinValid.lng.toFixed(5)}</p></div></div>`,
            { className: "map-popup-wrap" },
          );
          pinGroup.addLayer(pinMarker);
        }

        const focus: [number, number][] = [
          ...plotted.map((p) => [p.lat, p.lng] as [number, number]),
          ...(pinValid ? [[pinValid.lat, pinValid.lng] as [number, number]] : []),
        ];

        if (focus.length === 1) {
          map.setView(focus[0], pickable ? 12 : 11);
        } else if (focus.length > 1) {
          map.fitBounds(L.latLngBounds(focus), { padding: [36, 36], maxZoom: pickable ? 14 : 12 });
        } else {
          map.setView([9.63, -84.0], 8);
        }
        map.invalidateSize();
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Map failed to update");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, plotted, plottedTrack, dark, pinValid, pickable]);

  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [mapHeight, ready]);

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper)]">
      <div
        ref={containerRef}
        className="sightings-map z-0"
        style={{ height: mapHeight, width: "100%", minHeight: 240 }}
      />
      {pickable && (
        <div className="pointer-events-none absolute left-3 top-3 z-[450] rounded-md bg-[#0d1210]/90 px-2.5 py-1.5 text-[12px] text-[#f0e6d2] shadow">
          {pinValid ? "Click again to move the pin" : pickHint}
        </div>
      )}
      {!pickable && !plotted.length && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[400] bg-[var(--paper)]/90 px-4 py-3 text-center text-[13px] text-[var(--muted)]">
          Map is ready. No geotagged pins in this view yet — upload with GPS or pin a location after analysis.
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 bottom-0 z-[500] bg-[#7a2e2e] px-4 py-2 text-[12.5px] text-white">{error}</div>
      )}
    </div>
  );
}
