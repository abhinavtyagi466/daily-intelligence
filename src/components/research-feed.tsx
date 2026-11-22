import { CircleDot, FileText, Search } from "lucide-react";
import Link from "next/link";
import { storyKind, type AIKind, type IngestionRun, type Story } from "@/lib/story-schema";

const kindLabels = { trend: "AI trend", technology: "Technology", job: "Job", paper: "Research paper", development: "Development" };

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

export function StoryFeed({ stories, query, kind }: { stories: Story[]; query?: string; kind?: AIKind }) {
  if (!stories.length) return (
    <div className="empty">
      {query ? <Search size={24} /> : <FileText size={24} />}
      <h3>{query ? "No matching updates" : kind ? `No ${kindLabels[kind].toLowerCase()} entries yet` : "No updates yet"}</h3>
      <p>{query ? "Try another keyword." : "Add a sourced update through Intelligence Tool."}</p>
    </div>
  );
  return (
    <ul className="feed">
      {stories.map((story) => {
        const profile = story.ai_profile;
        const job = profile?.kind === "job" ? profile.job : undefined;
        return (
        <li key={story.id}>
          <div className="feed-meta">
            <span className="domain-tag">{story.domain.name}</span>
            <span>{kindLabels[storyKind(story)]}</span>
          </div>
          <h3><Link href={`/stories/${story.id}`}>{story.title}</Link></h3>
          {job && <div className="feed-meta job-meta"><strong>{job.company}</strong><span>{job.location}</span><span>{job.experience}</span></div>}
          <p>{story.summary}</p>
          {(job ? job.skills : profile?.topics)?.length ? (
            <ul className="topic-list">{(job?.skills ?? profile?.topics ?? []).slice(0, 6).map((keyword) => <li key={keyword}>{keyword}</li>)}</ul>
          ) : null}
          <div className="feed-bottom">
            <span>{story.story_sources.length} {story.story_sources.length === 1 ? "source record" : "source records"}</span>
            <span>{storyDate(story)}</span>
            {job?.status !== "closed" && <a href={job?.apply_url ?? story.canonical_url} target="_blank" rel="noreferrer">{job ? "View listing" : "Open original"}</a>}
          </div>
        </li>
        );
      })}
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
