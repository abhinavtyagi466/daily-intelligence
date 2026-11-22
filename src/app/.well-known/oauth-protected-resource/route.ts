import { protectedResourceMetadata, protectedResourceMetadataOptions } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const GET = () => protectedResourceMetadata();
export const OPTIONS = protectedResourceMetadataOptions;
