# Architecture

Next.js App Router renders the private dashboard using the logged-in Supabase session. A session refresh proxy runs before dashboard requests. RLS consults a private membership table on each database read. The database is shared by workspace members, with operator access required for manual ingestion.

Crossref ingestion and MCP writes share a server-only persistence service. A PL/pgSQL function commits the story, domain assignments, source references, paper metadata when available, and audit event in one transaction. Canonical URLs identify developments, while independent reference records are retained. Actor-scoped idempotency keys allow safe retries and reject conflicting reuse.

The MCP server creates one SDK transport per request and returns JSON. Stateless transport fits Vercel's function model and avoids session storage for the two synchronous tools. Production clients use OAuth bearer tokens from an external authorization server, so the application can verify identity, audience and scopes without operating an OAuth issuer.

The first ingestion run is small enough for a bounded server action. PostgreSQL tracks its run and prevents two operators from collecting Crossref concurrently. A later worker can own longer jobs, persistent cursors and retries. The planned daily trigger is 02:30 UTC, corresponding to 08:00 Asia/Kolkata.
