"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WorkspaceAnalytics } from "@/lib/research-schema";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => dateFormat.format(new Date(date));

export function WorkspaceAnalyticsPanel({ analytics, days }: { analytics: WorkspaceAnalytics | null; days: number }) {
  const total = analytics?.daily.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const maxDomain = Math.max(1, ...(analytics?.domains.map(({ count }) => count) ?? []));

  return (
    <section className="panel analytics-panel" aria-labelledby="activity-title">
      <div className="panel-heading analytics-heading">
        <div>
          <h2 id="activity-title"><BarChart3 size={17} /> Saved developments</h2>
          <p className="muted">By date added in IST and primary domain</p>
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
                <div className="daily-chart">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 300, height: 190 }}>
                    <BarChart data={analytics.daily} margin={{ top: 8, left: 0, right: 5, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis dataKey="date" tickFormatter={formatDay} minTickGap={19} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} width={34} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={(label) => typeof label === "string" ? formatDay(label) : label} cursor={{ fill: "var(--active)" }} contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8 }} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} />
                      <Bar dataKey="count" name="Saved" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
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
          {analytics.domains.length > 0 && (
            <div className="analytics-domains">
              <h3>Primary domains</h3>
              <ul>{analytics.domains.map(({ code, name, count }) => (
                <li key={code}>
                  <div><span>{name}</span><strong>{count.toLocaleString("en-IN")}</strong></div>
                  <div className="bar-track" aria-hidden="true"><span style={{ width: `${count / maxDomain * 100}%` }} /></div>
                </li>
              ))}</ul>
            </div>
          )}
        </div>
      ) : <p className="panel-note">Activity charts become available after the research workspace migration is applied.</p>}
    </section>
  );
}
