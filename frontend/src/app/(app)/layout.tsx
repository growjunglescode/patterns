import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ops">
      <AppShell>{children}</AppShell>
    </div>
  );
}
