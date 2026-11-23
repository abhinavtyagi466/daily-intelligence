import { ArrowLeftRight, ArrowRight, ChartNoAxesCombined } from "lucide-react";
import Link from "next/link";
import type { PatternReport } from "@/lib/pattern-schema";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => dateFormat.format(new Date(date));
const labels = { trend: "Trend", technology: "Technology", paper: "Paper", development: "News" };

export function PatternDigest({ report, days }: { report: PatternReport | null; days: number }) {
  return (
    <section className="panel pattern-digest">
      <div className="panel-heading">
        <h2><ChartNoAxesCombined size={17} /> AI coverage briefing</h2>
        <Link href={`/?view=patterns&range=${days}`}>Explore patterns</Link>
      </div>
      {report?.summary.length ? <ul className="digest-list">{report.summary.slice(0, 2).map((line) => <li key={line}>{line}</li>)}</ul>
        : <p className="panel-note">Recurring topics appear here as you save related AI news, trends and papers.</p>}
    </section>
  );
}

export function PatternExplorer({ report, days }: { report: PatternReport | null; days: number }) {
  if (!report) return <section className="panel"><p className="panel-note">Apply the AI patterns migration to enable coverage analysis.</p></section>;

  const currentLabel = `${formatDay(report.current.from)}–${formatDay(report.current.through)}`;
  const previousLabel = `${formatDay(report.previous.from)}–${formatDay(report.previous.through)}`;
  const maxCount = Math.max(1, ...report.patterns.flatMap((pattern) => [pattern.current_count, pattern.previous_count]));

  return (
    <div className="panel-stack">
      <section className="panel" aria-labelledby="pattern-heading">
        <div className="panel-heading analytics-heading">
          <div>
            <h2 id="pattern-heading">How AI coverage changed</h2>
            <p className="muted">{report.current.stories} saved updates in the current period and {report.previous.stories} in the previous period.</p>
          </div>
          <nav className="range-tabs" aria-label="Pattern date range">
            {[7, 14, 30].map((range) => (
              <Link key={range} href={`/?view=patterns&range=${range}`} scroll={false} aria-current={range === days ? "true" : undefined}>{range} days</Link>
            ))}
          </nav>
        </div>
        {report.patterns.length ? (
          <div className="pattern-chart">
            <ul className="pattern-legend">
              <li><span className="pattern-swatch pattern-current" />Current {currentLabel}</li>
              <li><span className="pattern-swatch pattern-previous" />Previous {previousLabel}</li>
            </ul>
            <ul className="pattern-bars">
              {report.patterns.map((pattern, index) => (
                <li key={pattern.label}>
                  <a href={`#pattern-${index}`}>{pattern.label}</a>
                  <div>
                    {([["current", pattern.current_count], ["previous", pattern.previous_count]] as const).map(([period, count]) => (
                      <div key={period} className="pattern-bar-row">
                        <span className="sr-only">{period === "current" ? "Current" : "Previous"} period</span>
                        <div className="bar-track" aria-hidden="true"><span className={`pattern-${period}`} style={{ width: `${count / maxCount * 100}%` }} /></div>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted">Dates are in IST and the current period includes today. One update can match several topics.</p>
          </div>
        ) : <p className="panel-note">A pattern appears when a topic occurs in at least two saved updates in either period.</p>}
      </section>
      {!!report.summary.length && (
        <section className="panel" aria-labelledby="summary-heading">
          <div className="panel-heading"><h2 id="summary-heading">What changed</h2></div>
          <ul className="digest-list">
            {report.summary.map((line, index) => <li key={line}><a href={`#pattern-${index}`}>{line}</a></li>)}
          </ul>
        </section>
      )}
      <PatternConnections report={report} />
      {report.patterns.map((pattern, index) => (
        <section className="panel" key={pattern.label} id={`pattern-${index}`} aria-labelledby={`topic-${index}`}>
          <div className="panel-heading"><h2 id={`topic-${index}`}>{pattern.label}</h2><span className="muted">Linked evidence</span></div>
          <ul className="feed">
            {pattern.evidence.map((story) => (
              <li key={story.id} className={story.day === report.current.through ? "today-update" : undefined}>
                <div className="feed-meta">
                  {story.day === report.current.through && <span className="today-badge">Today</span>}
                  <span className="domain-tag">{labels[story.kind]}</span><time dateTime={story.day}>{formatDay(story.day)}</time>
                </div>
                <h3><Link href={`/stories/${story.id}`} prefetch={false}>{story.title}</Link></h3>
                <p>{story.summary}</p>
                <div className="feed-bottom"><a href={story.canonical_url} target="_blank" rel="noreferrer">Open original</a></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PatternConnections({ report }: { report: PatternReport }) {
  const { story_connections: stories, topic_connections: topics } = report;
  return (
    <section className="panel" aria-labelledby="connections-title">
      <div className="panel-heading"><h2 id="connections-title">Connected patterns</h2></div>
      {!stories && !topics ? (
        <p className="panel-note">Apply the story connections migration to trace related developments.</p>
      ) : <>
        <div className="connections-group">
          <h3>How developments connect</h3>
          {stories?.length ? <ul className="connection-list">
            {stories.map(({ earlier, later, relationship, reason, evidence_url }) => (
              <li key={`${earlier.id}-${later.id}`} className={later.day === report.current.through ? "today-update" : undefined}>
                <div className="feed-meta">
                  <span className="domain-tag">{relationship === "source_attributed" ? "Attributed by source" : "Direct citation"}</span>
                  {later.day === report.current.through && <span className="today-badge">Today</span>}
                </div>
                <div className="connection-flow">
                  <Link prefetch={false} href={`/stories/${earlier.id}`}>{earlier.title}</Link>
                  <ArrowRight size={16} aria-label="followed by" />
                  <Link prefetch={false} href={`/stories/${later.id}`}>{later.title}</Link>
                </div>
                <p>{reason} <a href={evidence_url} target="_blank" rel="noreferrer">View evidence</a></p>
              </li>
            ))}
          </ul> : <p className="muted">Links appear when an update cites another saved story or includes a source that explains the connection.</p>}
        </div>
        <div className="connections-group">
          <h3>Topics appearing together</h3>
          {topics?.length ? <ul className="connection-list">
            {topics.map(({ left_topic, right_topic, current_count, previous_count, evidence }) => (
              <li key={`${left_topic}/${right_topic}`}>
                <div className="connection-flow"><strong>{left_topic}</strong><ArrowLeftRight size={16} aria-label="appears with" /><strong>{right_topic}</strong></div>
                <p>{current_count} shared updates this period · {previous_count} in the previous period</p>
                <details>
                  <summary>Supporting updates</summary>
                  <ul className="connection-evidence">
                    {evidence.map((story) => (
                      <li key={story.id} className={story.day === report.current.through ? "today-update" : undefined}>
                        <Link href={`/stories/${story.id}`} prefetch={false}>{story.title}</Link>
                        <time dateTime={story.day}>{formatDay(story.day)}</time>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul> : <p className="muted">A topic pair appears after at least two saved updates mention both topics.</p>}
        </div>
      </>}
    </section>
  );
}
