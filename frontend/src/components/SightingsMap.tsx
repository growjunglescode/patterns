"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaSrc } from "@/lib/api";

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

export function SightingsMap({
  points,
  track = [],
  height = 420,
}: {
  points: MapPoint[];
  track?: MapPoint[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [mapHeight, setMapHeight] = useState(height);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const dark = typeof document !== "undefined" && Boolean(document.querySelector(".ops"));
  const plotted = useMemo(() => spreadPoints(points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))), [points]);
  const plottedTrack = useMemo(
    () => track.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [track],
  );
  const signature = useMemo(
    () =>
      JSON.stringify({
        points: plotted.map((p) => [
          p.lat,
          p.lng,
          p.label,
          p.captured_at || "",
          p.href || "",
          p.photo_url || "",
          p.location || "",
        ]),
        track: plottedTrack.map((p) => [p.lat, p.lng]),
        dark,
      }),
    [plotted, plottedTrack, dark],
  );

  useEffect(() => {
    function sync() {
      setMapHeight(window.innerWidth < 640 ? Math.min(height, 320) : height);
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [height]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([9.63, -84.0], 8);

        L.tileLayer(
          dark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            attribution: "&copy; OpenStreetMap &copy; CARTO",
            maxZoom: 18,
          },
        ).addTo(map);

        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
        setError("");

        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(containerRef.current);
        setTimeout(() => map.invalidateSize(), 80);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Map failed to load");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      map.eachLayer((layer: any) => {
        if (layer instanceof L.TileLayer) map.removeLayer(layer);
      });
      L.tileLayer(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          maxZoom: 18,
        },
      ).addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [dark, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group || !ready) return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current || !layerRef.current) return;

      group.clearLayers();

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

      if (plotted.length === 1) {
        map.setView([plotted[0].lat, plotted[0].lng], 11);
      } else if (plotted.length > 1) {
        map.fitBounds(
          plotted.map((p) => [p.lat, p.lng] as [number, number]),
          { padding: [36, 36], maxZoom: 12 },
        );
      } else {
        map.setView([9.63, -84.0], 8);
      }
      setTimeout(() => map.invalidateSize(), 40);
    })();

    return () => {
      cancelled = true;
    };
  }, [signature, ready, plotted, plottedTrack, dark]);

  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [mapHeight, ready]);

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper)]">
      <div ref={containerRef} style={{ height: mapHeight, width: "100%" }} />
      {!plotted.length && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--paper)]/70 px-6 text-center text-[13px] text-[var(--muted)]">
          No geotagged sightings yet. Confirm GPS or a camera station on an observation to pin it here.
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-[#7a2e2e] px-4 py-2 text-[12.5px] text-white">{error}</div>
      )}
    </div>
  );
}
