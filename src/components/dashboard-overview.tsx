import { Activity } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sections } from "./dashboard-shell";
import { PatternDigest } from "./patterns";
import { ReadingQueue } from "./reading-queue";
import { RunSummary, StoryFeed } from "./research-feed";
import { WorkspaceAnalyticsPanel } from "./workspace-analytics";
import type { getAIPatterns } from "@/lib/patterns";
import type { getAIWorkspaceSnapshot, getWorkspaceAnalytics } from "@/lib/research";
import type { listRuns, listStories } from "@/lib/stories";
import { loadWorkspaceOverview } from "@/lib/workspace-overview";

function PanelLoading({ label }: { label: string }) {
  return <div className="panel panel-loading" role="status">{label}</div>;
}

export function DashboardOverview({ client, days }: { client: SupabaseClient; days: number }) {
  const { feed, snapshot, analytics, patterns, runs } = loadWorkspaceOverview(client, days);
  return (
    <div className="panel-stack overview-panels">
      <Suspense fallback={<PanelLoading label="Loading workspace totals…" />}>
        <OverviewMetrics data={snapshot} />
      </Suspense>
      <Suspense fallback={<PanelLoading label="Loading AI briefing…" />}>
        <OverviewBriefing data={patterns} days={days} />
      </Suspense>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><h2>Latest updates</h2><Link href="/?view=stories">View all</Link></div>
          <Suspense fallback={<p className="panel-note" role="status">Loading updates…</p>}>
            <OverviewFeed data={feed} />
          </Suspense>
        </section>
        <div className="panel-stack">
          <Suspense fallback={<PanelLoading label="Loading reading priorities…" />}>
            <OverviewReading data={feed} />
          </Suspense>
          <Suspense fallback={<PanelLoading label="Loading ingestion status…" />}>
            <OverviewRuns data={runs} />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<PanelLoading label="Loading activity chart…" />}>
        <OverviewAnalytics data={analytics} snapshot={snapshot} days={days} />
      </Suspense>
    </div>
  );
}

async function OverviewMetrics({ data }: { data: ReturnType<typeof getAIWorkspaceSnapshot> }) {
  const snapshot = await data;
  return (
    <div className="metric-grid ai-metric-grid">
      {sections.filter((section) => "kind" in section).map(({ label, href, kind, icon: Icon }) => (
        <Link className="metric metric-link" href={href} key={kind}>
          <div className="metric-label"><span>{label}</span><Icon size={18} /></div>
          <strong>{snapshot ? (snapshot.counts[kind] ?? 0).toLocaleString("en-IN") : <span className="muted">Browse</span>}</strong>
        </Link>
      ))}
    </div>
  );
}

async function OverviewBriefing({ data, days }: { data: ReturnType<typeof getAIPatterns>; days: number }) {
  return <PatternDigest report={await data} days={days} />;
}

async function OverviewFeed({ data }: { data: ReturnType<typeof listStories> }) {
  return <StoryFeed stories={(await data).stories.slice(0, 6)} />;
}

async function OverviewReading({ data }: { data: ReturnType<typeof listStories> }) {
  return <ReadingQueue stories={(await data).stories} />;
}

async function OverviewRuns({ data }: { data: ReturnType<typeof listRuns> }) {
  const [run] = await data;
  return (
    <section className="panel ingestion-panel">
      <div className="panel-heading"><h2><Activity size={17} /> Ingestion status</h2></div>
      {run ? <RunSummary run={run} /> : <div className="last-success"><span>Awaiting first run</span></div>}
      <Link href="/?view=health" className="panel-link">Run history</Link>
    </section>
  );
}

async function OverviewAnalytics({ data, snapshot, days }: {
  data: ReturnType<typeof getWorkspaceAnalytics>;
  snapshot: ReturnType<typeof getAIWorkspaceSnapshot>;
  days: number;
}) {
  const [analytics, workspace] = await Promise.all([data, snapshot]);
  return <WorkspaceAnalyticsPanel analytics={analytics} skills={workspace?.skills ?? []} days={days} />;
}
