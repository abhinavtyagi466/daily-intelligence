# Deployment

1. Create an isolated Supabase staging project and disable public Auth sign-ups. Review both migration files. Link the CLI to staging, inspect the proposed migrations with `npx supabase db push --dry-run`, then apply them with `npx supabase db push`. [Supabase environments and migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
2. Provision a confirmed operator and a reader. Use SQL Editor to grant workspace membership as described in [README](README.md).
3. Import the repository as a Next.js project in Vercel. Use a supported Node.js version of at least 22. Set variables for the intended environment and deploy. The dashboard page defines a 60-second function limit for manual ingestion. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
4. Verify signed-out redirects, operator ingestion, reader access, and source details on staging. Configure OAuth and verify the hosted read and write paths separately. [MCP setup](MCP_SETUP.md)
5. For production, review the migration plan against the production Supabase project, apply the approved migrations, configure production-specific secrets and OAuth resource URL, then repeat the authenticated checks.

### Release checklist

- [ ] Review migration SQL and confirm the target project.
- [ ] Confirm staged login, live Crossref ingestion and source display.
- [ ] Confirm hosted OAuth discovery, consent, read scope and write scope.
- [ ] Confirm an MCP-written story appears in the dashboard.
