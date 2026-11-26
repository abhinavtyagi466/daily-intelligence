import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const production = new URL(process.env.PRODUCTION_URL);
const endpoint = new URL("/api/mcp", production);
const metadataUrl = new URL("/.well-known/oauth-protected-resource/api/mcp", production);
const claudeEndpoint = new URL("/api/mcp/claude", production);
const claudeMetadata = new URL("/.well-known/oauth-protected-resource/api/mcp/claude", production);
const claudeOrigin = "https://claude.ai";
const expectedTools = [
  "preview_workspace_delete", "delete_workspace_record",
  "get_content_map", "get_workspace_overview", "list_workspace_sources", "list_ingestion_runs", "run_crossref_ingestion", "save_ai_update",
  "get_story", "upsert_story", "search_intelligence", "get_system_status", "get_daily_briefing", "get_ai_patterns",
  "list_market_research", "get_market_research", "save_market_research", "save_story_connection",
];

async function verifyTools(url) {
  const client = new Client({ name: "intelligence-release", version: "1.0.0" });
  const timeout = { timeout: 10_000 };
  try {
    await client.connect(new StreamableHTTPClientTransport(url), timeout);
    const { tools } = await client.listTools(undefined, timeout);
    const names = new Set(tools.map(({ name }) => name));
    const missing = expectedTools.filter((name) => !names.has(name));
    assert.equal(missing.length, 0, `${url.pathname} is missing deployed tools: ${missing.join(", ")}`);
    return tools.length;
  } finally {
    await client.close();
  }
}

async function verify() {
  const [login, metadata, claudeResource, claudeChallenge, claudePreflight] = await Promise.all([
    fetch(new URL("/login", production), { signal: AbortSignal.timeout(10_000) }),
    fetch(metadataUrl, { signal: AbortSignal.timeout(10_000) }),
    fetch(claudeMetadata, { signal: AbortSignal.timeout(10_000) }),
    fetch(claudeEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json", Origin: claudeOrigin },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_ai_patterns", arguments: {} } }),
    }),
    fetch(claudeEndpoint, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(10_000),
      headers: { Origin: claudeOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type" },
    }),
  ]);
  assert.equal(login.status, 200, "The dashboard login page returned an error");
  assert.equal(metadata.status, 200, "The OAuth metadata endpoint returned an error");
  const resource = await metadata.json();
  assert.equal(resource.resource, endpoint.href, "OAuth resource needs to match the production MCP URL");
  assert.ok(resource.authorization_servers?.length, "An OAuth authorization server is required");
  assert.equal(claudeResource.status, 200, "Claude OAuth metadata is required");
  const claude = await claudeResource.json();
  assert.equal(claude.resource, claudeEndpoint.href, "Claude's OAuth resource must match the connector URL");
  assert.ok(claude.authorization_servers?.length, "A Claude OAuth authorization server is required");
  for (const metadata of [resource, claude]) {
    for (const scope of ["intelligence:read", "intelligence:write"]) {
      assert.ok(metadata.scopes_supported?.includes(scope), `${metadata.resource} is missing ${scope}`);
    }
  }
  assert.equal(claudeChallenge.status, 401, "Claude needs an HTTP authorization challenge for protected tools");
  assert.ok(claudeChallenge.headers.get("WWW-Authenticate")?.includes(`resource_metadata="${claudeMetadata.href}"`));
  assert.equal(claudeChallenge.headers.get("Access-Control-Allow-Origin"), claudeOrigin);
  assert.equal(claudePreflight.status, 204, "Claude browser preflight must succeed");
  assert.equal(claudePreflight.headers.get("Access-Control-Allow-Origin"), claudeOrigin);

  return Promise.all([verifyTools(endpoint), verifyTools(claudeEndpoint)]);
}

for (let attempt = 1; ; attempt += 1) {
  try {
    const [primaryCount, claudeCount] = await verify();
    console.log(`Verified public login, OAuth discovery, ${primaryCount} ChatGPT tools and ${claudeCount} Claude tools.`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    await delay(5_000);
  }
}
