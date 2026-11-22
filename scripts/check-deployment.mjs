import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const production = new URL(process.env.PRODUCTION_URL);
const endpoint = new URL("/api/mcp", production);
const metadataUrl = new URL("/.well-known/oauth-protected-resource/api/mcp", production);
const expectedTools = [
  "get_story", "upsert_story", "search_intelligence", "get_system_status",
  "list_market_research", "get_market_research", "save_market_research",
];

async function verify() {
  const [login, metadata] = await Promise.all([
    fetch(new URL("/login", production), { signal: AbortSignal.timeout(10_000) }),
    fetch(metadataUrl, { signal: AbortSignal.timeout(10_000) }),
  ]);
  assert.equal(login.status, 200, "The dashboard login page returned an error");
  assert.equal(metadata.status, 200, "The OAuth metadata endpoint returned an error");
  const resource = await metadata.json();
  assert.equal(resource.resource, endpoint.href, "OAuth resource needs to match the production MCP URL");
  assert.ok(resource.authorization_servers?.length, "An OAuth authorization server is required");

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
    console.log("Verified public login and production OAuth metadata and MCP tool discovery.");
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    await delay(5_000);
  }
}
