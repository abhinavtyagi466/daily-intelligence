import { z } from "zod";
import type { View } from "../components/dashboard-shell";

const pageContent = z.object({
  path: z.string(),
  sections: z.array(z.string()),
  read_tools: z.array(z.string()),
  write_tools: z.array(z.string()),
  workflow: z.string(),
});

const dashboardPages = {
  overview: {
    path: "/",
    sections: ["Category totals", "AI coverage briefing", "Latest updates", "Reading priorities", "Activity by day", "Skills by frequency", "Ingestion status"],
    read_tools: ["get_workspace_overview"],
    write_tools: ["save_ai_update", "upsert_story", "run_crossref_ingestion"],
    workflow: "Save sourced updates in their categories. The Command Center calculates all counts, graphs and reading priorities. Run Crossref when asked to fetch indexed papers.",
  },
  trends: {
    path: "/?view=trends",
    sections: ["Trends in tracked coverage", "AI trend cards", "Topics", "Implications", "What to watch next", "Sources"],
    read_tools: ["get_ai_patterns", "search_intelligence", "get_story"],
    write_tools: ["save_ai_update"],
    workflow: "Use ai_profile.kind=trend. Add a sourced summary, topics, why_it_matters and watch_next when supported.",
  },
  patterns: {
    path: "/?view=patterns",
    sections: ["Period comparison", "Topic counts", "Shared coverage", "Citations", "Source-attributed links", "Supporting updates"],
    read_tools: ["get_ai_patterns", "get_story"],
    write_tools: ["upsert_story", "save_story_connection"],
    workflow: "Topic counts and shared coverage derive from saved updates. Use save_story_connection after both stories are saved and an original source explicitly supports the directional relationship. Apply Supabase migration 20261123000100 for connected patterns.",
  },
  technologies: {
    path: "/?view=technologies",
    sections: ["Release cards", "Topics", "Announcement", "Documentation", "Implications"],
    read_tools: ["search_intelligence", "get_story"],
    write_tools: ["save_ai_update"],
    workflow: "Use ai_profile.kind=technology. Link the original release and put official documentation in docs_url.",
  },
  jobs: {
    path: "/?view=jobs",
    sections: ["Open role cards", "Employer", "Location", "Experience", "Requirements", "Skills", "Application link", "Listing status", "Last checked"],
    read_tools: ["search_intelligence", "get_story"],
    write_tools: ["save_ai_update"],
    workflow: "Use ai_profile.kind=job. Record requirements from the employer listing, the direct application link, and checked_on if checked. Update the same canonical URL with status=closed when the employer confirms closure.",
  },
  papers: {
    path: "/?view=papers",
    sections: ["Paper cards", "Original paper", "Code", "DOI", "Authors", "Venue", "Publication type", "Review status", "Reading focus"],
    read_tools: ["search_intelligence", "get_story"],
    write_tools: ["save_ai_update", "run_crossref_ingestion"],
    workflow: "Use ai_profile.kind=paper and its paper object for supported bibliographic fields. For new papers use the DOI link as canonical_url when known. For edits reuse the saved canonical URL. Add code_url and reading_focus when available and use unknown review status when evidence is unavailable.",
  },
  stories: {
    path: "/?view=stories",
    sections: ["All updates", "Search", "Category and date", "Source links", "Published today and Added today labels"],
    read_tools: ["search_intelligence", "get_story"],
    write_tools: ["upsert_story"],
    workflow: "Use one canonical HTTPS URL per update and cite at least one source. To edit a story, read it first and save the full updated payload using its same canonical URL and a new idempotency key. The green Published today badge follows IST publication date. Updates saved today with an unknown publication date show Added today.",
  },
  research: {
    path: "/?view=research",
    sections: ["Saved methodologies", "Signals", "Scenarios", "Limitations", "Measurement charts", "References", "Built-in guide"],
    read_tools: ["list_market_research", "get_market_research"],
    write_tools: ["save_market_research"],
    workflow: "Use a stable slug and submit methodology, scenarios, limitations and cited dated measurements. Charts render from supplied points. The built-in guide is maintained in application code.",
  },
  sources: {
    path: "/?view=sources",
    sections: ["Source name and origin", "Active feed or submitted reference", "Last successful fetch"],
    read_tools: ["list_workspace_sources", "get_story"],
    write_tools: ["upsert_story", "run_crossref_ingestion"],
    workflow: "Saving a sourced story registers its source name and origin in Source Explorer. Active feeds are application configuration and fetch timestamps come from successful ingestion runs.",
  },
  health: {
    path: "/?view=health",
    sections: ["Newest ingestion runs", "Source", "Start and finish time", "Status", "Collected, created and rejected counts", "Errors"],
    read_tools: ["list_ingestion_runs", "get_system_status"],
    write_tools: ["run_crossref_ingestion"],
    workflow: "When the user requests ingestion, run the configured Crossref adapter and read back the run. Health records come from execution outcomes.",
  },
} satisfies Record<View, z.output<typeof pageContent>>;

const otherPages = {
  story_detail: {
    path: "/stories/{story_id}",
    sections: ["Title and summary", "Publication date", "Domains", "Original source", "Kind-specific details", "Research notes", "Source records"],
    read_tools: ["get_story"],
    write_tools: ["upsert_story"],
    workflow: "Open a saved story ID. Its metadata, links, source records and details come from the same stored story payload.",
  },
  login: {
    path: "/login",
    sections: ["Dashboard login", "Workspace membership status"],
    read_tools: [],
    write_tools: [],
    workflow: "Supabase Auth and administrator-managed workspace membership control dashboard sign-in.",
  },
} satisfies Record<string, z.output<typeof pageContent>>;

export const workspaceContentMapResult = z.object({
  pages: z.array(pageContent.extend({ id: z.string() })),
});

export const workspaceContentMap = {
  pages: Object.entries({ ...dashboardPages, ...otherPages }).map(([id, page]) => ({ id, ...page })),
} satisfies z.output<typeof workspaceContentMapResult>;
