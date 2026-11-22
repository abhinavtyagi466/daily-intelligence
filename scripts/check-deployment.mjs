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
  "get_story", "upsert_story", "search_intelligence", "get_system_status", "get_daily_briefing", "get_ai_patterns",
  "list_market_research", "get_market_research", "save_market_research",
];

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
  assert.equal(claudeChallenge.status, 401, "Claude needs an HTTP authorization challenge for protected tools");
  assert.ok(claudeChallenge.headers.get("WWW-Authenticate")?.includes(`resource_metadata="${claudeMetadata.href}"`));
  assert.equal(claudeChallenge.headers.get("Access-Control-Allow-Origin"), claudeOrigin);
  assert.equal(claudePreflight.status, 204, "Claude browser preflight must succeed");
  assert.equal(claudePreflight.headers.get("Access-Control-Allow-Origin"), claudeOrigin);

  const client = new Client({ name: "intelligence-release", version: "1.0.0" });
  const timeout = { timeout: 10_000 };
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint), timeout);
    const { tools } = await client.listTools(undefined, timeout);
    const names = new Set(tools.map(({ name }) => name));
    for (const name of expectedTools) assert.ok(names.has(name), `Missing deployed MCP tool ${name}`);
  } finally {
    await client.close();
  }
}

for (let attempt = 1; ; attempt += 1) {
  try {
    await verify();
    console.log("Verified public login, MCP discovery, and Claude's initial OAuth challenge.");
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    await delay(5_000);
  }
}
