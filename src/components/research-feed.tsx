import { CircleDot, FileText, Search } from "lucide-react";
import Link from "next/link";
import type { IngestionRun, Story } from "@/lib/story-schema";

const indianTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const indianDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
});

export function localTime(value: string | null) {
  return value ? `${indianTime.format(new Date(value))} IST` : "—";
}

export function storyDate(story: Story) {
  if (!story.original_published_at) return `Added ${localTime(story.first_seen_at)}`;
  const published = story.research_papers
    ? indianDate.format(new Date(story.original_published_at))
    : localTime(story.original_published_at);
  return `Published ${published}`;
}

export function RunStatus({ status }: { status: IngestionRun["execution_status"] }) {
  const labels = { running: "Running", completed: "Completed", partial: "Completed with errors", failed: "Failed" };
  return <span className={`status status-${status}`}><CircleDot size={12} />{labels[status]}</span>;
}

export function StoryFeed({ stories, query }: { stories: Story[]; query?: string }) {
  if (!stories.length) return (
    <div className="empty">
      {query ? <Search size={24} /> : <FileText size={24} />}
      <h3>{query ? "No matching developments" : "No developments yet"}</h3>
      <p>{query ? "Try a different title search." : "Ingest research from Crossref or add a sourced story through MCP."}</p>
    </div>
  );
  return (
    <ul className="feed">
      {stories.map((story) => (
        <li key={story.id}>
          <div className="feed-meta">
            <span className="domain-tag">{story.domain.name}</span>
            <span>{story.research_papers ? "Journal article" : "Development"}</span>
          </div>
          <h3><Link href={`/stories/${story.id}`}>{story.title}</Link></h3>
          <p>{story.summary}</p>
          <div className="feed-bottom">
            <span>{story.story_sources.length} {story.story_sources.length === 1 ? "source record" : "source records"}</span>
            <span>{storyDate(story)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RunSummary({ run }: { run: IngestionRun }) {
  return (
    <div className="run-summary">
      <div className="run-heading"><strong>{run.source.name}</strong><RunStatus status={run.execution_status} /></div>
      <p className="muted">Started {localTime(run.started_at)}</p>
      <dl className="run-counts">
        <div><dt>Collected</dt><dd>{run.records_collected}</dd></div>
        <div><dt>New stories</dt><dd>{run.records_created}</dd></div>
        <div><dt>Rejected</dt><dd>{run.records_rejected}</dd></div>
      </dl>
      {run.errors.length > 0 && <ul className="run-errors">{run.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
    </div>
  );
}
