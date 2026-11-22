import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { GET as claudeMetadata, OPTIONS as claudeMetadataOptions } from "../src/app/.well-known/oauth-protected-resource/api/mcp/claude/route";
import { OPTIONS as mcpMetadataOptions } from "../src/app/.well-known/oauth-protected-resource/api/mcp/route";
import { OPTIONS as rootMetadataOptions } from "../src/app/.well-known/oauth-protected-resource/route";
import { bearerChallenge, mcpConfig, readScope, verifyMcpToken, writeScope } from "../src/lib/mcp/auth";
import { handleClaudeMcp, handleMcp } from "../src/lib/mcp/handler";
import { marketGuide } from "../src/lib/market-guide";
import { patternReport } from "../src/lib/pattern-schema";
import { briefingResult } from "../src/lib/research-schema";
import { upsertResult } from "../src/lib/story-schema";

test("OAuth metadata routes accept a browser preflight", () => {
  for (const options of [rootMetadataOptions, mcpMetadataOptions, claudeMetadataOptions]) {
    const response = options();
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /\bGET\b/);
    assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /\bMCP-Protocol-Version\b/);
  }
});

test("Claude connector challenges over HTTP and checks token audience and tool scope", async (t) => {
  const endpoint = "https://intelligence.example/api/mcp/claude";
  const issuer = "https://claude-issuer.example";
  const jwks = `${issuer}/jwks`;
  const env = {
    MCP_SERVER_URL: "https://intelligence.example/api/mcp",
    MCP_CLAUDE_OAUTH_ISSUER: issuer, MCP_CLAUDE_OAUTH_JWKS_URL: jwks,
    MCP_OAUTH_ALLOWED_SUBJECTS: "member",
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture-db.example", SUPABASE_SECRET_KEY: "fixture-service-key",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const requests: string[] = [];
  const snapshot = {
    current: { from: "2026-11-16", through: "2026-11-22", stories: 2 },
    previous: { from: "2026-11-09", through: "2026-11-15", stories: 1 },
    patterns: [{ label: "AI agents", current_count: 2, previous_count: 1, evidence: [] }],
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.href === jwks) return Response.json({ keys: [{ ...await exportJWK(publicKey), kid: "fixture-key" }] });
    requests.push(url.pathname);
    if (url.pathname.endsWith("/consume_mcp_quota")) return Response.json(true);
    if (url.pathname.endsWith("/get_ai_patterns")) return Response.json(snapshot);
    if (url.pathname.endsWith("/audit_logs")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected test path ${url.pathname}`);
  });

  async function sign(audience: string) {
    return new SignJWT({ scope: readScope }).setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
      .setSubject("member").setIssuer(issuer).setAudience(audience).setExpirationTime("1m").sign(privateKey);
  }
  function call(name: string, token?: string) {
    const headers = { Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return handleClaudeMcp(new Request(endpoint, {
      method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }),
    }));
  }

  const metadata = await claudeMetadata().json();
  assert.equal(metadata.resource, endpoint);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  const discover = new Client({ name: "claude-connector-test", version: "1.0.0" });
  t.after(() => discover.close());
  await discover.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: (info, init) => handleClaudeMcp(new Request(info, init)),
  }));
  assert.ok((await discover.listTools()).tools.some(({ name }) => name === "get_ai_patterns"));
  const denied = await call("get_ai_patterns");
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("WWW-Authenticate") ?? "", /resource_metadata="https:\/\/intelligence\.example\/\.well-known\/oauth-protected-resource\/api\/mcp\/claude"/);
  assert.match(denied.headers.get("WWW-Authenticate") ?? "", /scope="intelligence:read"/);
  const readToken = await sign(endpoint);
  const writeDenied = await call("upsert_story", readToken);
  assert.equal(writeDenied.status, 403);
  assert.match(writeDenied.headers.get("WWW-Authenticate") ?? "", /scope="intelligence:write"/);
  assert.equal((await call("get_ai_patterns", await sign(env.MCP_SERVER_URL))).status, 401);
  assert.deepEqual(requests, []);
  const succeeded = await call("get_ai_patterns", readToken);
  assert.equal(succeeded.status, 200);
  const parsed = patternReport.parse((await succeeded.json()).result.structuredContent);
  assert.deepEqual(parsed.summary, ["Coverage of AI agents rose from 1 to 2 saved updates."]);
  assert.deepEqual(requests, ["/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/get_ai_patterns", "/rest/v1/audit_logs"]);
});

test("Descope OAuth validates resource audience, issuer, expiration and the subject allowlist", async () => {
  const env = {
    NODE_ENV: "production" as const,
    MCP_SERVER_URL: "https://intelligence.example/api/mcp",
    DESCOPE_PROJECT_ID: "P123Example",
    MCP_OAUTH_ALLOWED_SUBJECTS: "member",
  };
  const config = mcpConfig(env);
  const issuer = "https://api.descope.com/v1/apps/P123Example";
  assert.ok(config?.oauth);
  assert.equal(config.oauth.issuer, issuer);
  assert.equal(config.oauth.jwks.href, "https://api.descope.com/P123Example/.well-known/jwks.json");
  assert.equal(
    bearerChallenge(config, "insufficient_scope", readScope),
    'Bearer resource_metadata="https://intelligence.example/.well-known/oauth-protected-resource/api/mcp", scope="intelligence:read", error="insufficient_scope", error_description="Sign in and grant the requested permission."',
  );
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
  const research = { ...marketGuide, id: storyId, created_at: time, updated_at: time };
  const searchHit = {
    story_id: storyId, title: story.title, summary: story.summary, canonical_url: story.canonical_url,
    published_at: null, first_seen_at: time, primary_domain: domain.code, source_count: 1,
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    requests.push(path);
    if (path.endsWith("/consume_mcp_quota")) return Response.json(true);
    if (path.endsWith("/upsert_intelligence_story") || path.endsWith("/upsert_ai_story")) return Response.json({
      story_id: storyId, operation: "inserted", status: "stored", replayed: false,
    });
    if (path.endsWith("/stories")) return Response.json([story]);
    if (path.endsWith("/search_ai_intelligence")) {
      const body = input instanceof Request ? await input.json() : JSON.parse(String(init?.body));
      return Response.json(body.p_kind === "job" ? [{ ...searchHit, kind: "job" }] : []);
    }
    if (path.endsWith("/save_market_research")) return Response.json({ research_id: storyId, slug: marketGuide.slug, changed: true });
    if (path.endsWith("/market_research")) return Response.json([research]);
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
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "get_ai_patterns", "get_daily_briefing", "get_market_research", "get_story", "get_system_status", "list_market_research",
    "save_market_research", "search_intelligence", "upsert_story",
  ]);
  for (const tool of tools) {
    const scope = ["save_market_research", "upsert_story"].includes(tool.name) ? writeScope : readScope;
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: "oauth2", scopes: [scope] }]);
  }
  const unauthorized = await anonymous.callTool({ name: "get_story", arguments: { story_id: storyId } });
  assert.equal(unauthorized.isError, true);
  assert.deepEqual(unauthorized._meta?.["mcp/www_authenticate"], [
    'Bearer error="insufficient_scope", error_description="Sign in and grant the requested permission."',
  ]);
  assert.equal((await anonymous.callTool({ name: "save_market_research", arguments: marketGuide })).isError, true);
  assert.deepEqual(requests, []);
  const invalidOrigin = await handleMcp(new Request(endpoint, { method: "POST", headers: { Origin: "https://evil.example" } }));
  assert.equal(invalidOrigin.status, 403);
  const invalidToken = await handleMcp(new Request(endpoint, { method: "POST", headers: { Authorization: "Bearer unknown" } }));
  assert.equal(invalidToken.status, 401);
  assert.equal(invalidToken.headers.get("WWW-Authenticate"),
    'Bearer error="invalid_token", error_description="The access token is invalid or expired."');
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
  const classified = await authorized.callTool({
    name: "upsert_story",
    arguments: {
      canonical_url: "https://example.test/careers/engineer", title: "SDK test job", summary: "A job test",
      domains: ["ai-ml"], idempotency_key: "mcp-ai-job-test",
      source_records: [{ source_name: "Example", source_url: "https://example.test/careers/engineer", source_title: "Test job" }],
      ai_profile: {
        kind: "job",
        job: { company: "Example", requirements: ["Build model evaluation tools"], skills: ["Python"], apply_url: "https://example.test/careers/engineer" },
      },
    },
  });
  assert.equal(upsertResult.parse(classified.structuredContent).story_id, storyId);
  const search = await authorized.callTool({ name: "search_intelligence", arguments: { query: "Python", kind: "job" } });
  assert.deepEqual(search.structuredContent, { results: [{ ...searchHit, kind: "job" }] });
  const response = await authorized.callTool({ name: "get_daily_briefing", arguments: { days: 1 } });
  const briefing = briefingResult.parse(response.structuredContent);
  assert.equal(briefing.since, briefing.through);
  assert.deepEqual(briefing.jobs, [{ ...searchHit, kind: "job" }]);
  assert.deepEqual(briefing.papers, []);
  const saved = await authorized.callTool({ name: "save_market_research", arguments: marketGuide });
  assert.deepEqual(saved.structuredContent, { research_id: storyId, slug: marketGuide.slug, changed: true });
  const note = await authorized.callTool({ name: "get_market_research", arguments: { slug: marketGuide.slug } });
  assert.deepEqual(note.structuredContent, { entry: research });
  assert.deepEqual(requests, [
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/upsert_intelligence_story",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/stories", "/rest/v1/audit_logs",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/upsert_ai_story",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/search_ai_intelligence", "/rest/v1/audit_logs",
    "/rest/v1/rpc/consume_mcp_quota",
    ...Array.from({ length: 4 }, () => "/rest/v1/rpc/search_ai_intelligence"), "/rest/v1/audit_logs",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/rpc/save_market_research",
    "/rest/v1/rpc/consume_mcp_quota", "/rest/v1/market_research", "/rest/v1/audit_logs",
  ]);
});
