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
