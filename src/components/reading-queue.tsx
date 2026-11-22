import Link from "next/link";
import type { Story } from "@/lib/story-schema";

function classify(story: Story) {
  const hosts = new Set(story.story_sources.map(({ source_url }) => new URL(source_url).hostname.replace(/^www\./, "")));
  const canonicalHost = new URL(story.canonical_url).hostname.replace(/^www\./, "");
  const hasHost = (match: (host: string) => boolean) => [...hosts, canonicalHost].some(match);

  if (hasHost((host) => host === "arxiv.org" || host.endsWith(".arxiv.org"))) {
    return { priority: 2, label: "Assess the paper", reason: "An arXiv link is available. Check the evaluation and look for a reviewed version or replication." };
  }
  if ([...hosts].some((host) => /\.(gov|gov\.in)$/.test(host) || host === "investor.nvidia.com" || host === "nvidianews.nvidia.com")) {
    return { priority: 0, label: "Read first", reason: "A government or investor-relations source is linked. Read its exact scope, dates, and numbers." };
  }
  if (hosts.size >= 2) {
    return { priority: 1, label: "Cross-check", reason: "Links span multiple sites. Compare the underlying evidence and check for a shared original source." };
  }
  if (story.story_sources.length && story.story_sources.every(({ source_role }) => source_role === "citation_metadata")) {
    return { priority: 4, label: "Skim for relevance", reason: "Registry metadata is available. Start with the publisher abstract before committing time." };
  }
  return { priority: 3, label: "Find corroboration", reason: "Find an original document or an independent source before relying on the claim." };
}

export function ReadingQueue({ stories }: { stories: Story[] }) {
  const ranked = stories.map((story) => ({ story, ...classify(story) })).sort((a, b) => a.priority - b.priority);
  const selected = ranked.filter(({ priority }, index) => index === 0 || ranked[index - 1].priority !== priority);

  return (
    <section className="panel" aria-labelledby="reading-title">
      <div className="panel-heading"><h2 id="reading-title">Reading priorities</h2></div>
      <p className="queue-intro muted">Suggestions from source links on recent stories.</p>
      {selected.length ? (
        <ul className="reading-list">{selected.map(({ story, label, reason, priority }) => (
          <li key={story.id}>
            <span className={priority === 0 ? "queue-priority queue-first" : "queue-priority"}>{label}</span>
            <Link href={`/stories/${story.id}`}>{story.title}</Link>
            <p>{reason}</p>
          </li>
        ))}</ul>
      ) : <p className="panel-note">Suggestions appear when you save sourced developments.</p>}
    </section>
  );
}
