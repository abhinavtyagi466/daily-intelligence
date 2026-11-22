# Security

Supabase Auth verifies dashboard identity. Readers and operators share a private workspace, with a database membership required for RLS-protected reads. The operator server action checks membership before calling the ingestion service. Privileged database functions are restricted to the service role. Anonymous and dashboard sessions have no direct write privileges.

The MCP server validates HTTPS OAuth JWT signatures, issuer, resource audience, expiration, scopes and subject allowlist. It uses a database-backed limit of 60 tool calls per minute per actor. The transport rejects bodies over 64 KiB and validates supplied Origin headers. Discovery exposes tool schemas. Data calls require authorization.

URLs supplied to MCP are stored as references. Network ingestion only uses the configured Crossref API. Dashboard rendering escapes text, and referenced claims are labeled source-reported. Database operations use parameterized RPC inputs and audit successful writes and reads. The service-role key and OAuth credentials belong in server-side configuration.
