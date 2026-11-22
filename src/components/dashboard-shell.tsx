import { Activity, BookOpen, ChartNoAxesCombined, ClipboardList, Database, LayoutDashboard, LogOut, Radar } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { ThemeToggle } from "./dashboard-controls";
import { Button } from "./ui/button";

export const sections = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard, href: "/" },
  { id: "stories", label: "Story Explorer", icon: ClipboardList, href: "/?view=stories" },
  { id: "papers", label: "Research Library", icon: BookOpen, href: "/?view=papers" },
  { id: "research", label: "Market Research", icon: ChartNoAxesCombined, href: "/?view=research" },
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
          {sections.map(({ id, label, href, icon: Icon }) => (
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
