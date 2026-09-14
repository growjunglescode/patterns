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

export function RoleViewSwitcher() {
  const { isActualAdmin, viewRole, setViewRole } = useRoleView();
  if (!isActualAdmin) return null;
  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-[10px] uppercase tracking-[0.12em] text-[#8a9a92] sm:inline">View as</span>
      <select
        value={viewRole}
        onChange={(e) => setViewRole(e.target.value as AccountRole)}
        className="!min-h-9 max-w-[9.5rem] !rounded-md !border !border-[#2a3832] !bg-[#0c1210] !px-2 !py-1.5 text-[11px] font-semibold text-[#e6ede8] sm:max-w-none"
        aria-label="View app as role"
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
