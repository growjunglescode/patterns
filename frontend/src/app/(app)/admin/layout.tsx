"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const LINKS = [
  { href: "/admin", label: "Command", match: (p: string) => p === "/admin" },
  { href: "/admin/people", label: "People", match: (p: string) => p.startsWith("/admin/people") },
  { href: "/admin/estate", label: "Field estate", match: (p: string) => p.startsWith("/admin/estate") },
  { href: "/admin/catalog", label: "Catalog", match: (p: string) => p.startsWith("/admin/catalog") },
  { href: "/admin/species", label: "Species", match: (p: string) => p.startsWith("/admin/species") },
  { href: "/admin/recognition", label: "Recognition", match: (p: string) => p.startsWith("/admin/recognition") },
  { href: "/admin/audit", label: "Audit trail", match: (p: string) => p.startsWith("/admin/audit") },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setUser(me);
        if (!isAdmin(me.role)) {
          setDenied(true);
          router.replace("/overview");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (denied) return <p className="text-[var(--muted)]">Admin access only.</p>;
  if (!user) return <p className="text-[var(--muted)]">Checking credentials…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="page-kicker">Control room</p>
          <h1 className="page-title mt-1">System administration</h1>
          <p className="lede">
            Cross-project view of people, catalog, cameras, recognition, and the audit trail. Changes here are
            logged.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Signed in as {user.display_name} · Admin
        </p>
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-semibold ${
              item.match(pathname)
                ? "bg-[#c4a35a] text-[#070a09]"
                : "text-[var(--muted)] hover:bg-[#101614] hover:text-[var(--ink)]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
