"use client";

import { useId, useState } from "react";

/** Small ⓘ control with hover/focus/click explanation. */
export function InfoTip({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="group/tip relative inline-flex align-middle"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current/30 text-[9px] font-bold leading-none text-ink/45 hover:border-ink/45 hover:text-ink/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        title={children}
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-[calc(100%+6px)] z-40 w-[15.5rem] rounded-lg border border-[var(--line)] bg-[#0d1210] px-2.5 py-2 text-left text-[11.5px] font-normal normal-case leading-snug tracking-normal text-ink/85 shadow-lg sm:left-1/2 sm:-translate-x-1/2 ${
          open ? "visible opacity-100" : "invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100"
        }`}
      >
        {children}
      </span>
    </span>
  );
}

export const SIMILARITY_SCORE_HELP =
  "How closely this photo’s coat pattern matches a known jaguar (same flank). Higher is stronger. About 68%+ may suggest a candidate; about 82%+ is a strong match. Identity is never assigned automatically — a person still confirms.";

export const FLANK_HELP =
  "Which side of the jaguar was photographed. Left and right coats are different, so Patterns only compares photos of the same flank.";

export const CANDIDATE_SCORE_HELP =
  "Each percentage is coat-pattern similarity to that jaguar. Ranked highest first; still requires human confirmation.";
