"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@/lib/api";
import type { AccountRole } from "@/lib/roles";
import { canonicalRole, isAdmin, ROLE_OPTIONS, roleLabel } from "@/lib/roles";

const VIEW_KEY = "patterns_view_role";

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
  if (!isActualAdmin) return null;

  return (
    <label
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#2a3832] bg-[#0c1210] ${
        compact ? "min-h-10 px-2 py-1" : "min-h-10 px-2.5 py-1.5 sm:gap-2 sm:px-3"
      }`}
    >
      <span className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8a9a92] sm:inline">
        View as
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8a9a92] sm:hidden">View</span>
      <select
        value={viewRole}
        onChange={(e) => setViewRole(e.target.value as AccountRole)}
        aria-label="View app as RBAC role"
        className="!m-0 !min-h-0 !w-auto !min-w-[6.5rem] !max-w-[9.5rem] !rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-[11px] !font-semibold !text-[#e6ede8] !shadow-none !outline-none focus:!shadow-none sm:!min-w-[8.5rem] sm:!max-w-none sm:!text-[12px]"
      >
        {ROLE_OPTIONS.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>
    </label>
  );
}
