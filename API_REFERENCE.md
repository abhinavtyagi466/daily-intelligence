# API reference

| Path | Method | Purpose |
| --- | --- | --- |
| `/api/mcp` | POST | MCP initialization, tool discovery and calls |
| `/api/mcp/claude` | POST | Same MCP tools with Claude's HTTP OAuth challenge |
| `/.well-known/oauth-protected-resource/api/mcp` | GET | OAuth protected resource metadata |
| `/.well-known/oauth-protected-resource/api/mcp/claude` | GET | OAuth protected resource metadata for Claude |
| `/.well-known/oauth-protected-resource` | GET | Equivalent root metadata for discovery |

## Workspace content map

Call `get_content_map` before planning updates across pages. It returns paths, displayed sections, tool names and the workflow for each page. Requires `intelligence:read` and accepts an empty object. Use the original sources for submitted fields, then read back the saved record and the affected page through its read tools.

| Page | Content and how to populate it | Read back |
| --- | --- | --- |
| Command Center `/` | Save sourced stories. Category totals, activity and skill charts, coverage and reading priorities derive from records. Ingestion status comes from an actual run. | `get_workspace_overview` |
| AI Trends `/?view=trends` | `save_ai_update` with `kind=trend`, summary, topics, implications and what to watch next. Tracked coverage trends derive from existing stories. | `get_ai_patterns`, `search_intelligence`, `get_story` |
| Patterns `/?view=patterns` | Save related updates with evidence. Topic counts and co-occurrences are derived. Use `save_story_connection` for a directional relationship supported by an original source. | `get_ai_patterns`, `get_story` |
| New Technologies `/?view=technologies` | `save_product_launch` for sourced products and their availability. Use `save_ai_update` with `kind=technology` for general releases. | `get_launch_watchlist`, `list_product_launches`, `search_intelligence`, `get_story` |
| AI Jobs `/?view=jobs` | `save_ai_update` with `kind=job`, employer, requirements, skills, application link and listing status. | `search_intelligence`, `get_story` |
| Research Papers `/?view=papers` | `save_ai_update` with `kind=paper`, original paper, bibliographic details, code and reading focus. `run_crossref_ingestion` imports from the configured journal. | `search_intelligence`, `get_story` |
| All Updates `/?view=stories` | All saved stories with category, date and references. The green Published today badge uses IST. Records saved today with an unknown publication date show Added today. | `search_intelligence`, `get_story` |
| Saved Methodologies `/?view=research` | `save_market_research` saves signals, scenarios, limitations, references and measurements for charts. The built-in guide comes from app code. | `list_market_research`, `get_market_research` |
| Source Explorer `/?view=sources` | `upsert_story` registers cited source names and origins. Active feed and fetch status are managed by the adapter and actual runs. | `list_workspace_sources`, `get_story` |
| System Health `/?view=health` | `run_crossref_ingestion` records actual run timing, outcomes, counts and errors. | `list_ingestion_runs`, `get_system_status` |
| Story Detail `/stories/{story_id}` | `upsert_story` sets title, summary, date, domains, profile and linked sources. | `get_story` |
| Login `/login` | Supabase Auth and administrator-managed membership. | Dashboard sign-in |

### `get_workspace_overview`

Requires `intelligence:read`. Choose `days` of `7`, `14`, or `30` (default 14). Returns the same totals, activity chart series, skill counts, coverage summary, latest updates, reading priorities and recent run shown on the Command Center.

### `list_workspace_sources`

Requires `intelligence:read`. Accepts `limit` from 1 to 100 (default 100). Returns source names, origins, type, active status and last successful fetch time.

### `list_ingestion_runs` and `run_crossref_ingestion`

`list_ingestion_runs` requires `intelligence:read` and accepts `limit` from 1 to 30 (default 10). `run_crossref_ingestion` requires `intelligence:write` and an empty object. Run it when requested, then inspect the run by its returned ID in the history. If the deployment or client times out, check the run history before retrying. A current run returns `busy`.

### `upsert_story`

Requires `intelligence:write`. Send `canonical_url`, `title`, `summary`, optional ISO 8601 `published_at`, an array of distinct `domains` with the primary first, one to ten `source_records`, and an `idempotency_key`. Each source record takes `source_name`, `source_url`, `source_title` and optional `published_at`. URLs use HTTPS. Domain codes are `ai-ml`, `computing`, `geopolitics`, `startups`, `psychology` and `neuroscience`.

Returns `story_id`, `operation`, `status` and `replayed`. The URL identifies the story. A new key can update its summary and domain assignments while preserving prior references. Retrying the same key with the same payload returns the original result. A different payload using that key returns an error.

Add `ai_profile` to classify the update. Each kind accepts optional `topics`, `why_it_matters` and `watch_next`.

