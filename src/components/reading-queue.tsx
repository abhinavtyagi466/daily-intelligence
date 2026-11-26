import Link from "next/link";
import { getReadingPriorities } from "@/lib/reading-priorities";
import type { Story } from "@/lib/story-schema";

export function ReadingQueue({ stories }: { stories: Story[] }) {
  const selected = getReadingPriorities(stories);

  return (
    <section className="panel" aria-labelledby="reading-title">
      <div className="panel-heading"><h2 id="reading-title">Reading priorities</h2></div>
      <p className="queue-intro muted">Suggestions from source links on recent stories.</p>
      {selected.length ? (
        <ul className="reading-list">{selected.map(({ story_id, title, label, reason, priority }) => (
          <li key={story_id}>
            <span className={priority === 0 ? "queue-priority queue-first" : "queue-priority"}>{label}</span>
            <Link href={`/stories/${story_id}`} prefetch={false}>{title}</Link>
            <p>{reason}</p>
          </li>
        ))}</ul>
      ) : <p className="panel-note">Suggestions appear when you save sourced developments.</p>}
    </section>
  );
}
