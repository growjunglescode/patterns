"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "Reading file metadata…",
  "Detecting animal in frame…",
  "Mapping coat pattern…",
  "Building embedding vector…",
  "Comparing to known jaguars…",
  "Ranking similarity candidates…",
];

/** AI-style coat scan overlay while upload / recognition runs. */
export function CoatScanOverlay({
  previewUrl,
  isVideo = false,
}: {
  previewUrl: string | null;
  isVideo?: boolean;
}) {
  const [stage, setStage] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const stageTimer = window.setInterval(() => {
      setStage((i) => (i + 1) % STAGES.length);
    }, 1600);
    const tickTimer = window.setInterval(() => {
      setTick((n) => n + 1);
    }, 90);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  const hex = Array.from({ length: 8 }, (_, i) =>
    (((tick * 17 + i * 41) % 256).toString(16).padStart(2, "0")),
  ).join("").toUpperCase();

  return (
    <div className="coat-scan overflow-hidden rounded-[1.4rem] border border-gold/30 bg-[#0a100e] shadow-lift">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#071912]">
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              className="h-full w-full object-contain opacity-80"
              muted
              playsInline
              autoPlay
              loop
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-contain opacity-80" />
          )
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[12px] text-gold/50">
            Awaiting frame…
          </div>
        )}

        <div className="coat-scan__grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="coat-scan__beam pointer-events-none absolute inset-x-0" aria-hidden />
        <div className="coat-scan__vignette pointer-events-none absolute inset-0" aria-hidden />

        <div className="pointer-events-none absolute left-3 top-3 h-7 w-7 border-l-2 border-t-2 border-gold/80" />
        <div className="pointer-events-none absolute right-3 top-3 h-7 w-7 border-r-2 border-t-2 border-gold/80" />
        <div className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 border-b-2 border-l-2 border-gold/80" />
        <div className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 border-b-2 border-r-2 border-gold/80" />

        <div className="pointer-events-none absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.18em] text-gold/90">
          Patterns · coat scan
        </div>
        <div className="pointer-events-none absolute right-4 top-4 font-mono text-[10px] text-teal/80">
          LIVE
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
        </div>
      </div>

      <div className="space-y-3 border-t border-gold/20 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[13px] text-[#efe8d8]">{STAGES[stage]}</p>
          <p className="shrink-0 font-mono text-[11px] text-gold/70">{Math.min(99, 12 + stage * 14 + (tick % 7))}%</p>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="coat-scan__bar h-full rounded-full bg-gradient-to-r from-teal to-gold"
            style={{ width: `${Math.min(96, 18 + stage * 14 + (tick % 8))}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-gold/45">
          <span>VEC {hex.slice(0, 8)}</span>
          <span>FLANK CHK</span>
          <span>COSINE RANK</span>
          <span>NO AUTO-ID</span>
        </div>
        <p className="text-[12.5px] text-[#efe8d8]/55">
          The model proposes matches. A person always confirms identity.
        </p>
      </div>
    </div>
  );
}