| `ai_profile.kind` | Additional fields |
| --- | --- |
| `trend` | Use `watch_next` for a conditional next step or signal to monitor. |
| `technology` | Optional HTTPS `docs_url` and `launch` metadata from `save_product_launch`. Preserve the launch metadata when editing an existing launch. |
| `job` | Required `job` with `company`, `requirements`, `skills` and a direct HTTPS `apply_url`. Optional `location`, `experience`, `checked_on` in `YYYY-MM-DD` and `status` (`listed`, `closed`, or default `unknown`). |
| `paper` | Optional HTTPS `code_url`, `reading_focus`, and a `paper` object with supported `doi`, `authors`, `venue`, `publication_type`, and `peer_review_status` (`preprint`, `peer_reviewed`, `unknown`). |

Use the employer listing to substantiate job requirements and copy only skills identified in the posting. Save changes to a listing with the same canonical URL and a new idempotency key. Listings marked closed are excluded from AI Jobs and recent skill counts.

### `save_ai_update`

Requires `intelligence:write`. Uses the same fields as `upsert_story` with a required `ai_profile`. Call it to publish to AI Trends, New Technologies, AI Jobs, or Research Papers. For an existing general update, first use `get_story`, then reuse its canonical URL and supply a fresh idempotency key with the sourced category.

### `get_story`

Requires `intelligence:read`. Send `story_id` as a UUID. Returns `story` containing the saved development, domains, source records and launch or paper metadata when present.

### `get_launch_watchlist`, `list_product_launches`, and `save_product_launch`

- `get_launch_watchlist` requires `intelligence:read` and accepts `{}`. It returns ten startup program links and discovery channels for SaaS, tools, agents, hardware and operating-system releases. Open a dated first-party launch source to substantiate each submission.
- `list_product_launches` requires `intelligence:read`. Optional `type` and `query` filter the latest saved launches. `limit` is 1–25 and defaults to 12. The tool returns the same launch records as the New Technologies filters.
- `save_product_launch` requires `intelligence:write`. Use the base `upsert_story` fields and supply `launch` in place of `ai_profile`. The announcement `canonical_url` must appear in `source_records`. Optional top-level fields include `docs_url`, `topics`, `why_it_matters`, and `watch_next`. This action writes to New Technologies.

| `launch` field | Value |
| --- | --- |
| `type` | `saas`, `tool`, `agent`, `physical_product`, `platform`, or `other` |
| `company` and `product_url` | Maker or company name and official HTTPS product link |
| `stage` | `announced`, `waitlist`, `beta`, `preorder`, or `available` |
| `release_on` | Optional `YYYY-MM-DD` release date stated by the maker |
| `incubator_id` | Optional program ID from `get_launch_watchlist`. Include the affiliation source. |

Check existing records with `list_product_launches` and `search_intelligence`. Keep the same canonical URL for updates to the same launch and link any new announcement in its source records.

### `search_intelligence`

Requires `intelligence:read`. Optionally send `query` to search titles, summaries, topics, job companies, locations, skills and requirements. Filter with `kind` (`trend`, `technology`, `job`, `paper`, or `development` for general updates), `domains`, inclusive `start_date` and `end_date` in `YYYY-MM-DD`, and `limit` from 1 to 25 (default 10). Dates use Asia/Kolkata and match publication date when available, otherwise date added. Use `get_story` for the full source records and AI profile.

### `get_daily_briefing`

Requires `intelligence:read`. Send `days` from 1 to 30 (default 7). Returns up to four saved entries each for trends, technologies, jobs and papers in the selected IST date window.

### `get_ai_patterns`

Requires `intelligence:read`. Send `days` from 1 to 30 (default 7). Returns a short briefing, date windows, counts in each window, and supporting story links and excerpts. The report compares the current IST calendar period, including today, with the immediately preceding period of the same length. AI news, trends, releases and papers are assigned topics using tags and keyword matches. Each story counts once per topic, and a topic needs two saved stories in either period to appear. Counts describe tracked coverage.

With migration `20261123000100` applied, the report also returns `topic_connections` for pairs that occur together in at least two updates across the windows. `story_connections` shows direct citations and source-attributed relationships for developments in the current window. Each relationship includes both story IDs and an evidence URL.

### `save_story_connection`

Requires `intelligence:write`. Send `earlier_story_id`, `later_story_id`, an HTTPS `evidence_url` and a short `reason`. Use an original source that explicitly attributes the later development to the earlier one. A repeated request with the same evidence returns `changed: false`. The connection appears under **Patterns → Connected patterns**.

### `preview_workspace_delete` and `delete_workspace_record`

Both require `intelligence:delete`. Preview the exact record with `kind` and `id`, show the returned title and dependent counts to the user, then use the same target and `revision` after the user confirms. A stale revision returns `changed`. A repeated delete of the same UUID returns `not_found`. Successful deletes are recorded in the workspace audit log.

| Kind | Target and effect |
| --- | --- |
| `story` | Story UUID. Its citations, paper metadata, domain assignments and story connections are removed with it. |
| `market_research` | Methodology UUID returned by `get_market_research`. Measurements and references stored in the note are removed with it. |
| `story_connection` | Earlier story UUID as `id` and later story UUID as `related_id`. Removes that attributed connection. |
| `story_source` | Citation UUID returned by `get_story`. An existing story must retain a citation. |
| `submitted_source` | Unused submitted-source UUID from `list_workspace_sources`. Feeds and sources linked to stories or runs are excluded. |

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
