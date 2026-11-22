# API reference

| Path | Method | Purpose |
| --- | --- | --- |
| `/api/mcp` | POST | MCP initialization, tool discovery and calls |
| `/.well-known/oauth-protected-resource/api/mcp` | GET | OAuth protected resource metadata |
| `/.well-known/oauth-protected-resource` | GET | Equivalent root metadata for discovery |

### `upsert_story`

Requires `intelligence:write`. Send `canonical_url`, `title`, `summary`, optional ISO 8601 `published_at`, an array of distinct `domains` with the primary first, one to ten `source_records`, and an `idempotency_key`. Each source record takes `source_name`, `source_url`, `source_title` and optional `published_at`. URLs use HTTPS. Domain codes are `ai-ml`, `computing`, `geopolitics`, `startups`, `psychology` and `neuroscience`.

Returns `story_id`, `operation`, `status` and `replayed`. The URL identifies the story. A new key can update its summary and domain assignments while preserving prior references. Retrying the same key with the same payload returns the original result. A different payload using that key returns an error.

### `get_story`

Requires `intelligence:read`. Send `story_id` as a UUID. Returns `story` containing the saved development, domains, source records and paper metadata when present.

### `search_intelligence`

Requires `intelligence:read`. Optionally send `query` for full-text search of titles and summaries, `domains` to match any of the selected labels, inclusive `start_date` and `end_date` in `YYYY-MM-DD`, and `limit` from 1 to 25 (default 10). Dates use Asia/Kolkata and match publication date when available, otherwise date added. Results include IDs, source counts, and canonical URLs. Use `get_story` for the full source records.

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
