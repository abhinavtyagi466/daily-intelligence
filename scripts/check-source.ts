import assert from "node:assert/strict";
import { crossref } from "../src/lib/ingestion/crossref";

async function checkSource() {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86_400_000);
  const window = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  const first = await crossref.fetchUpdates(window);
  assert(first.items.length, "Crossref returned no records in the selected date range.");
  const normalized = first.items.map(crossref.normalize);
  const second = first.cursor ? await crossref.fetchUpdates({ ...window, cursor: first.cursor }) : null;
  for (const record of [...normalized, ...(second?.items.map(crossref.normalize) ?? [])]) {
    process.stdout.write(`${record.paper.doi}  ${record.story.title}\n`);
  }
}

void checkSource();
