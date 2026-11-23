# API reference

| Path | Method | Purpose |
| --- | --- | --- |
| `/api/mcp` | POST | MCP initialization, tool discovery and calls |
| `/api/mcp/claude` | POST | Same MCP tools with Claude's HTTP OAuth challenge |
| `/.well-known/oauth-protected-resource/api/mcp` | GET | OAuth protected resource metadata |
| `/.well-known/oauth-protected-resource/api/mcp/claude` | GET | OAuth protected resource metadata for Claude |
| `/.well-known/oauth-protected-resource` | GET | Equivalent root metadata for discovery |

### `upsert_story`

Requires `intelligence:write`. Send `canonical_url`, `title`, `summary`, optional ISO 8601 `published_at`, an array of distinct `domains` with the primary first, one to ten `source_records`, and an `idempotency_key`. Each source record takes `source_name`, `source_url`, `source_title` and optional `published_at`. URLs use HTTPS. Domain codes are `ai-ml`, `computing`, `geopolitics`, `startups`, `psychology` and `neuroscience`.

Returns `story_id`, `operation`, `status` and `replayed`. The URL identifies the story. A new key can update its summary and domain assignments while preserving prior references. Retrying the same key with the same payload returns the original result. A different payload using that key returns an error.

Add `ai_profile` to classify the update. Each kind accepts optional `topics`, `why_it_matters` and `watch_next`.

| `ai_profile.kind` | Additional fields |
| --- | --- |
| `trend` | Use `watch_next` for a conditional next step or signal to monitor. |
| `technology` | Optional HTTPS `docs_url`. |
| `job` | Required `job` with `company`, `requirements`, `skills` and a direct HTTPS `apply_url`. Optional `location`, `experience`, `checked_on` in `YYYY-MM-DD` and `status` (`listed`, `closed`, or default `unknown`). |
| `paper` | Optional HTTPS `code_url` and `reading_focus` for a section or result worth reading. |

Use the employer listing to substantiate job requirements and copy only skills identified in the posting. Save changes to a listing with the same canonical URL and a new idempotency key. Listings marked closed are excluded from AI Jobs and recent skill counts.

### `get_story`

Requires `intelligence:read`. Send `story_id` as a UUID. Returns `story` containing the saved development, domains, source records and paper metadata when present.

### `search_intelligence`

Requires `intelligence:read`. Optionally send `query` to search titles, summaries, topics, job companies, locations, skills and requirements. Filter with `kind` (`trend`, `technology`, `job`, or `paper`), `domains`, inclusive `start_date` and `end_date` in `YYYY-MM-DD`, and `limit` from 1 to 25 (default 10). Dates use Asia/Kolkata and match publication date when available, otherwise date added. Use `get_story` for the full source records and AI profile.

### `get_daily_briefing`

Requires `intelligence:read`. Send `days` from 1 to 30 (default 7). Returns up to four saved entries each for trends, technologies, jobs and papers in the selected IST date window.

### `get_ai_patterns`

Requires `intelligence:read`. Send `days` from 1 to 30 (default 7). Returns a short briefing, date windows, counts in each window, and supporting story links and excerpts. The report compares the current IST calendar period, including today, with the immediately preceding period of the same length. AI news, trends, releases and papers are assigned topics using tags and keyword matches. Each story counts once per topic, and a topic needs two saved stories in either period to appear. Counts describe tracked coverage.

With migration `20261123000100` applied, the report also returns `topic_connections` for pairs that occur together in at least two updates across the windows. `story_connections` shows direct citations and source-attributed relationships for developments in the current window. Each relationship includes both story IDs and an evidence URL.

### `save_story_connection`

Requires `intelligence:write`. Send `earlier_story_id`, `later_story_id`, an HTTPS `evidence_url` and a short `reason`. Use an original source that explicitly attributes the later development to the earlier one. A repeated request with the same evidence returns `changed: false`. The connection appears under **Patterns → Connected patterns**.

### `get_system_status`

Requires `intelligence:read`. Send an empty object to read workspace totals, connectivity, latest ingestion status, and the time of the last successful ingestion.

### `save_market_research`

Requires `intelligence:write`. Send a stable lowercase `slug` with hyphen-separated words, a `title`, a `summary`, and a `content` object.

| Content field | Entries |
| --- | --- |
| `signals` | 1–8 objects with `name`, `measures`, `limitation` |
| `scenarios` | 0–6 objects with `title`, `condition`, `implication`, `watch_for` |
| `limitations` | 0–8 strings |
| `references` | 0–10 objects with `title` and HTTPS `url` |
| `measurements` | Optional, up to 4 chart series. Each has a `label`, `unit`, `coverage` (model, channel and market), an HTTPS `source_url`, and 2–24 `points` with a unique `date` in `YYYY-MM-DD` and a numeric `value`. Use one consistent unit and a source that supports the observations. |

The same slug updates its existing note. An identical retry returns the same `research_id` with `changed: false`. Notes render under **Market Research** on the dashboard.

### `list_market_research` and `get_market_research`

Both require `intelligence:read`. List methodology summaries by most recent update, with an optional `limit` from 1 to 20 (default 10). Send the `slug` to `get_market_research` to read the note and its references.
