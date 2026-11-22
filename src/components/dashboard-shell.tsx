import { Activity, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Cpu, Database, LayoutDashboard, LogOut, Radar, TrendingUp } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { ThemeToggle } from "./dashboard-controls";
import { Button } from "./ui/button";

export const sections = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard, href: "/" },
  { id: "trends", label: "AI Trends", icon: TrendingUp, href: "/?view=trends", kind: "trend" },
  { id: "patterns", label: "Patterns", icon: ChartNoAxesCombined, href: "/?view=patterns" },
  { id: "technologies", label: "New Technologies", icon: Cpu, href: "/?view=technologies", kind: "technology" },
  { id: "jobs", label: "AI Jobs", icon: BriefcaseBusiness, href: "/?view=jobs", kind: "job" },
  { id: "papers", label: "Research Papers", icon: BookOpen, href: "/?view=papers", kind: "paper" },
  { id: "stories", label: "All Updates", icon: ClipboardList, href: "/?view=stories" },
  { id: "research", label: "Saved Methodologies", icon: ChartNoAxesCombined, href: "/?view=research", archive: true },
  { id: "sources", label: "Source Explorer", icon: Database, href: "/?view=sources" },
  { id: "health", label: "System Health", icon: Activity, href: "/?view=health" },
] as const;

export type View = (typeof sections)[number]["id"];

export function DashboardShell({ selected, children }: { selected: View; children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand sidebar-brand"><span className="brand-mark"><Radar size={20} /></span><span>Intelligence OS</span></Link>
        <nav className="nav" aria-label="Workspace">
          {sections.filter((section) => !("archive" in section)).map(({ id, label, href, icon: Icon }) => (
            <Link key={id} href={href} aria-current={id === selected ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.7} /> {label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="sign-out">
          <Button variant="ghost" type="submit"><LogOut size={17} /> Sign out</Button>
        </form>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{sections.find(({ id }) => id === selected)?.label}</span>
          <div className="topbar-actions"><span className="time-zone">Asia/Kolkata</span><ThemeToggle /></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
