import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { marketGuide } from "../src/lib/market-guide";
import { workspaceAnalytics } from "../src/lib/research-schema";

const db = new PGlite();
const member = randomUUID();
const nonMember = randomUUID();
const fixture = {
  canonical_url: "https://example.org/test-record",
  title: "Persistence test record",
  summary: "Isolated SQL test fixture.",
  domains: ["ai-ml", "computing"],
  source_records: [{
    source_name: "Test publisher",
    source_origin: "https://example.org",
    source_url: "https://example.org/test-record",
    source_title: "Persistence test reference",
  }],
};

type WriteResult = { story_id: string; operation: string; replayed: boolean };

async function write(story: object, key = "test-key") {
  const { rows } = await db.query<{ result: WriteResult }>(
    "select public.upsert_intelligence_story($1::jsonb, $2, $3) as result",
    [JSON.stringify(story), "test:mcp", key],
  );
  return rows[0].result;
}

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
  `);
  for (const version of ["20261122000100_persistence", "20261122000200_persistence_operations", "20261122000300_research_workspace"]) {
    await db.exec(await readFile(`supabase/migrations/${version}.sql`, "utf8"));
  }
  await db.query("insert into auth.users values ($1), ($2)", [member, nonMember]);
  await db.query("insert into intelligence_private.memberships values ($1, 'operator')", [member]);
});

after(() => db.close());

test("story, sources and audit are atomic, canonical and idempotent", async () => {
  await db.exec("set role service_role");
  try {
    const fresh = await write(fixture);
    assert.equal(fresh.operation, "inserted");
    assert.deepEqual(await write(fixture), { ...fresh, replayed: true });
    await assert.rejects(write({ ...fixture, title: "Other" }), /Idempotency key/);
    const updated = await write({ ...fixture, title: "Updated title", domains: ["computing"] }, "new-key");
    assert.equal(updated.operation, "updated");
    assert.equal(updated.story_id, fresh.story_id);

    const result = await db.query(`
      select (select count(*)::int from stories) as stories,
        (select count(*)::int from story_domains) as domains,
        (select count(*)::int from story_sources) as sources,
        (select count(*)::int from audit_logs) as audits
    `);
    assert.deepEqual(result.rows[0], { stories: 1, domains: 1, sources: 1, audits: 2 });
    await assert.rejects(write({
      ...fixture, canonical_url: "https://example.org/failed-write",
      source_records: [...fixture.source_records, { ...fixture.source_records[0], source_url: "invalid" }],
    }, "atomic-key"));
    assert.equal((await db.query("select id from stories where canonical_url like '%failed-write'")).rows.length, 0);
  } finally {
    await db.exec("reset role");
  }
});

test("authenticated workspace members read, and other roles cannot access the data or write RPC", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select id from stories"), /permission denied/);
    await assert.rejects(write(fixture), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    assert.equal((await db.query("select id from stories")).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);
    assert.equal((await db.query<{ role: string }>("select public.get_dashboard_role() as role")).rows[0]?.role, "operator");
    assert.equal((await db.query("select id from stories")).rows.length, 1);
    await assert.rejects(db.query("update stories set title = 'Denied'"), /permission denied/);
    await assert.rejects(db.query("select id from audit_logs"), /permission denied/);
    await assert.rejects(write(fixture), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("a Crossref article keeps its DOI, shared source and published data across ingestions", async () => {
  const article = {
    ...fixture,
    canonical_url: "https://doi.org/10.5555/test-persistence",
    published_at: "2026-03-16T00:00:00Z",
    source_records: [{
      source_name: "Crossref", source_origin: "https://api.crossref.org",
      source_url: "https://api.crossref.org/works/10.5555/test-persistence",
      source_title: "Isolated Crossref test fixture", published_at: "2026-03-16T00:00:00Z",
    }],
  };
  const paper = { doi: "10.5555/test-persistence", publication_type: "journal-article", authors: ["Test author"] };
  await db.exec("set role service_role");
  try {
    const parameters = [JSON.stringify(article), "test:operator", JSON.stringify(paper)];
    const sql = "select public.upsert_intelligence_story($1::jsonb, $2, null, $3::jsonb) as result";
    const first = (await db.query<{ result: WriteResult }>(sql, parameters)).rows[0].result;
    const second = (await db.query<{ result: WriteResult }>(sql, parameters)).rows[0].result;
    assert.equal(first.operation, "inserted");
    assert.equal(second.operation, "existing");
    assert.equal(second.story_id, first.story_id);
    const { rows } = await db.query(`
      select s.name, ss.source_role, rp.doi, rp.peer_review_status
      from story_sources ss join sources s on s.id = ss.source_id
      join research_papers rp on rp.story_id = ss.story_id where ss.story_id = $1
    `, [first.story_id]);
    assert.deepEqual(rows, [{ name: "Crossref", source_role: "citation_metadata", doi: paper.doi, peer_review_status: "unknown" }]);
  } finally {
    await db.exec("reset role");
  }
});

test("run locks, completion and per-actor MCP quota are persisted", async () => {
  await db.exec("set role service_role");
  try {
    const start = "select public.start_crossref_ingestion('test:operator') as id";
    const { rows: [run] } = await db.query<{ id: string }>(start);
    assert.match(run.id, /^[0-9a-f-]{36}$/);
    assert.equal((await db.query<{ id: string | null }>(start)).rows[0]?.id, null);
    await db.query("select public.finish_crossref_ingestion($1, 'test:operator', 'completed', 2, 1, 0, '[]')", [run.id]);
    assert.equal((await db.query<{ execution_status: string }>("select execution_status from ingestion_runs")).rows[0]?.execution_status, "completed");
    const { rows } = await db.query<{ last_successful_fetch: Date | null }>("select last_successful_fetch from sources where enabled");
    assert.ok(rows[0]?.last_successful_fetch);
    const quota = await db.query<{ allowed: boolean }>(
      "select public.consume_mcp_quota('test:quota') as allowed from generate_series(1, 61)",
    );
    assert.equal(quota.rows.filter(({ allowed }) => allowed).length, 60);
  } finally {
    await db.exec("reset role");
  }
});

test("market methodologies save once per change and are visible only to workspace members", async () => {
  const sql = "select public.save_market_research($1, 'test:mcp') as result";
  const input = [JSON.stringify(marketGuide)];
  await db.exec("set role service_role");
  try {
    const created = (await db.query<{ result: { research_id: string; slug: string; changed: boolean } }>(sql, input)).rows[0].result;
    assert.equal(created.changed, true);
    assert.deepEqual((await db.query(sql, input)).rows[0], { result: { ...created, changed: false } });
    const updated = {
      ...marketGuide, title: "Updated methodology",
      content: {
        ...marketGuide.content,
        measurements: [{
          label: "Test measurements", unit: "Units", coverage: "Fixture model and channel",
          source_url: "https://example.org/test-record",
          points: [{ date: "2026-03-16", value: 10 }, { date: "2026-03-22", value: 13 }],
        }],
      },
    };
    assert.deepEqual((await db.query(sql, [JSON.stringify(updated)])).rows[0], { result: created });
    assert.deepEqual((await db.query("select content->'measurements' as measurements from market_research")).rows[0], {
      measurements: updated.content.measurements,
    });
    assert.deepEqual((await db.query("select count(*)::int as count from audit_logs where action = 'market_research.saved'")).rows[0], { count: 2 });
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    assert.equal((await db.query("select slug from market_research")).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);
    assert.deepEqual((await db.query("select title from market_research")).rows, [{ title: "Updated methodology" }]);
    await assert.rejects(db.query(sql, input), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("activity counts and filtered keyword results respect membership and Kolkata dates", async () => {
  const readAnalytics = async () => workspaceAnalytics.parse((await db.query<{ result: unknown }>(
    "select public.get_workspace_analytics(7) as result",
  )).rows[0].result);
  const search = `select title, primary_domain, source_count from public.search_intelligence('isolated', array['computing'], '2026-03-16', '2026-03-16')`;
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);
    const analytics = await readAnalytics();
    assert.equal(analytics.daily.length, 7);
    assert.equal(analytics.daily.at(-1)?.count, 2);
    assert.equal(analytics.domains.reduce((sum, { count }) => sum + count, 0), 2);
    assert.deepEqual((await db.query(search)).rows, [
      { title: fixture.title, primary_domain: "ai-ml", source_count: 1 },
    ]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    assert.equal((await readAnalytics()).daily.some(({ count }) => count !== 0), false);
    assert.equal((await db.query(search)).rows.length, 0);
  } finally {
    await db.exec("reset role");
  }
});
