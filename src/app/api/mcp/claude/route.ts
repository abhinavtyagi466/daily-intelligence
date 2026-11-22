import { handleClaudeMcp } from "@/lib/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleClaudeMcp;
export const GET = handleClaudeMcp;
export const DELETE = handleClaudeMcp;
export const OPTIONS = handleClaudeMcp;
