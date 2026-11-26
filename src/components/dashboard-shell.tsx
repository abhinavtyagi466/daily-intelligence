import { Activity, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Cpu, Database, LayoutDashboard, LogOut, Radar, TrendingUp } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { MobileWorkspaceMenu, ThemeToggle } from "./dashboard-controls";
import { Button } from "./ui/button";

export const sections = [
  { id: "overview", label: "Command Center", mobileLabel: "Home", icon: LayoutDashboard, href: "/" },
  { id: "trends", label: "AI Trends", mobileLabel: "Trends", icon: TrendingUp, href: "/?view=trends", kind: "trend" },
  { id: "patterns", label: "Patterns", mobileLabel: "Patterns", icon: ChartNoAxesCombined, href: "/?view=patterns" },
  { id: "technologies", label: "New Technologies", icon: Cpu, href: "/?view=technologies", kind: "technology" },
  { id: "jobs", label: "AI Jobs", icon: BriefcaseBusiness, href: "/?view=jobs", kind: "job" },
  { id: "papers", label: "Research Papers", mobileLabel: "Papers", icon: BookOpen, href: "/?view=papers", kind: "paper" },
  { id: "stories", label: "All Updates", icon: ClipboardList, href: "/?view=stories" },
  { id: "research", label: "Saved Methodologies", icon: ChartNoAxesCombined, href: "/?view=research", archive: true },
  { id: "sources", label: "Source Explorer", icon: Database, href: "/?view=sources" },
  { id: "health", label: "System Health", icon: Activity, href: "/?view=health" },
] as const;

export type View = (typeof sections)[number]["id"];

const workspaceSections = sections.filter((section) => !("archive" in section));
const mobileTabs = workspaceSections.filter((section) => "mobileLabel" in section);
const mobileMenuSections = workspaceSections.filter((section) => !("mobileLabel" in section));

function Brand({ className }: { className: string }) {
  return <Link href="/" className={`brand ${className}`}><span className="brand-mark"><Radar size={20} /></span><span>Intelligence OS</span></Link>;
}

export function DashboardShell({ selected, children }: { selected: View; children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand className="sidebar-brand" />
        <nav className="nav" aria-label="Workspace">
          {workspaceSections.map(({ id, label, href, icon: Icon }) => (
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
          <span className="topbar-page">{sections.find(({ id }) => id === selected)?.label}</span>
          <Brand className="mobile-brand" />
          <div className="topbar-actions"><span className="time-zone">Asia/Kolkata</span><ThemeToggle /></div>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Workspace">
        {mobileTabs.map(({ id, mobileLabel, label, href, icon: Icon }) => (
          <Link key={id} href={href} className="mobile-tab" aria-label={label} aria-current={id === selected ? "page" : undefined}>
            <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            <span>{mobileLabel}</span>
          </Link>
        ))}
        <MobileWorkspaceMenu active={mobileMenuSections.some(({ id }) => id === selected)}>
          <ul className="mobile-menu-links">
            {mobileMenuSections.map(({ id, label, href, icon: Icon }) => (
              <li key={id}>
                <Link href={href} aria-current={id === selected ? "page" : undefined}>
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" /> {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mobile-menu-actions">
            <ThemeToggle showLabel />
            <form action={signOut}>
              <Button variant="ghost" type="submit"><LogOut size={18} aria-hidden="true" /> Sign out</Button>
            </form>
          </div>
        </MobileWorkspaceMenu>
      </nav>
    </div>
  );
}
