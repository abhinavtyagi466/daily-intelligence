# Environment variables

Use `.env.local` for local development and encrypted Vercel variables for deployed environments. [Template](.env.example)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key for session-authenticated access |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key for ingestion and MCP |
| `MCP_SERVER_URL` | Exact `/api/mcp` endpoint URL and OAuth token audience |
| `MCP_AUTH_SECRET` | Loopback development credential, at least 32 characters |
| `DESCOPE_PROJECT_ID` | Descope project ID when using its project issuer for hosted MCP OAuth |
| `DESCOPE_BASE_URL` | Optional Descope API origin, defaults to `https://api.descope.com` |
| `MCP_OAUTH_ISSUER` | Explicit HTTPS issuer from provider discovery, configured together with the JWKS URL |
| `MCP_OAUTH_JWKS_URL` | Explicit HTTPS signing key endpoint from provider discovery |
| `MCP_OAUTH_ALLOWED_SUBJECTS` | Comma-separated permitted OAuth `sub` values |
| `MCP_ALLOWED_ORIGINS` | Optional additional HTTP Origin values accepted from trusted clients |
| `CROSSREF_CONTACT_EMAIL` | Optional contact for the Crossref polite pool |
| `SMOKE_EMAIL`, `SMOKE_PASSWORD` | Test operator credentials for the isolated browser smoke test |
| `SMOKE_BROWSER_CHANNEL` | Optional installed Playwright browser channel, such as `chrome` or `msedge` |

For legacy projects, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supported as fallbacks.
