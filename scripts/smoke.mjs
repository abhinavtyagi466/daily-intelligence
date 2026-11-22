import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "playwright";

function localUrl(value, name) {
  const url = new URL(value);
  assert(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `${name} must use loopback HTTP`);
  return url;
}

const endpoint = localUrl(process.env.MCP_SERVER_URL, "MCP_SERVER_URL");
localUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
const { SMOKE_EMAIL: email, SMOKE_PASSWORD: password, MCP_AUTH_SECRET: secret, SMOKE_BROWSER_CHANNEL: channel } = process.env;
assert(email && password && secret, "Set SMOKE_EMAIL, SMOKE_PASSWORD and MCP_AUTH_SECRET for the local test.");

const browser = await chromium.launch(channel ? { channel } : {});
const client = new Client({ name: "intelligence-os-smoke", version: "0.1.0" });
const page = await browser.newPage();
try {
  await page.goto(endpoint.origin);
  await page.waitForURL("**/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Command Center", exact: true }).waitFor();

  await page.getByRole("button", { name: "Run Research Now" }).click();
  await page.locator(".run-message").filter({ hasText: /Added \d+ new stories from Crossref|No new stories/ })
    .waitFor({ timeout: 75_000 });
  await page.getByRole("link", { name: "Research Library", exact: true }).click();
  const paperLink = page.locator(".feed h3 a").first();
  await paperLink.waitFor();
  const storyId = (await paperLink.getAttribute("href")).split("/").at(-1);

  await client.connect(new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${secret}` } },
  }));
  const fetched = await client.callTool({ name: "get_story", arguments: { story_id: storyId } });
  assert(!fetched.isError, JSON.stringify(fetched.content));
  assert(fetched.structuredContent.story.research_papers.doi);
  assert(fetched.structuredContent.story.story_sources.some((source) => source.source.name === "Crossref"));

  const title = "Crossref REST API documentation";
  const sourceUrl = "https://www.crossref.org/documentation/retrieve-metadata/rest-api/";
  const args = {
    canonical_url: sourceUrl,
    title,
    summary: "Crossref documents how to retrieve bibliographic metadata using its REST API.",
    domains: ["computing"],
    source_records: [{ source_name: "Crossref documentation", source_url: sourceUrl, source_title: title }],
    idempotency_key: randomUUID(),
  };
  const written = await client.callTool({ name: "upsert_story", arguments: args });
  assert(!written.isError, JSON.stringify(written.content));
  const repeat = await client.callTool({ name: "upsert_story", arguments: args });
  assert.equal(repeat.structuredContent.story_id, written.structuredContent.story_id);
  assert.equal(repeat.structuredContent.replayed, true);
  await page.goto(new URL(`/stories/${written.structuredContent.story_id}`, endpoint).href);
  await page.getByRole("heading", { name: title, level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Source records", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  console.log("Passed browser login, live Crossref ingestion, MCP read/write, idempotency, dashboard display and sign-out.");
} finally {
  await client.close();
  await browser.close();
}
