import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { marketGuide } from "../src/lib/market-guide";
import { patternSnapshot } from "../src/lib/pattern-schema";
import { storyTodayLabel, workspaceDay } from "../src/lib/workspace-date";
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
  for (const version of [
    "20261122000100_persistence", "20261122000200_persistence_operations", "20261122000300_research_workspace",
    "20261122000400_ai_tracker", "20261122000500_ai_patterns",
    "20261123000100_story_connections",
    "20261126000100_mcp_record_deletion",
  ]) {
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

test("AI job metadata persists with the story, is searchable by skill, and tracks closure", async () => {
  const aiJob = {
    ...fixture, canonical_url: "https://example.org/careers/ai-engineer", title: "AI Engineer",
    summary: "Build inference tooling.",
    ai_profile: {
      kind: "job",
      job: {
        company: "Example Labs", location: "Bengaluru", skills: ["Python", "PyTorch"],
        requirements: ["Deploy models in production"],
        apply_url: "https://example.org/careers/ai-engineer", status: "listed",
      },
    },
  };
  const sql = "select public.upsert_ai_story($1, 'test:mcp', $2) as result";
  const query = "select title, kind from public.search_ai_intelligence('PyTorch', '{}', null, null, 10, 'job')";
  await db.exec("set role service_role");
  try {
    const { rows: [{ result: saved }] } = await db.query<{ result: WriteResult }>(sql, [JSON.stringify(aiJob), "ai-job-key"]);
    assert.equal(saved.operation, "inserted");
    assert.deepEqual((await db.query(sql, [JSON.stringify(aiJob), "ai-job-key"])).rows[0], { result: { ...saved, replayed: true } });
    await assert.rejects(db.query(sql, [JSON.stringify({
      ...aiJob, ai_profile: { ...aiJob.ai_profile, job: { ...aiJob.ai_profile.job, skills: ["JAX"] } },
    }), "ai-job-key"]), /Idempotency key/);
    assert.deepEqual((await db.query(query)).rows, [{ title: "AI Engineer", kind: "job" }]);
    assert.deepEqual((await db.query("select public.get_ai_workspace_snapshot(7) as snapshot")).rows[0], {
      snapshot: { counts: { job: 1, paper: 1 }, skills: [{ name: "Python", count: 1 }, { name: "PyTorch", count: 1 }] },
    });
    await db.query(sql, [JSON.stringify({
      ...aiJob, ai_profile: { ...aiJob.ai_profile, job: { ...aiJob.ai_profile.job, status: "closed" } },
    }), "ai-job-closed"]);
    assert.equal((await db.query(query)).rows.length, 0);
    await db.query(sql, [JSON.stringify({ ...aiJob, ai_profile: { kind: "technology", docs_url: "https://example.org/docs" } }), "ai-kind-update"]);
    await write({ ...aiJob, ai_profile: undefined }, "legacy-edits-ai-story");
    assert.deepEqual((await db.query("select intelligence_kind from stories where id = $1", [saved.story_id])).rows[0], { intelligence_kind: "technology" });
    await assert.rejects(db.query(sql, [JSON.stringify({
      ...aiJob, canonical_url: "https://example.org/invalid-ai", ai_profile: { kind: "invalid" },
    }), "invalid-ai"]), /check constraint/);
    assert.equal((await db.query("select id from stories where canonical_url = 'https://example.org/invalid-ai'")).rows.length, 0);
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    assert.deepEqual((await db.query("select public.get_ai_workspace_snapshot(7) as snapshot")).rows[0], {
      snapshot: { counts: {}, skills: [] },
    });
    await assert.rejects(db.query(sql, [JSON.stringify(aiJob), "blocked-ai-job"]), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("patterns compare equal IST periods and deduplicate tags with keyword matches", async () => {
  const { rows: [{ today }] } = await db.query<{ today: string }>("select (now() at time zone 'Asia/Kolkata')::date::text as today");
  const start = Date.parse(today);
  const definitions = [
    { offset: 7, title: "Early AI agent tooling", profile: null },
    { offset: 6, title: "Agentic AI experiments", profile: { kind: "trend", topics: ["AI Agents", "agentic AI"] } },
    { offset: 0, title: "Agent workflow benchmark", profile: { kind: "paper", topics: ["agents"] } },
    { offset: 1, title: "MCP runtime release", profile: { kind: "technology" } },
    { offset: 2, title: "A shift in orchestration", profile: { kind: "trend", topics: ["Agents"] } },
    { offset: 3, title: "Unrelated singleton example", profile: { kind: "trend", topics: ["Unrelated singleton"] } },
    { offset: 14, title: "Outside the comparison window for AI agents", profile: null },
  ];
  await db.exec("set role service_role");
  try {
    for (const [index, definition] of definitions.entries()) {
      const day = new Date(start - definition.offset * 86_400_000).toISOString().slice(0, 10);
      const entry = {
        ...fixture, canonical_url: `https://example.org/patterns/${index}`, title: definition.title,
        published_at: `${day}T00:00:00+05:30`, summary: "Saved research evidence.",
      };
      if (definition.profile) {
        await db.query("select public.upsert_ai_story($1, 'test:mcp', $2)", [
          JSON.stringify({ ...entry, ai_profile: definition.profile }), `pattern-${index}`,
        ]);
      } else {
        await write(entry, `pattern-${index}`);
      }
    }
  } finally {
    await db.exec("reset role");
  }

  const read = async () => patternSnapshot.parse((await db.query<{ result: unknown }>(
    "select public.get_ai_patterns(7) as result",
  )).rows[0].result);
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);
    const report = await read();
    const agents = report.patterns.find((pattern) => pattern.label === "AI agents");
    assert.ok(agents);
    assert.equal(report.current.through, today);
    assert.equal(report.previous.through, new Date(start - 7 * 86_400_000).toISOString().slice(0, 10));
    assert.equal(agents.current_count, 4);
    assert.equal(agents.previous_count, 1);
    assert.equal(agents.evidence.length, 3);
    assert.ok(agents.evidence.every(({ is_current, canonical_url }) => is_current && canonical_url.startsWith("https://example.org/patterns/")));
    assert.equal(report.patterns.some(({ label }) => label === "Unrelated singleton"), false);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    assert.deepEqual((await read()).patterns, []);
  } finally {
    await db.exec("reset role");
  }
});

test("connected patterns keep shared topics, citations, and attributed relationships distinct", async () => {
  const earlierUrl = "https://example.org/connected/earlier";
  const dated = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
  const topics = ["Edge testing", "Release observability"];
  const save = async (title: string, url: string, published_at: string, source_url: string) => {
    const input = { ...fixture, title, canonical_url: url, published_at, summary: "Connection fixture",
      ai_profile: { kind: "trend", topics }, source_records: [{ ...fixture.source_records[0], source_url }] };
    return (await db.query<{ result: WriteResult }>("select public.upsert_ai_story($1, 'test:mcp', null) as result",
      [JSON.stringify(input)])).rows[0].result.story_id;
  };
  const relationSql = "select public.save_story_connection($1, $2, $3, $4, 'test:mcp') as result";
  const patternSql = "select public.get_ai_patterns(7) as result";
  await db.exec("set role service_role");
  try {
    const earlier = await save("Earlier release", earlierUrl, dated(1), earlierUrl);
    const later = await save("Later announcement", "https://example.org/connected/later", dated(0), earlierUrl);
    const cited = await save("Separate coverage", "https://example.org/connected/coverage", dated(0), earlierUrl);
    const parameters = [earlier, later, "https://example.org/connected/source", "The release notes attribute the change to the earlier release."];
    assert.deepEqual((await db.query(relationSql, parameters)).rows[0], {
      result: { earlier_story_id: earlier, later_story_id: later, changed: true },
    });
    assert.deepEqual((await db.query(relationSql, parameters)).rows[0], {
      result: { earlier_story_id: earlier, later_story_id: later, changed: false },
    });
    await assert.rejects(db.query(relationSql, [later, earlier, ...parameters.slice(2)]), /chronological order/);
    const report = patternSnapshot.parse((await db.query<{ result: unknown }>(patternSql)).rows[0].result);
    const pair = report.topic_connections?.find(({ left_topic, right_topic }) => left_topic === topics[0] && right_topic === topics[1]);
    assert.equal(pair?.current_count, 3);
    assert.equal(pair?.evidence.length, 3);
    const links = report.story_connections?.filter(({ earlier: story }) => story.id === earlier);
    assert.deepEqual(links?.map(({ later: story, relationship }) => [story.id, relationship]), [
      [later, "source_attributed"], [cited, "cites"],
    ]);
    const compact = patternSnapshot.parse((await db.query<{ result: unknown }>("select public.get_ai_patterns(7, false) as result")).rows[0].result);
    assert.deepEqual(compact.topic_connections, []);
    assert.deepEqual(compact.story_connections, []);
    assert.ok(compact.patterns.length && compact.patterns.every(({ evidence }) => evidence.length === 0));
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nonMember]);
    const report = patternSnapshot.parse((await db.query<{ result: unknown }>(patternSql)).rows[0].result);
    assert.deepEqual(report.story_connections, []);
    assert.deepEqual(report.topic_connections, []);
  } finally {
    await db.exec("reset role");
  }
});

test("today follows the Kolkata calendar across the UTC date boundary", () => {
  assert.equal(workspaceDay("2026-11-22T18:29:59Z"), "2026-11-22");
  assert.equal(workspaceDay("2026-11-22T18:30:00Z"), "2026-11-23");
  const today = "2026-11-23";
  const firstSeen = "2026-11-22T18:31:00Z";
  assert.equal(storyTodayLabel("2026-11-22T18:30:00Z", firstSeen, today), "Published today");
  assert.equal(storyTodayLabel("2026-11-22T18:29:59Z", firstSeen, today), null);
  assert.equal(storyTodayLabel(null, firstSeen, today), "Added today");
  assert.equal(storyTodayLabel(null, "2026-11-22T18:29:59Z", today), null);
});

test("workspace record deletion previews, checks freshness, and removes only the confirmed record", async () => {
  const sql = "select public.mcp_workspace_delete($1, $2, $3, 'test:mcp', $4) as result";
  const remove = async (kind: string, id: string, revision: string | null = null, related: string | null = null) =>
    (await db.query<{ result: { status: string; revision?: string; dependents?: Record<string, number> } }>(
      sql, [kind, id, related, revision],
    )).rows[0].result;
  const target = {
    ...fixture,
    canonical_url: "https://example.org/delete-target",
    source_records: [{ ...fixture.source_records[0], source_name: "Delete test source", source_url: "https://example.org/delete-target" }],
  };
  await db.exec("set role service_role");
  try {
    const { story_id: id } = await write(target, "delete-story-key");
    const source = (await db.query<{ id: string; source_id: string }>("select id, source_id from story_sources where story_id = $1", [id])).rows[0];
    assert.equal((await remove("story_source", source.id)).status, "blocked");
    assert.equal((await remove("submitted_source", source.source_id)).status, "blocked");
    const before = await remove("story", id);
    assert.equal(before.status, "ready");
    assert.deepEqual(before.dependents, { source_links: 1, paper_metadata: 0, domain_assignments: 2, story_connections: 0 });
    assert.equal((await db.query("select id from stories where id = $1", [id])).rows.length, 1);
    await assert.rejects(db.query("delete from stories where id = $1", [id]), /permission denied/);
    const secondCitationUrl = "https://example.org/second-citation";
    const updatedTarget = {
      ...target,
      title: "Edited after preview",
      source_records: [
        ...target.source_records,
        { ...target.source_records[0], source_title: "Second citation", source_url: secondCitationUrl },
      ],
    };
    await write(updatedTarget, "edited-delete-story-key");
    assert.equal((await remove("story", id, before.revision)).status, "changed");
    const { rows: [secondCitation] } = await db.query<{ id: string }>(
      "select id from story_sources where story_id = $1 and source_url = $2", [id, secondCitationUrl],
    );
    const citationPreview = await remove("story_source", secondCitation.id);
    assert.equal((await remove("story_source", secondCitation.id, citationPreview.revision)).status, "deleted");
    const remainingCitations = await db.query<{ id: string }>("select id from story_sources where story_id = $1", [id]);
    assert.deepEqual(remainingCitations.rows, [{ id: source.id }]);
    await assert.rejects(write(updatedTarget, "edited-delete-story-key"), /Idempotency key/);
    const confirmed = await remove("story", id);
    assert.equal((await remove("story", id, confirmed.revision)).status, "deleted");
    assert.equal((await remove("story", id, confirmed.revision)).status, "not_found");
    assert.equal((await db.query("select id from story_sources where story_id = $1", [id])).rows.length, 0);
    await assert.rejects(write(target, "delete-story-key"), /Idempotency key/);
    const submitted = await remove("submitted_source", source.source_id);
    assert.equal((await remove("submitted_source", source.source_id, submitted.revision)).status, "deleted");
    const audit = await db.query<{ action: string }>("select action from audit_logs where resource_id = $1 and action = 'workspace.record_deleted'", [id]);
    assert.equal(audit.rows.length, 1);

    const { rows: [note] } = await db.query<{ id: string }>("select id from market_research where slug = $1", [marketGuide.slug]);
    const notePreview = await remove("market_research", note.id);
    assert.equal((await remove("market_research", note.id, notePreview.revision)).status, "deleted");
    assert.equal((await db.query("select id from market_research where id = $1", [note.id])).rows.length, 0);
    const { rows: [link] } = await db.query<{ earlier_story_id: string; later_story_id: string }>("select earlier_story_id, later_story_id from story_connections limit 1");
    const linkPreview = await remove("story_connection", link.earlier_story_id, null, link.later_story_id);
    assert.equal((await remove("story_connection", link.earlier_story_id, linkPreview.revision, link.later_story_id)).status, "deleted");
    assert.equal((await db.query("select id from stories where id = $1 or id = $2", [link.earlier_story_id, link.later_story_id])).rows.length, 2);
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role authenticated");
  try {
    await assert.rejects(remove("story", randomUUID()), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
