"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { CoatPrint, Grain, Wordmark } from "@/components/Brand";
import { api, type User } from "@/lib/api";
import { readProjectId, writeProjectId } from "@/lib/project";
import { navFor, roleLabel, type NavItem } from "@/lib/roles";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projectCount, setProjectCount] = useState(0);
  const [projects, setProjects] = useState<
    { id: string; name: string; organization_name?: string | null; organization_id?: string | null; active?: boolean }[]
  >([]);
  const [projectId, setProjectId] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (!me.onboarding_complete) {
          router.push("/onboarding");
          return;
        }
        setUser(me);
        if (me.home_project_id) {
          const saved = readProjectId();
          if (!saved) writeProjectId(me.home_project_id);
        }
        const role = me.role;
        if (role === "admin" || role === "scientist" || role === "researcher") {
          api
            .portfolio()
            .then((p) => {
              const all = p?.projects || [];
              const list =
                role === "admin" ? all : all.filter((row: { active?: boolean }) => row.active !== false);
              setProjects(list);
              setProjectCount(p?.totals?.projects ?? list.length);
              const saved = readProjectId();
              const preferred = me.home_project_id || "";
              const next = list.some((row: { id: string }) => row.id === saved)
                ? saved
                : list.some((row: { id: string }) => row.id === preferred)
                  ? preferred
                  : list[0]?.id || "";
              if (next && next !== saved) writeProjectId(next);
              setProjectId(next);
            })
            .catch(() => setProjectCount(0));
        } else {
          api
            .overview()
            .then((o) => {
              if (o?.project_id) {
                setProjects([{ id: o.project_id, name: o.project_name, organization_name: o.organization_name }]);
                writeProjectId(o.project_id);
                setProjectId(o.project_id);
              } else if (me.home_project_id) {
                setProjects([{ id: me.home_project_id, name: "My field catalog" }]);
                writeProjectId(me.home_project_id);
                setProjectId(me.home_project_id);
              }
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!["/login", "/register", "/", "/onboarding"].includes(pathname)) router.push("/login");
      });
  }, [pathname, router]);

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      setMenuOpen(false);
      router.push(`/individuals?q=${encodeURIComponent(q.trim())}`);
    }
  }

  const initials = (user?.display_name || "AR")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const nav = navFor(user?.role, { projectCount });

  const orgs = Array.from(
    new Map(
      projects
        .filter((p) => p.organization_name)
        .map((p) => [p.organization_id || p.organization_name, p.organization_name]),
    ).entries(),
  ) as [string, string][];
  const visibleProjects = orgFilter
    ? projects.filter((p) => (p.organization_id || p.organization_name) === orgFilter)
    : projects;
  const current = visibleProjects.find((p) => p.id === projectId) || projects.find((p) => p.id === projectId);
  const projectLabel = current
    ? current.organization_name
      ? `${current.organization_name} · ${current.name}`
      : current.name
    : "Patterns";

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(18.5rem,88vw)] shrink-0 flex-col overflow-hidden bg-[#070a09] text-[#e6ede8] transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:w-[15.75rem] lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <CoatPrint tone="dark" strength="strong" />
        <Grain />
        <div className="relative shrink-0 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/overview" onClick={() => setMenuOpen(false)}>
              <Wordmark light />
            </Link>
            <button
              type="button"
              className="rounded-md border border-[#2a3832] px-2.5 py-1.5 text-[12px] text-[#8a9a92] lg:hidden"
              onClick={() => setMenuOpen(false)}
            >
              Close
            </button>
          </div>
          <form onSubmit={search} className="mt-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search names or IDs"
              className="!rounded-md !border !border-[#2a3832] !bg-[#0c1210] !px-3 !py-2.5 !text-[13px] !text-[#e6ede8] placeholder:!text-[#8a9a92]"
            />
          </form>
        </div>
        <nav className="relative min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 pb-4 text-[13px]">
          <NavGroup items={nav.catalog} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          {nav.collect.length > 0 && (
            <NavGroup title="Collect" items={nav.collect} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          )}
          {nav.science.length > 0 && (
            <NavGroup title="Institution" items={nav.science} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          )}
          {nav.admin.length > 0 && (
            <NavGroup title="Control" items={nav.admin} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          )}
        </nav>
        <div className="relative shrink-0 border-t border-[#2a3832] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className={`flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition ${
              pathname.startsWith("/settings")
                ? "bg-white/[0.08] font-semibold text-white shadow-[inset_2px_0_0_#c4a35a]"
                : "text-white/68 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <NavGlyph name="gear" />
            Settings
          </Link>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="mt-0.5 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.05]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#c4a35a] text-[11px] font-semibold text-[#070a09]">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">{user?.display_name || "Guest"}</p>
              <p className="text-[11px] text-white/45">{roleLabel(user?.role)}</p>
            </div>
          </Link>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2a3832] bg-[#101614] px-3 py-2 sm:gap-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#2a3832] text-[#e6ede8] lg:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            {orgs.length > 1 && (
              <select
                value={orgFilter}
                onChange={(e) => {
                  const nextOrg = e.target.value;
                  setOrgFilter(nextOrg);
                  const scoped = nextOrg
                    ? projects.filter((p) => (p.organization_id || p.organization_name) === nextOrg)
                    : projects;
                  if (scoped.length && !scoped.some((p) => p.id === projectId)) {
                    writeProjectId(scoped[0].id);
                    setProjectId(scoped[0].id);
                  }
                }}
                className="max-w-[7.5rem] shrink-0 !rounded-md !border !border-[#2a3832] !bg-[#0c1210] !px-2 !py-1.5 text-[10px] uppercase tracking-[0.08em] text-[#8a9a92] sm:max-w-[12rem] sm:text-[11px]"
              >
                <option value="">All orgs</option>
                {orgs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {visibleProjects.length > 1 ? (
              <select
                value={projectId}
                onChange={(e) => {
                  writeProjectId(e.target.value);
                  setProjectId(e.target.value);
                }}
                className="min-w-0 max-w-full flex-1 !rounded-md !border-0 !bg-transparent !px-0 !py-0 text-[11px] uppercase tracking-[0.1em] text-[#8a9a92] sm:text-[12.5px] sm:tracking-[0.12em]"
              >
                {visibleProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.organization_name ? `${p.organization_name} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="truncate text-[11px] uppercase tracking-[0.1em] text-[#8a9a92] sm:text-[12.5px] sm:tracking-[0.12em]">
                {projectLabel}
              </p>
            )}
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            {nav.collect.length > 0 && (
              <Link href="/upload" className="btn-gold !min-h-10 !px-3 !py-2 sm:!px-4">
                <span className="sm:hidden">Upload</span>
                <span className="hidden sm:inline">Upload</span>
              </Link>
            )}
            <span className="hidden rounded-md border border-[#2a3832] bg-[#18211d] px-3 py-1 text-[11px] font-semibold text-[#e6ede8] sm:inline">
              {roleLabel(user?.role)}
            </span>
          </div>
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#070a09] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-6 lg:px-7 lg:py-7">
          <div className="relative mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      {title && (
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/32">{title}</p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={pathname.startsWith(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 transition ${
        active
          ? "bg-white/[0.08] font-semibold text-white shadow-[inset_2px_0_0_#c4a35a]"
          : "text-white/68 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <NavGlyph name={icon} />
      {label}
    </Link>
  );
}

function NavGlyph({ name }: { name: string }) {
  const common = "h-[15px] w-[15px] shrink-0 opacity-80";
  if (name === "home")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  if (name === "photo")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <circle cx="9" cy="12" r="2" />
        <path d="m14 17 3-4 4 4" />
      </svg>
    );
  if (name === "cat")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="13" r="6" />
        <path d="M7 8 5 4l5 2M17 8l2-4-5 2" />
      </svg>
    );
  if (name === "map")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="m9 4 6 2 5-2v16l-5 2-6-2-5 2V6z" />
      </svg>
    );
  if (name === "up")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 16V5M7 10l5-5 5 5M5 19h14" />
      </svg>
    );
  if (name === "review")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  if (name === "chart")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" />
      </svg>
    );
  if (name === "table")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
      </svg>
    );
  if (name === "queue")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  if (name === "model")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
      </svg>
    );
  if (name === "grid")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === "people")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M21 19c0-2.4-1.6-4.2-4-4.8" />
      </svg>
    );
  if (name === "gear")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    );
  if (name === "shield")
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3 5 6v6c0 5 3.4 8.4 7 9 3.6-.6 7-4 7-9V6z" />
        <path d="M9 12.2 11 14l4-4.5" />
      </svg>
    );
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
