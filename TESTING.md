# Testing

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Automated tests apply the SQL migrations to ephemeral PostgreSQL 17 through PGlite, test RLS grants, transactional persistence, idempotency, run locks and rate limits, and exercise the official MCP client and transport with an isolated REST stub.

Run `npm run test:source` to fetch and normalize real Crossref records. This requires public network access and writes no application data.

## Full local smoke test

1. Run a local Supabase stack with the migrations and provision a test operator. [Setup](README.md)
2. Start the app using `npm run dev` with the local MCP URL and development token.
3. Install the Playwright Chromium browser with `npx playwright install chromium`, or set `SMOKE_BROWSER_CHANNEL` to an installed Chrome or Edge channel.
4. Set `SMOKE_EMAIL` and `SMOKE_PASSWORD` in the test shell or untracked `.env.local`. Run `npm run test:smoke`.

The smoke test signs in, runs live ingestion, reads a paper via MCP, writes a sourced story and checks its dashboard detail. It signs out at the end. Use an isolated local project because the test adds a record. Verify hosted OAuth with an authorized client separately.
