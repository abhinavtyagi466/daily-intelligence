import { BookOpen, ExternalLink, GitBranch } from "lucide-react";
import { MeasurementChart } from "./measurement-chart";
import { localTime } from "./research-feed";
import { marketGuide } from "@/lib/market-guide";
import type { MarketResearch, MarketResearchInput } from "@/lib/research-schema";

function ResearchContent({ entry }: { entry: MarketResearchInput }) {
  const { signals, scenarios, limitations, references, measurements } = entry.content;
  return (
    <div className="research-content">
      <p className="research-summary">{entry.summary}</p>
      {!!measurements?.length && (
        <section className="research-section">
          <h3>Observed measurements</h3>
          <div className="measurement-grid">
            {measurements.map((series, index) => <MeasurementChart key={`${series.label}-${index}`} series={series} />)}
          </div>
        </section>
      )}
      <section className="research-section">
        <h3>Signals to track</h3>
        <ul className="signal-list">{signals.map(({ name, measures, limitation }, index) => (
          <li key={`${name}-${index}`}>
            <h4>{name}</h4>
            <p>{measures}</p>
            <p className="muted"><strong>Limit</strong> {limitation}</p>
          </li>
        ))}</ul>
      </section>
      {scenarios.length > 0 && (
        <section className="research-section">
          <h3><GitBranch size={16} /> What could happen</h3>
          <ul className="scenario-grid">{scenarios.map(({ title, condition, implication, watch_for }, index) => (
            <li key={`${title}-${index}`}>
              <h4>{title}</h4>
              <dl>
                <div><dt>If</dt><dd>{condition}</dd></div>
                <div><dt>Possible outcome</dt><dd>{implication}</dd></div>
                <div><dt>What to watch</dt><dd>{watch_for}</dd></div>
              </dl>
            </li>
          ))}</ul>
        </section>
      )}
      {limitations.length > 0 && (
        <section className="research-section">
          <h3>Before publishing an estimate</h3>
          <ul className="research-cautions">{limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul>
        </section>
      )}
      {references.length > 0 && (
        <section className="research-section">
          <h3>References</h3>
          <ul className="reference-list">{references.map(({ url, title }, index) => (
            <li key={`${url}-${index}`}><a href={url} rel="noreferrer" target="_blank">{title}<ExternalLink aria-hidden="true" size={13} /></a></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

export function MarketResearchPanel({ notes }: { notes: MarketResearch[] | null }) {
  return (
    <div className="panel-stack">
      <section className="panel" aria-labelledby="saved-methodology">
        <div className="panel-heading"><h2 id="saved-methodology">Saved methodologies</h2></div>
        {notes?.length ? (
          <div className="research-notes">{notes.map((note) => (
            <details key={note.id}>
              <summary>{note.title} <span className="muted">Updated {localTime(note.updated_at)}</span></summary>
              <ResearchContent entry={note} />
            </details>
          ))}</div>
        ) : <p className="panel-note">
          {notes ? <>Save a methodology from Intelligence Tool with <code>save_market_research</code> to see it here.</> : "Saved methodologies become available after the research workspace migration is applied."}
        </p>}
      </section>
      <section className="panel" aria-labelledby="estimation-guide">
        <div className="panel-heading"><h2 id="estimation-guide"><BookOpen size={17} /> {marketGuide.title}</h2></div>
        <ResearchContent entry={marketGuide} />
      </section>
    </div>
  );
}
