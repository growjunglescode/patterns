"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@/lib/api";
import type { AccountRole } from "@/lib/roles";
import { canonicalRole, isAdmin, ROLE_OPTIONS, roleLabel } from "@/lib/roles";

const VIEW_KEY = "patterns_view_role";

const ROLE_HINT: Record<AccountRole, string> = {
  admin: "Control room, approvals, full nav",
  scientist: "Review, institution tools, naming",
  citizen: "Upload and browse catalog",
  viewer: "Browse only — no upload",
};

type RoleViewContextValue = {
  user: User | null;
  actualRole: AccountRole;
  viewRole: AccountRole;
  effectiveRole: AccountRole;
  isActualAdmin: boolean;
  setViewRole: (role: AccountRole) => void;
};

const RoleViewContext = createContext<RoleViewContextValue | null>(null);

export function RoleViewProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const actualRole = canonicalRole(user?.role);
  const isActualAdmin = isAdmin(user?.role);
  const [viewRole, setViewRoleState] = useState<AccountRole>(actualRole);

  useEffect(() => {
    if (!isActualAdmin) {
      setViewRoleState(actualRole);
      return;
    }
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem(VIEW_KEY) : null;
    if (saved && ROLE_OPTIONS.includes(saved as AccountRole)) {
      setViewRoleState(saved as AccountRole);
    } else {
      setViewRoleState("admin");
    }
  }, [actualRole, isActualAdmin, user?.id]);

  const setViewRole = useCallback((role: AccountRole) => {
    setViewRoleState(role);
    if (typeof window !== "undefined") window.sessionStorage.setItem(VIEW_KEY, role);
  }, []);

  const value = useMemo(
    () => ({
      user,
      actualRole,
      viewRole: isActualAdmin ? viewRole : actualRole,
      effectiveRole: isActualAdmin ? viewRole : actualRole,
      isActualAdmin,
      setViewRole,
    }),
    [user, actualRole, viewRole, isActualAdmin, setViewRole],
  );

  return <RoleViewContext.Provider value={value}>{children}</RoleViewContext.Provider>;
}

export function useRoleView() {
  const ctx = useContext(RoleViewContext);
  if (!ctx) {
    return {
      user: null,
      actualRole: "citizen" as AccountRole,
      viewRole: "citizen" as AccountRole,
      effectiveRole: "citizen" as AccountRole,
      isActualAdmin: false,
      setViewRole: (_role: AccountRole) => undefined,
    };
  }
  return ctx;
}

export function RoleViewSwitcher({ compact = false }: { compact?: boolean }) {
  const { isActualAdmin, viewRole, setViewRole } = useRoleView();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    place();
    function onDoc(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isActualAdmin) return null;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#2a3832] bg-[#0c1210] text-left ${
          compact ? "px-2 py-1.5" : "px-2.5 py-1.5 sm:px-3"
        }`}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8a9a92]">View as</span>
          <span className="truncate text-[12px] font-semibold text-[#e6ede8]">{roleLabel(viewRole)}</span>
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[#8a9a92] transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path d="M5.25 7.5 10 12.25 14.75 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && menuPos && (
        <ul
          role="listbox"
          aria-label="Choose RBAC role to preview"
          className="fixed z-[100] max-h-[min(24rem,70vh)] w-[min(17.5rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-[#2a3832] bg-[#0c1210] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <li className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a9a92]">
            Preview what each role sees
          </li>
          {ROLE_OPTIONS.map((role) => {
            const selected = role === viewRole;
            return (
              <li key={role} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3 py-2.5 text-left transition ${
                    selected ? "bg-[#c4a35a]/18" : "hover:bg-[#18211d] active:bg-[#18211d]"
                  }`}
                  onClick={() => {
                    setViewRole(role);
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#e6ede8]">{roleLabel(role)}</span>
                    {selected ? <span className="text-[11px] font-semibold text-[#c4a35a]">Selected</span> : null}
                  </span>
                  <span className="mt-0.5 text-[11px] text-[#8a9a92]">{ROLE_HINT[role]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
