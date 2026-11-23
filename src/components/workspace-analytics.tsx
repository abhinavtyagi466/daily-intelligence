import { BarChart3 } from "lucide-react";
import Link from "next/link";
import type { AIWorkspaceSnapshot, WorkspaceAnalytics } from "@/lib/research-schema";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => dateFormat.format(new Date(date));

export function WorkspaceAnalyticsPanel({ analytics, days, skills }: {
  analytics: WorkspaceAnalytics | null; days: number; skills: AIWorkspaceSnapshot["skills"];
}) {
  const total = analytics?.daily.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const maxDaily = Math.max(1, ...(analytics?.daily.map(({ count }) => count) ?? []));
  const maxSkill = Math.max(1, ...skills.map(({ count }) => count));

  return (
    <section className="panel analytics-panel" aria-labelledby="activity-title">
      <div className="panel-heading analytics-heading">
        <div>
          <h2 id="activity-title"><BarChart3 size={17} /> Tracker activity</h2>
          <p className="muted">Saved updates and skills from tracked jobs over the selected period</p>
        </div>
        {analytics && (
          <nav className="range-tabs" aria-label="Activity date range">
            {[7, 14, 30].map((range) => (
              <Link key={range} href={`/?range=${range}`} scroll={false} aria-current={range === days ? "true" : undefined}>
                {range} days
              </Link>
            ))}
          </nav>
        )}
      </div>
      {analytics ? (
        <div className="analytics-grid">
          <div className="analytics-daily">
            <p><strong>{total.toLocaleString("en-IN")}</strong> saved in the last {days} days</p>
            {total > 0 ? (
              <>
                <div className="activity-chart" aria-hidden="true">
                  <div className="activity-scale"><span>{maxDaily}</span><span>0</span></div>
                  <div className="activity-days" style={{ gridTemplateColumns: `repeat(${analytics.daily.length}, minmax(0, 1fr))` }}>
                    {analytics.daily.map(({ date, count }, index) => (
                      <div title={`${formatDay(date)} · ${count}`} key={date}>
                        <span className={index === analytics.daily.length - 1 ? "activity-today" : undefined} style={{ height: `${count / maxDaily * 100}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="activity-axis"><span>{formatDay(analytics.daily[0].date)}</span><span>{formatDay(analytics.daily.at(-1)!.date)}</span></div>
                </div>
                <details className="chart-values">
                  <summary>Daily counts</summary>
                  <dl>{analytics.daily.map(({ date, count }) => (
                    <div key={date}><dt><time dateTime={date}>{formatDay(date)}</time></dt><dd>{count}</dd></div>
                  ))}</dl>
                </details>
              </>
            ) : <p className="panel-note">No developments were added during this period.</p>}
          </div>
          <div className="analytics-domains">
            <h3>Skills in recent job listings</h3>
            {skills.length > 0 ? (
              <ul>{skills.map(({ name, count }) => (
                <li key={name}>
                  <div><Link href={`/?${new URLSearchParams({ view: "jobs", q: name })}`}>{name}</Link><strong>{count.toLocaleString("en-IN")}</strong></div>
                  <div className="bar-track" aria-hidden="true"><span style={{ width: `${count / maxSkill * 100}%` }} /></div>
                </li>
              ))}</ul>
            ) : <p className="muted">Save an AI job with listed skills to see them here.</p>}
          </div>
        </div>
      ) : <p className="panel-note">Activity charts become available after the research workspace migration is applied.</p>}
    </section>
  );
}
