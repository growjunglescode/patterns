"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => setMounted(true), []);

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
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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

  const menu =
    open && menuPos && mounted
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label="Choose RBAC role to preview"
            className="role-view-menu fixed z-[200] max-h-[min(24rem,70vh)] w-[min(17.5rem,calc(100vw-1rem))] overflow-auto rounded-lg py-1.5"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <li className="role-view-heading px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em]">
              Preview what each role sees
            </li>
            {ROLE_OPTIONS.map((role) => {
              const selected = role === viewRole;
              return (
                <li key={role} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    data-selected={selected ? "true" : "false"}
                    className="flex flex-col px-3 py-3"
                    onClick={() => {
                      setViewRole(role);
                      setOpen(false);
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="role-view-label text-[14px] tracking-tight">{roleLabel(role)}</span>
                      {selected ? <span className="role-view-selected text-[11px]">Selected</span> : null}
                    </span>
                    <span className="role-view-hint mt-1 text-[12px] leading-snug">{ROLE_HINT[role]}</span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`role-view-trigger inline-flex min-h-10 items-center gap-1.5 rounded-md text-left ${
          compact ? "px-2 py-1.5" : "px-2.5 py-1.5 sm:px-3"
        }`}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="role-view-kicker text-[9px] font-semibold uppercase tracking-[0.14em]">View as</span>
          <span className="role-view-value truncate text-[12px] font-semibold">{roleLabel(viewRole)}</span>
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          style={{ color: "#c4d0c8" }}
        >
          <path d="M5.25 7.5 10 12.25 14.75 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
