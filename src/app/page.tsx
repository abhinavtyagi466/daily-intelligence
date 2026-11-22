import { Activity, Search } from "lucide-react";
import Link from "next/link";
import { DashboardShell, sections, type View } from "@/components/dashboard-shell";
import { RunResearchButton } from "@/components/dashboard-controls";
import { MarketResearchPanel } from "@/components/market-research";
import { PatternDigest, PatternExplorer } from "@/components/patterns";
import { ReadingQueue } from "@/components/reading-queue";
import { localTime, RunSummary, StoryFeed } from "@/components/research-feed";
import { Button } from "@/components/ui/button";
import { WorkspaceAnalyticsPanel } from "@/components/workspace-analytics";
import { getAIPatterns } from "@/lib/patterns";
import { getAIWorkspaceSnapshot, getWorkspaceAnalytics, listMarketResearch } from "@/lib/research";
import { listRuns, listSources, listStories } from "@/lib/stories";
import { requireDashboardAccess } from "@/lib/supabase/session";

export const maxDuration = 60;
const pageSize = 12;

const subtitles: Record<View, string> = {
  overview: "Track emerging AI trends, technology releases, job openings and new research.",
  trends: "Follow emerging AI topics, the evidence behind them, and what to watch next.",
  patterns: "Compare recurring topics across saved AI news, trends, technology releases and papers.",
  technologies: "Find new models, frameworks, tools and releases with their documentation.",
  jobs: "Compare role requirements, skills and locations. Open the original listing to check availability and apply.",
  stories: "Search all saved updates and open their original sources.",
  papers: "Browse indexed papers and submitted preprints, with links to the paper and code when available.",
  research: "Revisit saved research methodologies and their measurements.",
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
    const selectedRange = params.range === "7" ? 7 : params.range === "30" ? 30 : 14;
    const [feed, runs, analytics, snapshot, patterns] = await Promise.all([
      listStories(client, { size: 24 }), listRuns(client, 1),
      getWorkspaceAnalytics(client, selectedRange), getAIWorkspaceSnapshot(client, selectedRange),
      getAIPatterns(client, selectedRange),
    ]);
    body = (
      <>
        <div className="metric-grid ai-metric-grid">
          {sections.filter((item) => "kind" in item).map(({ label, href, kind, icon: Icon }) => (
            <Link className="metric metric-link" href={href} key={kind}>
              <div className="metric-label"><span>{label}</span><Icon size={18} /></div>
              <strong>{snapshot ? (snapshot.counts[kind] ?? 0).toLocaleString("en-IN") : <span className="muted">Browse</span>}</strong>
            </Link>
          ))}
        </div>
        <PatternDigest report={patterns} days={selectedRange} />
        <WorkspaceAnalyticsPanel analytics={analytics} skills={snapshot?.skills ?? []} days={selectedRange} />
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading"><h2>Latest saved updates</h2><Link href="/?view=stories">View all</Link></div>
            <StoryFeed stories={feed.stories.slice(0, 6)} />
          </section>
          <div className="panel-stack">
            <ReadingQueue stories={feed.stories} />
            <section className="panel ingestion-panel">
              <div className="panel-heading"><h2><Activity size={17} /> Ingestion status</h2></div>
              {!runs[0] && <div className="last-success"><span>Awaiting first run</span></div>}
              {runs[0] && <RunSummary run={runs[0]} />}
              <Link href="/?view=health" className="panel-link">Run history</Link>
            </section>
          </div>
        </div>
      </>
    );
  } else if (view === "patterns") {
    const days = params.range === "14" ? 14 : params.range === "30" ? 30 : 7;
    body = <PatternExplorer report={await getAIPatterns(client, days)} days={days} />;
  } else if (view === "research") {
    body = <MarketResearchPanel notes={await listMarketResearch(client, 20)} />;
  } else if (view === "stories" || "kind" in section) {
    const kind = "kind" in section ? section.kind : undefined;
    const feed = await listStories(client, { query, page, size: pageSize, kind });
    const pages = Math.max(1, Math.ceil(feed.count / pageSize));
    const url = (newPage: number) => `/?${new URLSearchParams({ view, ...(query ? { q: query } : {}), page: String(newPage) })}`;
    body = (
      <section className="panel">
        <div className="panel-heading search-heading">
          <form method="get" className="search-form">
            <input type="hidden" name="view" value={view} />
            <label className="search-input"><Search size={17} /><span className="sr-only">Search {section.label}</span>
              <input name="q" type="search" key={query} defaultValue={query} placeholder={kind === "job" ? "Search role, company, location or skill" : "Search keywords"} maxLength={120} />
            </label>
            <Button variant="outline" type="submit">Search</Button>
          </form>
          <span className="muted">{feed.count.toLocaleString("en-IN")} results</span>
        </div>
        {feed.setupRequired
          ? <p className="panel-note">Apply the AI tracker migration to enable this category.</p>
          : <StoryFeed stories={feed.stories} query={query} kind={kind} />}
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
        <Link href="/?view=research" className="panel-link">Saved methodologies</Link>
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
