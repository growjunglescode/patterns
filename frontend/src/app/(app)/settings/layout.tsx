"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { isAdmin, isScientist } from "@/lib/roles";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    api.me().then(setUser).catch(() => undefined);
  }, []);

  const links = [
    { href: "/settings", label: "Profile", match: (p: string) => p === "/settings" },
    { href: "/settings/sharing", label: "Sharing", match: (p: string) => p.startsWith("/settings/sharing") },
    ...(isScientist(user?.role)
      ? [{ href: "/portfolio", label: "Projects", match: (p: string) => p.startsWith("/portfolio") }]
      : []),
    ...(isAdmin(user?.role)
      ? [
          { href: "/admin", label: "Control room", match: (p: string) => p.startsWith("/admin") },
          { href: "/settings/permissions", label: "Permissions", match: (p: string) => p.startsWith("/settings/permissions") },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="page-kicker">Workspace</p>
        <h1 className="page-title mt-1">Settings</h1>
        <p className="lede">Your profile, sharing, and workspace access.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${
              item.match(pathname) ? "bg-forest text-canvas" : "bg-paper text-ink/70 shadow-card"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
