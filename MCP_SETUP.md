# MCP setup

The stateless Streamable HTTP endpoint is `/api/mcp`. It supports story search, workspace status, and story and methodology reads and writes. Tool discovery is available before authentication, and data operations require a scoped bearer token. [Tool reference](API_REFERENCE.md) · [MCP SDK server guide](https://ts.sdk.modelcontextprotocol.io/server)

## Local SDK testing

Set `MCP_SERVER_URL=http://127.0.0.1:3000/api/mcp` and `MCP_AUTH_SECRET` with a random value of at least 32 characters. Run the app in development mode. Use a Streamable HTTP SDK or Inspector client with the header `Authorization: Bearer <token>`. The local token grants both scopes and is limited to loopback development. `npm run test:smoke` uses this path.

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

4. Open `/.well-known/oauth-protected-resource/api/mcp` on the deployment and confirm it advertises the Descope issuer and both scopes. Test authorization and both tools with an authorized MCP client.
5. In ChatGPT on the web, add a custom MCP server through Plugins with CIMD. Use the exact redirect URI shown in ChatGPT if the provider prompts for it. Link your permitted account, write a sourced test story in the staged workspace, read it by ID, and open it in the dashboard. [OpenAI custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server) · [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth)

For a Descope server-specific issuer or another OAuth provider, set both `MCP_OAUTH_ISSUER` and `MCP_OAUTH_JWKS_URL` to the values in provider discovery. The authorization server needs PKCE S256, the exact MCP resource URL in the access token audience, and both tool scopes.

Remote OAuth and ChatGPT linking require a deployed URL and provisioned provider to verify.

## Verify a tool update

After the app and database release, refresh the tool list for the existing ChatGPT plugin. Keep its current server URL and OAuth scopes. Call `get_system_status` to verify authenticated access, `search_intelligence` to find an existing story, then `save_market_research` and `get_market_research` for a supplied methodology. Open **Market Research** in the dashboard to confirm the note renders there.
