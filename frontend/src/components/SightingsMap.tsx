"use client";

import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number; label: string; captured_at?: string | null };

export function SightingsMap({
  points,
  track = [],
  height = 420,
}: {
  points: Point[];
  track?: Point[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = typeof document !== "undefined" && Boolean(document.querySelector(".ops"));
  const [mapHeight, setMapHeight] = useState(height);

  useEffect(() => {
    function sync() {
      setMapHeight(window.innerWidth < 640 ? Math.min(height, 280) : height);
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [height]);

  useEffect(() => {
    let map: any;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      const start = points[0] || { lat: 8.53, lng: -83.5 };
      map = L.map(ref.current).setView([start.lat, start.lng], points.length ? 10 : 8);
      L.tileLayer(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
        },
      ).addTo(map);
      for (const p of points) {
        L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: "#c4a35a",
          weight: 1.4,
          fillColor: dark ? "#c4a35a" : "#0c2b21",
          fillOpacity: 0.92,
        })
          .bindPopup(`${p.label}${p.captured_at ? `<br>${new Date(p.captured_at).toLocaleString()}` : ""}`)
          .addTo(map);
      }
      if (track.length > 1) {
        L.polyline(
          track.map((p) => [p.lat, p.lng]),
          { color: "#c4a35a", dashArray: "2 10", weight: 2.4 },
        ).addTo(map);
      }
      if (points.length > 1) {
        map.fitBounds(
          points.map((p) => [p.lat, p.lng] as [number, number]),
          { padding: [24, 24] },
        );
      }
      setTimeout(() => map?.invalidateSize(), 50);
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points, track, dark, mapHeight]);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper)]"
      style={{ height: mapHeight }}
    />
  );
}
