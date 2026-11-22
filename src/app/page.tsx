import { Activity, BookOpen, ClipboardList, Database, Search } from "lucide-react";
import Link from "next/link";
import { DashboardShell, sections, type View } from "@/components/dashboard-shell";
import { RunResearchButton } from "@/components/dashboard-controls";
import { localTime, RunSummary, StoryFeed } from "@/components/research-feed";
import { Button } from "@/components/ui/button";
import { getDashboardMetrics, listRuns, listSources, listStories } from "@/lib/stories";
import { requireDashboardAccess } from "@/lib/supabase/session";

export const maxDuration = 60;
const pageSize = 12;

const subtitles: Record<View, string> = {
  overview: "Latest developments and source activity across your research workspace.",
  stories: "Search and review stored developments with their source records.",
  papers: "Browse journal articles indexed from Crossref.",
  sources: "Inspect registered research feeds and submitted reference origins.",
  health: "Review the status and record counts of recent ingestion runs.",
};

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client, role } = await requireDashboardAccess();
  const params = await searchParams;
  const section = sections.find(({ id }) => id === params.view) ?? sections[0];
  const view = section.id;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const candidate = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(candidate) ? Math.max(1, Math.min(candidate, 10000)) : 1;

  let body;
  if (view === "overview") {
    const [metrics, feed, runs] = await Promise.all([
      getDashboardMetrics(client), listStories(client, { size: 6 }), listRuns(client, 1),
    ]);
    const metricsList = [
      { label: "Developments", value: metrics.stories, icon: ClipboardList },
      { label: "Research papers", value: metrics.papers, icon: BookOpen },
      { label: "Registered sources", value: metrics.sources, icon: Database },
    ];
    body = (
      <>
        <div className="metric-grid">
          {metricsList.map(({ label, value, icon: Icon }) => (
            <div className="metric" key={label}>
              <div className="metric-label"><span>{label}</span><Icon size={18} /></div>
              <strong>{value.toLocaleString("en-IN")}</strong>
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading"><h2>Latest developments</h2><Link href="/?view=stories">View all</Link></div>
            <StoryFeed stories={feed.stories} />
          </section>
          <section className="panel ingestion-panel">
            <div className="panel-heading"><h2><Activity size={17} /> Ingestion status</h2></div>
            <div className="last-success"><span>Last successful ingestion</span><strong>{metrics.lastSuccessful ? localTime(metrics.lastSuccessful.completed_at) : "Awaiting first run"}</strong></div>
            {runs[0] && <RunSummary run={runs[0]} />}
            <Link href="/?view=health" className="panel-link">Run history</Link>
          </section>
        </div>
      </>
    );
  } else if (view === "stories" || view === "papers") {
    const feed = await listStories(client, { query, page, size: pageSize, papersOnly: view === "papers" });
    const pages = Math.max(1, Math.ceil(feed.count / pageSize));
    const url = (newPage: number) => `/?${new URLSearchParams({ view, ...(query ? { q: query } : {}), page: String(newPage) })}`;
    body = (
      <section className="panel">
        <div className="panel-heading search-heading">
          <form method="get" className="search-form">
            <input type="hidden" name="view" value={view} />
            <label className="search-input"><Search size={17} /><span className="sr-only">Search by title</span>
              <input name="q" type="search" key={query} defaultValue={query} placeholder="Search by title" maxLength={120} />
            </label>
            <Button variant="outline" type="submit">Search</Button>
          </form>
          <span className="muted">{feed.count.toLocaleString("en-IN")} results</span>
        </div>
        <StoryFeed stories={feed.stories} query={query} />
        {(pages > 1 || page > 1) && <nav className="pagination" aria-label="Results pages">
          {page > 1 && <Link href={url(Math.min(page - 1, pages))}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={url(page + 1)}>Next</Link>}
        </nav>}
      </section>
    );
  } else if (view === "sources") {
    const sources = await listSources(client);
    body = (
      <section className="panel">
        <div className="panel-heading"><h2>Registered sources</h2><span className="muted">Up to 100 sources</span></div>
        <ul className="list">
          {sources.map((source) => (
            <li key={source.id}>
              <a href={source.base_url} target="_blank" rel="noreferrer">{source.name}</a>
              <span className="muted">{source.enabled ? "Active feed" : "Submitted reference"}</span>
              {source.enabled && <span className="muted">Last fetched {localTime(source.last_successful_fetch)}</span>}
            </li>
          ))}
        </ul>
      </section>
    );
  } else {
    const runs = await listRuns(client);
    body = (
      <section className="panel">
        <div className="panel-heading"><h2>Recent runs</h2></div>
        {runs.length ? runs.map((run) => <RunSummary key={run.id} run={run} />)
          : <div className="empty"><Activity size={24} /><h3>No runs recorded</h3><p>Run Crossref ingestion from Command Center to get started.</p></div>}
      </section>
    );
  }

  return (
    <DashboardShell selected={view}>
      <div className="page-heading">
        <div><h1>{section.label}</h1><p>{subtitles[view]}</p></div>
        {view === "overview" && role === "operator" && <RunResearchButton />}
      </div>
      {body}
    </DashboardShell>
  );
}
