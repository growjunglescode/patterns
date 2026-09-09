export type AccountRole = "admin" | "scientist" | "citizen" | "viewer";

export function canonicalRole(role: string | null | undefined): AccountRole {
  if (role === "admin") return "admin";
  if (role === "scientist" || role === "researcher") return "scientist";
  if (role === "viewer") return "viewer";
  return "citizen";
}

export function roleLabel(role: string | null | undefined) {
  return {
    admin: "Admin",
    scientist: "Scientist",
    citizen: "Citizen scientist",
    viewer: "Viewer",
  }[canonicalRole(role)];
}

export function isAdmin(role: string | null | undefined) {
  return canonicalRole(role) === "admin";
}

export function isScientist(role: string | null | undefined) {
  const r = canonicalRole(role);
  return r === "admin" || r === "scientist";
}

export function canName(role: string | null | undefined, verified?: boolean) {
  if (canonicalRole(role) === "admin") return true;
  return canonicalRole(role) === "scientist" && Boolean(verified);
}

export const ROLE_OPTIONS: AccountRole[] = ["admin", "scientist", "citizen", "viewer"];

export const PERMISSIONS: { key: string; label: string; note?: string; roles: Record<AccountRole, boolean> }[] = [
  { key: "browse", label: "Browse the catalog and map", roles: { admin: true, scientist: true, citizen: true, viewer: true } },
  { key: "upload", label: "Upload camera-trap photos", roles: { admin: true, scientist: true, citizen: true, viewer: false } },
  { key: "name", label: "Propose names and confirm identity", note: "Scientists must be verified", roles: { admin: true, scientist: true, citizen: false, viewer: false } },
  { key: "science", label: "Institution tools (data, analytics, stations)", roles: { admin: true, scientist: true, citizen: false, viewer: false } },
  { key: "approve", label: "Approve or reject names", roles: { admin: true, scientist: false, citizen: false, viewer: false } },
  { key: "accounts", label: "Manage accounts and roles", roles: { admin: true, scientist: false, citizen: false, viewer: false } },
  { key: "control", label: "Open the control room (system-wide admin)", roles: { admin: true, scientist: false, citizen: false, viewer: false } },
  { key: "share_self", label: "Share a public researcher profile", roles: { admin: true, scientist: true, citizen: true, viewer: true } },
  { key: "share_individual", label: "Share individual profiles publicly", roles: { admin: true, scientist: true, citizen: false, viewer: false } },
];


export type NavItem = { href: string; label: string; icon: string };

/** Sidebar groups. Portfolio only appears when the workspace has 2+ projects. */
export function navFor(role: string | null | undefined, opts?: { projectCount?: number }) {
  const catalog: NavItem[] = [
    { href: "/overview", label: "Home", icon: "home" },
    { href: "/observations", label: "Photos", icon: "photo" },
    { href: "/individuals", label: "Individuals", icon: "cat" },
    { href: "/map", label: "Map", icon: "map" },
  ];

  const collect: NavItem[] = [];
  if (canonicalRole(role) !== "viewer") {
    collect.push({ href: "/upload", label: "Upload", icon: "up" });
  }
  if (isScientist(role)) {
    collect.push({ href: "/review", label: "Review", icon: "review" });
  }

  const science: NavItem[] = isScientist(role)
    ? [
        { href: "/dashboard", label: "Dashboard", icon: "chart" },
        { href: "/model", label: "Model report", icon: "model" },
        { href: "/data", label: "Research data", icon: "table" },
        { href: "/queues", label: "Name queue", icon: "queue" },
        ...((opts?.projectCount ?? 0) >= 2
          ? [{ href: "/portfolio", label: "Portfolio", icon: "grid" }]
          : []),
      ]
    : [];

  const admin: NavItem[] = isAdmin(role) ? [{ href: "/admin", label: "Control", icon: "shield" }] : [];

  return { catalog, collect, science, admin };
}
