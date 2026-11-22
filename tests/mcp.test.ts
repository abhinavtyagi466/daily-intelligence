import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mcpConfig, readScope, verifyMcpToken, writeScope } from "../src/lib/mcp/auth";
import { handleMcp } from "../src/lib/mcp/handler";

test("Descope OAuth validates resource audience, issuer, expiration and the subject allowlist", async () => {
  const env = {
    MCP_SERVER_URL: "https://intelligence.example/api/mcp",
    DESCOPE_PROJECT_ID: "P123Example",
    MCP_OAUTH_ALLOWED_SUBJECTS: "member",
  };
  const config = mcpConfig(env);
  const issuer = "https://api.descope.com/v1/apps/P123Example";
  assert.ok(config?.oauth);
  assert.equal(config.oauth.issuer, issuer);
  assert.equal(config.oauth.jwks.href, "https://api.descope.com/P123Example/.well-known/jwks.json");
  assert.equal(mcpConfig({ ...env, MCP_OAUTH_ALLOWED_SUBJECTS: "" }), null);
  assert.equal(mcpConfig({ ...env, MCP_OAUTH_ISSUER: "https://issuer.example" }), null);
  assert.equal(mcpConfig({
    ...env, MCP_OAUTH_ISSUER: "https://issuer.example", MCP_OAUTH_JWKS_URL: "https://issuer.example/jwks",
  })?.oauth?.issuer, "https://issuer.example");

  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const key = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  async function sign(audience: string | string[], subject: string, exp = "2m", tokenIssuer = issuer) {
    return new SignJWT({ scope: readScope }).setProtectedHeader({ alg: "RS256" })
      .setSubject(subject).setAudience(audience).setIssuer(tokenIssuer).setExpirationTime(exp).sign(privateKey);
  }
  const accessToken = await sign([issuer, config.resource.href], "member");
  assert.deepEqual(await verifyMcpToken(accessToken, config.resource, config, () => key),
    { actor: "mcp:oauth:member", scopes: [readScope] });
  for (const token of [
    await sign("https://other.example/api/mcp", "member"),
    await sign(config.resource.href, "unknown"),
    await sign(config.resource.href, "member", "-1m"),
    await sign(config.resource.href, "member", "2m", "https://other.example"),
  ]) assert.equal(await verifyMcpToken(token, config.resource, config, () => key), null);
});

test("stateless MCP advertises scoped tools and denies unauthorized calls and origins", async (t) => {
  const endpoint = new URL("http://127.0.0.1:3000/api/mcp");
  const secret = "this-is-an-isolated-testing-token-0001";
  const env = {
    NODE_ENV: "development",
    MCP_SERVER_URL: endpoint.href,
    MCP_AUTH_SECRET: secret,
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "unused-test-key",
  };
  const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const requests: string[] = [];
  const storyId = "456aa6ef-188a-40cd-859e-4fe68274b22b";
  const time = "2026-01-01T00:00:00+00:00";
  const domain = { code: "ai-ml", name: "AI & Machine Learning" };
  const story = {
    id: storyId, canonical_url: "https://example.test/story", title: "SDK test", summary: "A test",
    original_published_at: null, first_seen_at: time, last_updated_at: time, status: "source_reported",
    domain, story_domains: [{ is_primary: true, domain }],
    story_sources: [{
      id: "bfa93281-2677-4585-9040-b574cdf6d169", source_url: "https://example.test/story",
      source_title: "Test", published_at: null, retrieved_at: time, source_role: "submitted_reference",
      verification_status: "source_reported", source: { name: "Example" },
    }],
    research_papers: null,
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    requests.push(path);
    if (path.endsWith("/consume_mcp_quota")) return Response.json(true);
    if (path.endsWith("/upsert_intelligence_story")) return Response.json({
      story_id: storyId, operation: "inserted", status: "stored", replayed: false,
    });
    if (path.endsWith("/stories")) return Response.json([story]);
    if (path.endsWith("/audit_logs")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected test database request ${path}`);
  });

  async function connect(token?: string) {
    const client = new Client({ name: "intelligence-tests", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      fetch: (info, init) => handleMcp(new Request(info, init)),
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });
    await client.connect(transport);
    t.after(() => client.close());
    return client;
  }

  const anonymous = await connect();
  const tools = (await anonymous.listTools()).tools;
  assert.equal(tools.length, 2);
  assert.deepEqual(tools.find((tool) => tool.name === "upsert_story")?._meta?.securitySchemes, [{ type: "oauth2", scopes: [writeScope] }]);
  assert.equal((await anonymous.callTool({ name: "get_story", arguments: { story_id: storyId } })).isError, true);
  assert.deepEqual(requests, []);
  const invalidOrigin = await handleMcp(new Request(endpoint, { method: "POST", headers: { Origin: "https://evil.example" } }));
  assert.equal(invalidOrigin.status, 403);
  const invalidToken = await handleMcp(new Request(endpoint, { method: "POST", headers: { Authorization: "Bearer unknown" } }));
  assert.equal(invalidToken.status, 401);
  const largeBody = await handleMcp(new Request(endpoint, {
    method: "POST",
    body: " ".repeat(65_537),
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
  }));
  assert.equal(largeBody.status, 413);
  const authorized = await connect(secret);
  const upsert = await authorized.callTool({
    name: "upsert_story",
    arguments: {
      canonical_url: "https://example.test/story", title: "SDK test", summary: "A test",
      domains: ["ai-ml"], idempotency_key: "mcp-test-key",
      source_records: [{ source_name: "Example", source_url: "https://example.test/story", source_title: "Test" }],
    },
  });
  assert.deepEqual(upsert.structuredContent, { story_id: storyId, operation: "inserted", status: "stored", replayed: false });
  const read = await authorized.callTool({ name: "get_story", arguments: { story_id: storyId } });
  assert.deepEqual(read.structuredContent, { story });
  assert.deepEqual(requests, [
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/upsert_intelligence_story",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/stories", "/rest/v1/audit_logs",
  ]);
});
