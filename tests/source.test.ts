import assert from "node:assert/strict";
import { test } from "node:test";
import { crossref } from "../src/lib/ingestion/crossref";
import { canonicalUrl, storyUpsertInput } from "../src/lib/story-schema";

test("normalizes Crossref metadata while preserving a resolvable DOI and source link", () => {
  const { story, paper } = crossref.normalize({
    DOI: "10.1162/TACL.A.643",
    title: ["Accelerating Language Model Workflows with <scp>Prompt Choreography</scp>"],
    type: "journal-article",
    published: { "date-parts": [[2026, 3, 16]] },
    author: [{ given: "Author", family: "Name" }],
  });
  assert.equal(story.title, "Accelerating Language Model Workflows with Prompt Choreography");
  assert.equal(story.canonical_url, "https://doi.org/10.1162/tacl.a.643");
  assert.equal(story.source_records[0].source_url, "https://api.crossref.org/works/10.1162/tacl.a.643");
  assert.equal(story.published_at, "2026-03-16T00:00:00.000Z");
  assert.deepEqual(paper.authors, ["Author Name"]);
});

test("normalizes optional transport noise and rejects incomplete or unsafe story inputs", () => {
  assert.equal(canonicalUrl("https://dx.doi.org/10.1162/TACL.A.643?utm_source=example#section"), "https://doi.org/10.1162/tacl.a.643");
  assert.equal(canonicalUrl("https://example.org/report?version=2&utm_campaign=test#chapter"), "https://example.org/report?version=2");
  assert.equal(storyUpsertInput.safeParse({
    canonical_url: "https://example.org/report",
    title: "Example",
    summary: "Example",
    domains: ["ai-ml", "ai-ml"],
    source_records: [{ source_name: "Example", source_url: "javascript:alert(1)", source_title: "example" }],
    idempotency_key: "test-key",
  }).success, false);
  assert.throws(() => crossref.normalize({ DOI: "invalid", title: ["Example"] }));
});
