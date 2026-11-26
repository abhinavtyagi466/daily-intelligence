# MCP setup

The stateless Streamable HTTP endpoint is `/api/mcp`. It supports story search, workspace status, and story and methodology reads and writes. Tool discovery is available before authentication, and data operations require a scoped bearer token. [Tool reference](API_REFERENCE.md) · [MCP SDK server guide](https://ts.sdk.modelcontextprotocol.io/server)

## Local SDK testing

Set `MCP_SERVER_URL=http://127.0.0.1:3000/api/mcp` and `MCP_AUTH_SECRET` with a random value of at least 32 characters. Run the app in development mode. Use a Streamable HTTP SDK or Inspector client with the header `Authorization: Bearer <token>`. The local token grants the read, write and delete scopes and is limited to loopback development. `npm run test:smoke` uses this path.

## Hosted OAuth with Descope

Descope's Free Forever plan includes 2,000 monthly active consents for use cases such as MCP authentication. [Descope pricing](https://www.descope.com/pricing)

1. Create a Descope project and an **MCP Server** resource. Select the project issuer and set the resource URL to the exact public HTTPS URL of Intelligence OS ending in `/api/mcp`. Add `intelligence:read` for reading stories and `intelligence:write` for saving stories. Configure the User Consent Flow to sign you in and approve those scopes. [Descope MCP servers](https://docs.descope.com/agentic-identity-hub/core-components/mcp-servers)
2. In Descope **Project Settings → OIDC**, enable Client ID Metadata Documents (CIMD) and approve the domain of the client metadata URL shown in the ChatGPT connection screen. [Descope client registration](https://docs.descope.com/agentic-identity-hub/core-components/mcp-servers/registration-methods)
3. Add these values to the Vercel project and redeploy.

   ```env
   MCP_SERVER_URL=https://YOUR-DEPLOYMENT.vercel.app/api/mcp
   DESCOPE_PROJECT_ID=YOUR_DESCOPE_PROJECT_ID
   MCP_OAUTH_ALLOWED_SUBJECTS=YOUR_DESCOPE_USER_ID
   ```

   Use the Descope user's token subject (`sub`) for the allowlist. For a project on a different Descope API hostname, also set `DESCOPE_BASE_URL` to the HTTPS origin shown by its discovery document. The app derives the issuer and JWKS URL for the project from these settings. [Descope OAuth discovery](https://docs.descope.com/agentic-identity-hub/core-components/mcp-servers/discovery-url)

4. Open `/.well-known/oauth-protected-resource/api/mcp` on the deployment and confirm it advertises the Descope issuer and the tool scopes. Test authorization and read and write access with an authorized MCP client.
5. In ChatGPT on the web, add a custom MCP server through Plugins with CIMD. Use the exact redirect URI shown in ChatGPT if the provider prompts for it. Link your permitted account, write a sourced test story in the staged workspace, read it by ID, and open it in the dashboard. [OpenAI custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server) · [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth)

For a Descope server-specific issuer or another OAuth provider, set both `MCP_OAUTH_ISSUER` and `MCP_OAUTH_JWKS_URL` to the values in provider discovery. The authorization server needs PKCE S256, the exact MCP resource URL in the access token audience, and the scopes for the tools you intend to use.

Remote OAuth and ChatGPT linking require a deployed URL and provisioned provider to verify.

## Connect Claude

Claude uses the same tools through the HTTPS endpoint ending in `/api/mcp/claude`. For the production domain the connector URL is `https://daily-intelligence-chi.vercel.app/api/mcp/claude`. This endpoint requests sign-in over HTTP, and its OAuth access token must name that URL in its audience. [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)

1. In Descope **Agentic Identity Hub → MCP Servers**, create a resource named **Intelligence OS Claude** with exactly the Claude connector URL. Grant `intelligence:read` and include `intelligence:write` in the consent flow if you want Claude to save entries. Enable DCR for automatic client registration, or use CIMD and approve the domain shown in Claude's client metadata. [Descope client registration](https://docs.descope.com/agentic-identity-hub/core-components/mcp-servers/registration-methods)
2. If this resource uses a different issuer from the main Intelligence OS resource, add `MCP_CLAUDE_OAUTH_ISSUER` and `MCP_CLAUDE_OAUTH_JWKS_URL` to Vercel Production from its discovery document's `issuer` and `jwks_uri`. Redeploy after saving those settings. For resources sharing the same issuer and keys, the existing Vercel OAuth settings apply. Sign in with a Descope end user whose subject is in `MCP_OAUTH_ALLOWED_SUBJECTS`.
3. In Claude **Customize → Connectors → Add → Add custom connector**, enter **Intelligence OS** and the Claude URL. Choose **Sign in when needed**. Use **Register automatically** for DCR or **Use Claude’s published identity** for CIMD. If you pre-register a client manually, register the callback `https://claude.ai/api/mcp/auth_callback` in Descope and use that client's ID in Claude. [Add a connector in Claude](https://claude.com/docs/connectors/custom/add-unlisted)
4. Enable the connector for a chat, ask Claude to call `get_ai_patterns`, and finish the Descope sign-in when prompted.

## Verify a tool update

After the app and database release, refresh the tool list for the existing ChatGPT plugin. Keep its current server URL and OAuth scopes. Call `get_daily_briefing` for the saved AI feed, then use `upsert_story` with `ai_profile` to send a sourced update to its dashboard section. Use `search_intelligence` with `kind: "job"` and a skill keyword to verify job search, and `get_story` to read requirements and the application URL. [Tool reference](API_REFERENCE.md)

Call `get_ai_patterns` for coverage trends, supporting links and a short digest. The same report is available in the dashboard under **Patterns**.

If a run reports only `upsert_story` and `get_story`, open **Plugins → Intelligence Tool → Refresh**, then enable the plugin in a new chat. Ask it to call `search_intelligence` with `limit: 1` and `get_ai_patterns` with `days: 7`. Repeat the read checks in the scheduled task since its available actions can differ from the chat. A successful server tool listing verifies discovery. The task checks verify that the connector exposes the tools and that its OAuth account can use them. [Refresh plugin tools](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Enable deletion for ChatGPT and Claude

1. Apply [story connections](supabase/migrations/20261123000100_story_connections.sql) if still pending, followed by [MCP record deletion](supabase/migrations/20261126000100_mcp_record_deletion.sql). Both are schema migrations. Applying them creates the functions and tables.
2. In Descope **Agentic Identity Hub → MCP Servers**, add `intelligence:delete` to the scopes and consent for both the primary `/api/mcp` and Claude `/api/mcp/claude` resources. Use a consent label such as **Permanently delete a selected workspace record**.
3. Deploy the app, refresh the tool lists in both connectors, and reconnect with consent for the delete scope. Test with `preview_workspace_delete` on a known record. The preview shows the record and affected links.

## ChatGPT scheduled prompt — Research and publish

Edit the existing task under **Scheduled** and replace its instructions with the prompt below. Set the task to run every day at **08:00 and 20:00 Asia/Kolkata** using an eligible exact-time schedule. If the editor accepts one daily time per task, use two daily tasks with identical instructions. Confirm the custom app is exposed and that a scheduled write can complete with its granted permissions. [ChatGPT scheduled tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)

```text
You run the Intelligence OS AI research desk. At each scheduled run, discover, verify, and publish fresh AI news, startup product launches, technology releases, research papers, and jobs through the connected Intelligence Tool app. Use Asia/Kolkata. Keep every run self-contained. Read get_system_status and get_content_map if exposed, then check existing records with search_intelligence.

Freshness
- Cover the 12 hours ending at the scheduled slot. Calculate the exact start and end in IST. Use the actual start for an on-demand run and label it manual. Search up to 36 hours back to catch late indexing and missed items. Catch-up covers the interval from 36 hours before the run to the primary window start. Skip older items in the fresh feed. If the source gives only a date, preserve it as date-only evidence and do not assign it to a 12-hour slot based on an invented time. Keep publication, revision, and discovery dates distinct.
- Aim for 5–8 news or releases, including notable startup product launches, 8–12 papers, and 3–5 suitable jobs when the evidence supports it. Return fewer on quiet runs. Cover agents and MCP, evaluation, RAG and retrieval, inference and infrastructure, open models, multimodal AI, and practical ML engineering.

Source rotation and verification
- Models and labs: https://openai.com/news/, https://www.anthropic.com/news, https://deepmind.google/blog/, https://mistral.ai/news/, https://www.microsoft.com/en-us/research/blog/.
- Engineering and releases: https://huggingface.co/blog, https://pytorch.org/blog/, https://github.com/vllm-project/vllm/releases, https://developer.nvidia.com/blog/, https://aws.amazon.com/blogs/machine-learning/. Check the original version, release notes, documentation, and availability. Attribute benchmark claims to the party that ran them.
- Startup and product launches: call get_launch_watchlist each run. Check the ten India and global programs for recent launch or founder leads, then their companies' own announcement channels. Use Product Hunt, Show HN, Kickstarter Technology, and Blue Robotics BlueOS release notes for additional coverage. Look for SaaS, tools, agents, physical products, operating systems and platforms. Confirm the announcement date, product link and availability with a first-party source. Treat a hardware preorder as preorder. An incubator portfolio entry or funding round alone does not establish a product launch. Report which watchlist sources were unavailable.
- Policy and compute restrictions: https://www.federalregister.gov/ and https://www.bis.gov/. Verify publication, effective date, and whether a measure is proposed or final. Use news coverage for discovery and open the underlying source before saving.
- Papers: check https://arxiv.org/list/cs.AI/recent, https://arxiv.org/list/cs.LG/recent, https://arxiv.org/list/cs.CL/recent, and https://arxiv.org/list/cs.CV/recent before using paper rankings. Open each original record and check submission history for the first timestamp and current revision. Cross-check https://openreview.net/, https://aclanthology.org/, and https://proceedings.mlr.press/. Use https://huggingface.co/papers to discover leads and Crossref or the publisher to verify DOI and venue. Read the abstract and the evidence behind any specific result. State the method, evidence or main limitation, and what to read first. Label preprint, confirmed peer-reviewed, or unknown based on evidence. Resolve any code link to the authors' actual repository.
- Jobs: use employer career pages such as https://www.google.com/about/careers/applications/jobs/results/, https://apply.careers.microsoft.com/careers, https://openai.com/careers/search/, and https://www.anthropic.com/careers/jobs. Prioritize India and roles explicitly open to applicants in India remotely. Verify the vacancy and direct application link. Capture location, experience, and skills and requirements from the listing. If the posting date is absent, label it newly found and checked today. Skip expired or inaccessible listings.

Publish and read back
- Call search_intelligence first to confirm the task can read existing records. If it is missing or fails, report the exact missing action or error and keep a sourced draft. Search by title, entity, or version before saving. Deduplicate by DOI, arXiv ID without the version suffix, employer plus requisition ID, or publisher URL and release version. Use get_story to check likely matches. Reuse the saved canonical URL for a supported material update and preserve its sourced fields. Use a stable idempotency key per item and revision, and reuse that exact key and payload on a retry.
- Use save_ai_update when available, or upsert_story with ai_profile when it is the advertised writer. Set ai_profile.kind to technology, paper, job, or trend as appropriate. Use upsert_story for general news. Use only fields accepted by the live tool schema. Cite the direct original HTTPS page and include publication metadata only when supported. Keep topics consistent across runs. Verify each write with get_story before counting it as saved. This scheduled task must never invoke delete tools.
- Before publishing to a category, confirm the writer accepts ai_profile or use the dedicated category tool. If the connector only exposes a general writer with no category field, return the item as an unsaved draft and report the missing tool or field. For New Technologies, use kind=technology for a verified engineering release. For a paper that introduces a concrete engineering method, use kind=paper with technology_method=true. This shows it in both New Technologies and Research Papers while preserving its review status.
- For a product launch, check list_product_launches and search_intelligence by product and company name. Save only genuine launches or material availability updates with save_product_launch. Include the company in the summary, the official product URL and the exact announcement in source_records. Use platform for operating systems and physical_product for tangible devices. Include the startup program only when an affiliation source supports it. When the same product moves from waitlist, beta or preorder to wider availability, update its saved story with evidence and keep its canonical URL. If the launch tools are unavailable, include the sourced item in the briefing as unsaved.

Briefing
- After saving, call get_ai_patterns for 7 days. Summarize up to three evidence-backed patterns with comparison counts when available, supporting links, and one signal to watch. Separate measured coverage, shared topics, explicit relationships, and hypotheses. Save a directional story connection only when an original source explicitly supports it and both stories exist. Avoid creating extra trend records that repeat the same counted events.
- Include a Product Launches section in every briefing. For each entry give product, maker, type, exact availability stage, why it matters, and the first-party announcement and product links. Include region or pricing only when the maker confirms them. If no launches qualify, say so briefly.
- End with what changed, three items to read first, what can wait and why, and the saved story IDs and links for Claude's review. Link every candidate to its exact HTTPS source page in the handoff. Report verified inserts and updates, skipped duplicates, and source or connector failures. If the connector is unavailable or awaits authorization, return a sourced draft and list it as unsaved.
```

## Claude prompt — Review and connect

```text
You are the Review and Analysis operator for Intelligence OS. Use the story IDs ChatGPT hands over, or use search_intelligence to find the requested batch. Read each shortlisted story and its sources before suggesting edits.

Check dates, categories, main claims, source links and paper review status. Flag unsupported claims and stale job listings. For a supported correction, keep the canonical URL and preserve sourced fields unrelated to the correction. Report what changed and its evidence.

Use get_ai_patterns to compare recent coverage against the previous period. Report topic overlap, direct citations and source-attributed links distinctly. Use save_story_connection only when the original source explicitly supports the relationship and both saved story IDs are known. End with what changed, what to watch, and a short reading shortlist with links.

For deletes, preview one exact record using preview_workspace_delete only when I ask to delete it. Show its title and dependent counts, ask me to confirm the exact target, then use delete_workspace_record with the returned revision. Keep routine review runs free of deletions.
```
