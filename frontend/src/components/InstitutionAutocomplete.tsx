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
};

export function InstitutionAutocomplete({
  value,
  onChange,
  onSelect,
  affiliation,
  placeholder = "Start typing a university or institution…",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (row: InstitutionSuggestion) => void;
  affiliation?: "university" | "institution" | string;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InstitutionSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipSearch = useRef(false);

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
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .searchInstitutions(q, affiliation)
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
  }, [value, affiliation]);

  function choose(row: InstitutionSuggestion) {
    skipSearch.current = true;
    onChange(row.name);
    onSelect?.(row);
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={wrapRef} className="relative mt-1">
      <input
        className="w-full"
        value={value}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (results.length) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && (
        <p className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8a9a92]">Searching…</p>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#2a3832] bg-[#070a09] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          {results.map((row, index) => {
            const meta = [row.city, row.country].filter(Boolean).join(" · ");
            const acronym = row.acronyms?.[0];
            return (
              <li key={`${row.id || row.name}-${index}`}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3 py-2 text-left ${
                    index === active ? "bg-[#c4a35a]/15" : "hover:bg-[#101614]"
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row)}
                >
                  <span className="text-[13.5px] font-medium text-[#e6ede8]">
                    {row.name}
                    {acronym ? <span className="ml-2 text-[12px] font-normal text-[#8a9a92]">{acronym}</span> : null}
                  </span>
                  {meta && <span className="text-[12px] text-[#8a9a92]">{meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 text-[11.5px] text-[#8a9a92]/90">
        Suggestions from the worldwide Research Organization Registry. You can still type a custom name.
      </p>
    </div>
  );
}
