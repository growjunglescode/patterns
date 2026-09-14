"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type InstitutionSuggestion = {
  id?: string | null;
  name: string;
  country?: string | null;
  city?: string | null;
  types?: string[];
  acronyms?: string[];
  source?: string;
};

export function InstitutionAutocomplete({
  value,
  onChange,
  onSelect,
  affiliation,
  preferCountry,
  placeholder = "Start typing a university or institution…",
  required = false,
  tone = "light",
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (row: InstitutionSuggestion) => void;
  affiliation?: "university" | "institution" | "organization" | string;
  /** Soft ranking hint only — never hides other countries. */
  preferCountry?: string;
  placeholder?: string;
  required?: boolean;
  tone?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InstitutionSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [preferEnabled, setPreferEnabled] = useState(Boolean(preferCountry?.trim()));
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipSearch = useRef(false);
  const userEdited = useRef(false);

  const dark = tone === "dark";
  const countryHint = preferCountry?.trim() || "";

  useEffect(() => {
    if (countryHint) setPreferEnabled(true);
  }, [countryHint]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    // Don't hit the worldwide registry just because the profile hydrated an existing name.
    if (!userEdited.current) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const countryBoost = preferEnabled && countryHint ? countryHint : undefined;
      api
        .searchInstitutions(q, affiliation, countryBoost)
        .then((payload) => {
          if (cancelled) return;
          setResults(payload.results || []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setOpen(false);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, affiliation, preferEnabled, countryHint]);

  function choose(row: InstitutionSuggestion) {
    skipSearch.current = true;
    userEdited.current = true;
    onChange(row.name);
    onSelect?.(row);
    setOpen(false);
    setResults([]);
  }

  function keepCustom() {
    skipSearch.current = true;
    setOpen(false);
    setResults([]);
  }

  const listClass = dark
    ? "absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#2a3832] bg-[#070a09] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
    : "absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-ink/10 bg-canvas py-1 shadow-card";
  const itemHover = dark ? "hover:bg-[#101614]" : "hover:bg-paper";
  const itemActive = dark ? "bg-[#c4a35a]/15" : "bg-gold/15";
  const titleClass = dark ? "text-[#e6ede8]" : "text-ink";
  const metaClass = dark ? "text-[#8a9a92]" : "text-ink/55";
  const hintClass = dark ? "text-[#8a9a92]/90" : "text-ink/50";
  const chipOn = dark
    ? "border-[#c4a35a]/55 bg-[#c4a35a]/10 text-[#e6ede8]"
    : "border-gold/50 bg-gold/10 text-ink";
  const chipOff = dark
    ? "border-[#2a3832] bg-[#070a09]/40 text-[#8a9a92]"
    : "border-ink/10 bg-paper text-ink/60";

  return (
    <div ref={wrapRef} className="relative mt-1">
      <input
        className="w-full"
        value={value}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          userEdited.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => {
          if (results.length || value.trim().length >= 2) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          const customOffset = value.trim().length >= 2 ? 1 : 0;
          const total = results.length + customOffset;
          if (!total) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, total - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (active < results.length && results[active]) choose(results[active]);
            else keepCustom();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && (
        <p className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${metaClass}`}>Searching…</p>
      )}
      {countryHint ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreferEnabled((v) => !v)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
              preferEnabled ? chipOn : chipOff
            }`}
            aria-pressed={preferEnabled}
          >
            Prefer {countryHint}
          </button>
          <span className={`text-[11px] ${hintClass}`}>Boosts matches — still searches worldwide</span>
        </div>
      ) : null}
      {open && (results.length > 0 || value.trim().length >= 2) && (
        <ul className={listClass}>
          {results.map((row, index) => {
            const place = [row.city, row.country].filter(Boolean).join(" · ");
            const meta = [place, row.source === "partner" ? "Patterns partner" : null].filter(Boolean).join(" · ");
            const acronym = row.acronyms?.[0];
            return (
              <li key={`${row.id || row.name}-${index}`}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3 py-2 text-left ${
                    index === active ? itemActive : itemHover
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row)}
                >
                  <span className={`text-[13.5px] font-medium ${titleClass}`}>
                    {row.name}
                    {acronym ? <span className={`ml-2 text-[12px] font-normal ${metaClass}`}>{acronym}</span> : null}
                  </span>
                  {meta && <span className={`text-[12px] ${metaClass}`}>{meta}</span>}
                </button>
              </li>
            );
          })}
          {value.trim().length >= 2 && (
            <li>
              <button
                type="button"
                className={`flex w-full flex-col border-t px-3 py-2 text-left ${
                  dark ? "border-[#2a3832]" : "border-ink/10"
                } ${active === results.length ? itemActive : itemHover}`}
                onMouseEnter={() => setActive(results.length)}
                onClick={keepCustom}
              >
                <span className={`text-[13.5px] font-medium ${titleClass}`}>Use “{value.trim()}”</span>
                <span className={`text-[12px] ${metaClass}`}>Keep as a custom name (not in registry)</span>
              </button>
            </li>
          )}
        </ul>
      )}
      <p className={`mt-1.5 text-[11.5px] ${hintClass}`}>
        Patterns partners plus the worldwide Research Organization Registry. You can always keep a custom name.
      </p>
    </div>
  );
}
