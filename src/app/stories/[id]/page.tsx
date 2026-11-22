import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { localTime, storyDate } from "@/components/research-feed";
import { storyReference } from "@/lib/story-schema";
import { getStory } from "@/lib/stories";
import { requireDashboardAccess } from "@/lib/supabase/session";

export default async function StoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireDashboardAccess();
  const parsed = storyReference.safeParse({ story_id: (await params).id });
  if (!parsed.success) notFound();
  const story = await getStory(client, parsed.data.story_id);
  if (!story) notFound();
  const paper = story.research_papers;

  return (
    <DashboardShell selected={paper ? "papers" : "stories"}>
      <div className="detail-heading">
        <Link href={paper ? "/?view=papers" : "/?view=stories"}>{paper ? "Research Library" : "Story Explorer"}</Link>
        <div className="feed-meta">
          {story.story_domains.map(({ domain }) => <span className="domain-tag" key={domain.code}>{domain.name}</span>)}
          <span>Source-reported</span>
        </div>
        <h1>{story.title}</h1>
        <p className="muted">{storyDate(story)}</p>
      </div>
      <section className="panel detail-panel">
        <div className="panel-heading"><h2>Summary</h2><a href={story.canonical_url} target="_blank" rel="noreferrer">Open original</a></div>
        <p className="detail-text">{story.summary}</p>
        {paper && <dl className="paper-details">
          <div><dt>DOI</dt><dd>{paper.doi}</dd></div>
          <div><dt>Authors</dt><dd>{paper.authors.length ? paper.authors.join(", ") : "Unlisted"}</dd></div>
          <div><dt>Peer review status</dt><dd>{paper.peer_review_status}</dd></div>
        </dl>}
      </section>
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
