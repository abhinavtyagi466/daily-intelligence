# Deployment

1. Create an isolated Supabase staging project and disable public Auth sign-ups. Review the migration files. Use the CLI to preview pending migrations with `supabase db push --dry-run --remote="$SUPABASE_DB_URL"`, then apply them with `supabase db push --remote="$SUPABASE_DB_URL"`. [Supabase environments and migrations](https://supabase.com/docs/guides/deployment/database-migrations)
2. Provision a confirmed operator and a reader. Use SQL Editor to grant workspace membership as described in [README](README.md).
3. Import the repository as a Next.js project in Vercel. Use a supported Node.js version of at least 22. Set variables for the intended environment and deploy. The dashboard page defines a 60-second function limit for manual ingestion. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
4. Verify signed-out redirects, operator ingestion, reader access, and source details on staging. Configure OAuth and verify the hosted read and write paths separately. [MCP setup](MCP_SETUP.md)
5. For production, review the migration plan against the production Supabase project, apply the approved migrations, configure production-specific secrets and OAuth resource URL, then repeat the authenticated checks.

## Deploy app and database together

The [release workflow](.github/workflows/release.yml) runs lint, tests and a Next.js build. The production job pulls Vercel's production settings and builds its artifact, previews and applies pending Supabase migrations, deploys that artifact, and checks the login page and MCP discovery on the production domain.

1. In GitHub **Settings → Environments**, create a `production` environment and add `SUPABASE_DB_URL` (the production Postgres owner connection string, preferably the session pooler URL), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as secrets. Set the `PRODUCTION_URL` environment variable to the stable HTTPS origin, for example `https://daily-intelligence-chi.vercel.app`. The Vercel project keeps the application's Supabase and MCP environment variables. [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
2. If production was provisioned through SQL Editor, compare the Supabase migration history against the live schema. Record only the versions you have confirmed are already applied. For the original two migrations, run the commands below from an authenticated shell using the production database connection. Leave the new [research workspace migration](supabase/migrations/20261122000300_research_workspace.sql) pending if you have yet to apply it. [Supabase migration history](https://supabase.com/docs/guides/deployment/database-migrations)

   ```sh
   supabase migration list --remote="$SUPABASE_DB_URL"
   supabase migration repair 20261122000100 20261122000200 --status applied --remote="$SUPABASE_DB_URL" --yes
   supabase db push --dry-run --remote="$SUPABASE_DB_URL"
   ```

3. Run **Actions → Intelligence OS release → Run workflow** on `main` for the first coordinated release. After it passes, set the GitHub **repository** variable `AUTO_RELEASE=true` and merge a `vercel.json` change that sets `git.deploymentEnabled.main` to `false`. Later pushes to `main` release through the workflow. Vercel previews can continue using their own Supabase project. [Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration)
4. In the existing ChatGPT Intelligence Tool plugin, refresh its tool list after release. Use the same MCP URL and OAuth scopes. Call `get_daily_briefing`, then save a sourced AI update with `ai_profile` and confirm it appears in the matching dashboard section. [MCP setup](MCP_SETUP.md)

### Release checklist

- [ ] Review migration SQL and confirm the target project.
- [ ] Confirm staged login, live Crossref ingestion and source display.
- [ ] Confirm hosted OAuth discovery, consent, read scope and write scope.
- [ ] Confirm an MCP-written story appears in the dashboard.
- [ ] Confirm a sourced AI job can be searched by skill and shows the original application link and requirements.
- [ ] Confirm the Patterns dashboard and `get_ai_patterns` show matching counts and supporting links.
- [ ] Confirm Claude signs in to its MCP resource and can call `get_ai_patterns`. [Claude connector setup](MCP_SETUP.md#connect-claude)
- [ ] Confirm an MCP-written methodology is readable by slug and visible in Market Research.
- [ ] Confirm activity counts and 7-, 14-, and 30-day filters at phone width.
