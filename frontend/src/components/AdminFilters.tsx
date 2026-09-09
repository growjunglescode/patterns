"use client";

import { useEffect, useState } from "react";
import { FilterSelect } from "@/components/FilterBar";
import { api, type User } from "@/lib/api";
import { isAdmin, roleLabel } from "@/lib/roles";

/** Loads accounts once for admin-only filter dropdowns. */
export function useAdminAccounts() {
  const [me, setMe] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setMe(user);
        if (isAdmin(user.role)) {
          api.users().then(setAccounts).catch(() => setAccounts([]));
        }
      })
      .catch(() => undefined);
  }, []);

  return {
    me,
    isAdmin: isAdmin(me?.role),
    accounts,
    accountOptions: accounts.map((u) => ({
      value: u.id,
      label: `${u.display_name} · ${roleLabel(u.role)}`,
    })),
    nameOptions: accounts.map((u) => ({
      value: u.display_name,
      label: `${u.display_name} · ${roleLabel(u.role)}`,
    })),
  };
}

export function AdminAccountFilter({
  value,
  onChange,
  label = "All accounts",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const { isAdmin: admin, accountOptions } = useAdminAccounts();
  if (!admin || accountOptions.length === 0) return null;
  return <FilterSelect label={label} value={value} onChange={onChange} options={accountOptions} />;
}

export function AdminNameFilter({
  value,
  onChange,
  label = "All people",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const { isAdmin: admin, nameOptions } = useAdminAccounts();
  if (!admin || nameOptions.length === 0) return null;
  return <FilterSelect label={label} value={value} onChange={onChange} options={nameOptions} />;
}
