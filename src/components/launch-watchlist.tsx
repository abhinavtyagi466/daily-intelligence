import { launchWatchlist } from "@/lib/launch-sources";

export function LaunchWatchlist() {
  return (
    <section className="panel research-notes" aria-label="Launch watchlist">
      <details>
        <summary>Launch watchlist <span className="muted">{launchWatchlist.programs.length} startup programs · India and global</span></summary>
        <div className="launch-source-groups">
          <div>
            <h2>Startup incubators and accelerators</h2>
            <ul className="launch-source-list">
              {launchWatchlist.programs.map(({ id, name, region, url }) => (
                <li key={id}><a href={url} target="_blank" rel="noreferrer">{name}</a><span>{region}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Product discovery</h2>
            <ul className="launch-source-list">
              {launchWatchlist.discovery_sources.map(({ name, covers, url }) => (
                <li key={name}><a href={url} target="_blank" rel="noreferrer">{name}</a><span>{covers}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
