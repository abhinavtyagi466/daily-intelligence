import "server-only";

import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { storyInput, type StoryInput } from "../story-schema";
import type { ResearchPaper } from "../stories";

type DateWindow = { startDate: string; endDate: string; cursor?: string };
type SourcePage = { items: unknown[]; cursor?: string };

export interface SourceAdapter {
  fetchUpdates(input: DateWindow): Promise<SourcePage>;
  normalize(record: unknown): { story: StoryInput; paper: ResearchPaper };
}

const worksEndpoint = "https://api.crossref.org/journals/2307-387X/works";
const pageSize = 6;
const works = z.object({
  message: z.object({ items: z.array(z.unknown()).max(pageSize), "next-cursor": z.string().max(8192).optional() }),
});
const work = z.object({
  DOI: z.string().max(512).regex(/^10\.\d{4,9}\/[^\s\u0000-\u001f]+$/i),
  title: z.array(z.string().max(10_000)).min(1),
  published: z.object({ "date-parts": z.array(z.array(z.number().int()).min(1).max(3)).min(1) }).optional(),
  "container-title": z.array(z.string()).optional(),
  author: z.array(z.object({ given: z.string().optional(), family: z.string().optional(), name: z.string().optional() })).optional(),
  type: z.literal("journal-article"),
});

function plainText(text: string) {
  return text.replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&#39;": "'",
    })[match] ?? match)
    .replace(/\s+/g, " ").trim();
}

function publicationDate(parts: number[] | undefined) {
  if (!parts || parts.length !== 3) return undefined;
  const [year, month, day] = parts;
  if (year < 1600 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? date.toISOString() : undefined;
}

export const crossref: SourceAdapter = {
  async fetchUpdates({ startDate, endDate, cursor = "*" }) {
    const url = new URL(worksEndpoint);
    url.searchParams.set("filter", `type:journal-article,from-pub-date:${startDate},until-pub-date:${endDate}`);
    url.searchParams.set("sort", "indexed");
    url.searchParams.set("order", "desc");
    url.searchParams.set("rows", String(pageSize));
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("select", "DOI,title,published,URL,container-title,author,type");
    const contact = process.env.CROSSREF_CONTACT_EMAIL;
    if (contact) url.searchParams.set("mailto", contact);

    const request = () => fetch(url, {
      cache: "no-store", redirect: "error", headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    let response = await request().catch(() => null);
    if (!response || response.status === 429 || response.status >= 500) {
      const retryAfter = response?.headers.get("Retry-After");
      const seconds = retryAfter ? Number(retryAfter) : 1;
      if (!Number.isFinite(seconds) || seconds > 3) throw new Error("Crossref asked to retry later");
      await response?.body?.cancel();
      await delay(Math.max(seconds, 1) * 1000);
      response = await request();
    }
    if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}`);
    const { message } = works.parse(await response.json());
    const next = message["next-cursor"];
    return { items: message.items, cursor: message.items.length === pageSize ? next : undefined };
  },

  normalize(record) {
    const data = work.parse(record);
    const doi = data.DOI.toLowerCase();
    const doiPath = doi.split("/").map(encodeURIComponent).join("/");
    const title = plainText(data.title[0]);
    const publication = plainText(data["container-title"]?.[0] ?? "") || "Transactions of the Association for Computational Linguistics";
    const publishedAt = publicationDate(data.published?.["date-parts"][0]);
    const authors = (data.author ?? []).map(({ given, family, name }) =>
      plainText(name ?? [given, family].filter(Boolean).join(" "))).filter(Boolean);

    return {
      story: storyInput.parse({
        canonical_url: `https://doi.org/${doiPath}`,
        title,
        summary: `Crossref indexes this journal article in ${publication}. DOI ${doi}.`,
        published_at: publishedAt,
        domains: ["ai-ml"],
        source_records: [{
          source_name: "Crossref", source_url: `https://api.crossref.org/works/${doiPath}`,
          source_title: title, published_at: publishedAt,
        }],
      }),
      paper: { doi, authors, publication_type: data.type },
    };
  },
};
