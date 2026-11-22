"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketMeasurement } from "@/lib/research-schema";

const axisDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const axisNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const fullDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fullNumber = new Intl.NumberFormat("en-IN", { maximumSignificantDigits: 15 });

export function MeasurementChart({ series }: { series: MarketMeasurement }) {
  const points = series.points.map(({ date, value }) => ({ date, value, time: Date.parse(date) }))
    .sort((a, b) => a.time - b.time);

  return (
    <figure className="measurement">
      <figcaption>
        <strong>{series.label}</strong>
        <p className="muted">{series.coverage} · {series.unit}</p>
      </figcaption>
      <div className="daily-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 250, height: 190 }}>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis type="number" dataKey="time" scale="time" domain={["dataMin", "dataMax"]} minTickGap={18}
              tickFormatter={(value: number) => axisDate.format(value)} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <YAxis width={44} domain={["auto", "auto"]} tickFormatter={(value: number) => axisNumber.format(value)}
              tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <Tooltip labelFormatter={(label) => typeof label === "number" ? fullDate.format(label) : label}
              formatter={(value) => typeof value === "number" ? fullNumber.format(value) : value}
              contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)" }}
              labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} />
            <Line dataKey="value" name={series.unit} stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-values">
        <summary>Show observations</summary>
        <dl>{points.map(({ date, time, value }) => (
          <div key={date}><dt><time dateTime={date}>{fullDate.format(time)}</time></dt><dd>{fullNumber.format(value)}</dd></div>
        ))}</dl>
      </details>
      <a className="measurement-source" href={series.source_url} target="_blank" rel="noreferrer">Measurement source</a>
    </figure>
  );
}
