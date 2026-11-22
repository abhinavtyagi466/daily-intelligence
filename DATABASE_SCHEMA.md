# Database schema

The first migration defines tables, grants, RLS and reference data. The second defines transactional persistence, run lifecycle and quotas. [Schema migration](supabase/migrations/20261122000100_persistence.sql) · [Operations migration](supabase/migrations/20261122000200_persistence_operations.sql)

| Relation | Purpose |
| --- | --- |
| `domains` | Six research domains |
| `stories`, `story_domains` | Canonical development and its primary and additional domains |
| `sources`, `story_sources` | Registered feeds and external references, with metadata revisions retained by hash |
| `research_papers` | DOI, title, authors and publication type for indexed journal articles |
| `ingestion_runs` | Source, status, timestamps, collected, created and rejected counts |
| `audit_logs` | Append-only operation records under application roles |
| `intelligence_private.memberships` | Reader and operator access for Supabase Auth users |
| `intelligence_private.idempotency_keys` | Actor-scoped operation keys, payloads and original results |
| `intelligence_private.mcp_rate_limits` | Current request bucket per authenticated MCP actor |

Primary keys on public records use UUIDs. Timestamps are stored as `timestamptz` and presented in Asia/Kolkata. The canonical URL and normalized DOI have unique constraints. Foreign keys protect stories, paper metadata and source history from deletion. Deleting an Auth user removes their membership.

Additional analysis tables and the pgvector migration belong to later phases. Choose the vector dimension when the embedding provider is selected.
