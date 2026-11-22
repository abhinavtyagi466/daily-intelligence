# Intelligence OS

Milestone 1 is a private research workspace built with Next.js, Supabase and the official MCP SDK. The Command Center shows database-backed developments, citation metadata, sources and ingestion runs. Operators can fetch journal articles from Crossref. Authorized MCP clients can create, update and retrieve sourced developments.

## Local setup

1. Use Node.js 22 or newer and a Docker-compatible runtime. From this directory, run `npm ci` and `npx supabase start`. The CLI applies the versioned migrations to its local database. [Supabase local development](https://supabase.com/docs/guides/local-development)
2. Copy `.env.example` to `.env.local`. Fill in the local API URL, publishable key and server-only secret key from `npx supabase status`. Set `MCP_SERVER_URL=http://127.0.0.1:3000/api/mcp` and put a random development token of at least 32 characters in `MCP_AUTH_SECRET`. [Environment variables](ENVIRONMENT_VARIABLES.md)
3. In local Supabase Studio at `http://127.0.0.1:54323`, create a confirmed email/password Auth user. In the SQL Editor, grant that user access using their Auth UUID.

   ```sql
   insert into intelligence_private.memberships (user_id, role)
   values ('YOUR_AUTH_USER_UUID'::uuid, 'operator')
   on conflict (user_id) do update set role = excluded.role;
   ```

4. Run `npm run dev` and open `http://127.0.0.1:3000`. Sign in, select **Run Research Now**, then open Research Library or a story's detail page. Use `reader` instead of `operator` when provisioning a read-only dashboard user.

## Verification and deployment

- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` for repository checks.
- Run `npm run test:source` for the live Crossref adapter and `npm run test:smoke` for the complete local browser, Supabase and MCP flow. [Testing](TESTING.md)
- Review both migrations before applying them to any hosted database. [Database schema](DATABASE_SCHEMA.md) · [Deployment](DEPLOYMENT.md)
- Configure an OAuth provider and verify the hosted endpoint before connecting ChatGPT. [MCP setup](MCP_SETUP.md)

The next phases cover additional sources, claims and evidence verification, research analysis, entity tracking, trend detection, embeddings with pgvector, forecast outcomes, and the daily queue-backed worker.
