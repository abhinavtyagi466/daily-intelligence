import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, sections } from "@/components/dashboard-shell";
import { localTime, storyDate } from "@/components/research-feed";
import { storyKind, storyReference } from "@/lib/story-schema";
import { getStory } from "@/lib/stories";
import { requireDashboardAccess } from "@/lib/supabase/session";
import { storyTodayLabel } from "@/lib/workspace-date";

export default async function StoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireDashboardAccess();
  const parsed = storyReference.safeParse({ story_id: (await params).id });
  if (!parsed.success) notFound();
  const story = await getStory(client, parsed.data.story_id);
  if (!story) notFound();
  const indexedPaper = story.research_papers;
  const profile = story.ai_profile;
  const submittedPaper = profile?.kind === "paper" ? profile.paper : undefined;
  const doi = indexedPaper?.doi ?? submittedPaper?.doi;
  const authors = indexedPaper?.authors.length ? indexedPaper.authors : submittedPaper?.authors;
  const reviewStatus = indexedPaper && indexedPaper.peer_review_status !== "unknown"
    ? indexedPaper.peer_review_status : submittedPaper?.peer_review_status ?? "unknown";
  const publicationType = indexedPaper?.publication_type ?? submittedPaper?.publication_type;
  const job = profile?.kind === "job" ? profile.job : undefined;
  const docsUrl = profile?.kind === "technology" ? profile.docs_url : undefined;
  const codeUrl = profile?.kind === "paper" ? profile.code_url : undefined;
  const kind = storyKind(story);
  const todayLabel = storyTodayLabel(story.original_published_at, story.first_seen_at);
  const section = sections.find((item) => "kind" in item && item.kind === kind) ?? sections.find((item) => item.id === "stories")!;

  return (
    <DashboardShell selected={section.id}>
      <div className={todayLabel === "Published today" ? "detail-heading today-update" : "detail-heading"}>
        <Link href={section.href}>{section.label}</Link>
        <div className="feed-meta">
          {todayLabel && <span className={todayLabel === "Published today" ? "today-badge" : "muted"}>{todayLabel}</span>}
          {story.story_domains.map(({ domain }) => <span className="domain-tag" key={domain.code}>{domain.name}</span>)}
          <span>Source-reported</span>
        </div>
        <h1>{story.title}</h1>
        <p className="muted">{storyDate(story)}</p>
      </div>
      <section className="panel detail-panel">
        <div className="panel-heading"><h2>Summary</h2>
          <div className="entry-links">
            <a href={story.canonical_url} target="_blank" rel="noreferrer">{kind === "paper" ? "Open paper" : "Open original"}</a>
            {docsUrl && <a href={docsUrl} target="_blank" rel="noreferrer">Documentation</a>}
            {codeUrl && <a href={codeUrl} target="_blank" rel="noreferrer">Source code</a>}
          </div>
        </div>
        <p className="detail-text">{story.summary}</p>
        {(indexedPaper || submittedPaper) && <dl className="paper-details">
          {doi && <div><dt>DOI</dt><dd>{doi}</dd></div>}
          <div><dt>Authors</dt><dd>{authors?.length ? authors.join(", ") : "Unlisted"}</dd></div>
          {submittedPaper?.venue && <div><dt>Venue</dt><dd>{submittedPaper.venue}</dd></div>}
          {publicationType && <div><dt>Publication type</dt><dd>{publicationType}</dd></div>}
          <div><dt>Peer review status</dt><dd>{reviewStatus === "peer_reviewed" ? "Peer reviewed" : reviewStatus === "preprint" ? "Preprint" : reviewStatus}</dd></div>
        </dl>}
      </section>
      {job && (
        <section className="panel detail-panel">
          <div className="panel-heading"><h2>Job requirements</h2>
            {job.status !== "closed" && <a href={job.apply_url} target="_blank" rel="noreferrer">View application</a>}
          </div>
          <div className="entry-information">
            <dl className="entry-facts">
              <div><dt>Company</dt><dd>{job.company}</dd></div>
              {job.location && <div><dt>Location</dt><dd>{job.location}</dd></div>}
              {job.experience && <div><dt>Experience</dt><dd>{job.experience}</dd></div>}
              <div><dt>Listing status</dt><dd>{job.status === "listed" ? "Listed when checked" : job.status === "closed" ? "Closed" : "Check employer site"}</dd></div>
              {job.checked_on && <div><dt>Last checked</dt><dd><time dateTime={job.checked_on}>{job.checked_on}</time></dd></div>}
            </dl>
            <ul className="entry-requirements">{job.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul>
            {!!job.skills.length && <ul className="topic-list" aria-label="Skills">{job.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>}
          </div>
        </section>
      )}
      {(profile?.why_it_matters || profile?.watch_next || (profile?.kind === "paper" && profile.reading_focus)) && (
        <section className="panel detail-panel">
          <div className="panel-heading"><h2>Research notes</h2></div>
          <dl className="entry-information entry-facts">
            {profile.why_it_matters && <div><dt>Why it matters</dt><dd>{profile.why_it_matters}</dd></div>}
            {profile.watch_next && <div><dt>What to watch next</dt><dd>{profile.watch_next}</dd></div>}
            {profile.kind === "paper" && profile.reading_focus && <div><dt>What to read</dt><dd>{profile.reading_focus}</dd></div>}
          </dl>
        </section>
      )}
      <section className="panel detail-panel">
        <div className="panel-heading"><h2>Source records</h2><span className="muted">{story.story_sources.length}</span></div>
        <ul className="feed">
          {story.story_sources.map((source) => (
            <li key={source.id}>
              <div className="feed-meta"><span className="domain-tag">{source.source.name}</span>
                <span>{source.source_role === "citation_metadata" ? "Citation metadata" : "Submitted reference"}</span></div>
              <h3><a href={source.source_url} target="_blank" rel="noreferrer">{source.source_title}</a></h3>
              <p>Recorded {localTime(source.retrieved_at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}
