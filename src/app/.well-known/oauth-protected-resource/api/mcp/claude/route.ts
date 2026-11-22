import { protectedResourceMetadata, protectedResourceMetadataOptions } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const GET = () => protectedResourceMetadata("claude");
export const OPTIONS = protectedResourceMetadataOptions;
