import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const readScope = "intelligence:read";
export const writeScope = "intelligence:write";
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const metadataCorsHeaders = { "Access-Control-Allow-Origin": "*" };

type OAuthConfig = { issuer: string; jwks: URL; allowedSubjects: string[] };
export type McpEndpoint = "primary" | "claude";
export type McpConfig = { resource: URL; oauth?: OAuthConfig; devToken?: string };
export type McpIdentity = { actor: string; scopes: string[] };

function httpsConfig(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) return url;
  } catch {
    return undefined;
  }
}

const loopback = (hostname: string) => ["127.0.0.1", "localhost", "[::1]"].includes(hostname);

function oauthEndpoints(env: NodeJS.ProcessEnv) {
  const issuer = env.MCP_OAUTH_ISSUER;
  const jwks = httpsConfig(env.MCP_OAUTH_JWKS_URL);
  if (issuer || env.MCP_OAUTH_JWKS_URL) {
    return issuer && httpsConfig(issuer) && jwks ? { issuer, jwks } : null;
  }

  const projectId = env.DESCOPE_PROJECT_ID?.trim();
  const base = httpsConfig(env.DESCOPE_BASE_URL || "https://api.descope.com");
  if (!projectId || !/^P[A-Za-z0-9]+$/.test(projectId) || base?.pathname !== "/") return null;
  return {
    issuer: new URL(`/v1/apps/${projectId}`, base).href,
    jwks: new URL(`/${projectId}/.well-known/jwks.json`, base),
  };
}

export function mcpConfig(env: NodeJS.ProcessEnv = process.env, endpoint: McpEndpoint = "primary"): McpConfig | null {
  const url = env.MCP_SERVER_URL;
  let resource: URL;
  try {
    resource = new URL(url ?? "");
  } catch {
    return null;
  }
  if (resource.pathname !== "/api/mcp" || resource.username || resource.password || resource.search || resource.hash) return null;
  const dedicatedIssuer = endpoint === "claude" && (env.MCP_CLAUDE_OAUTH_ISSUER || env.MCP_CLAUDE_OAUTH_JWKS_URL);
  const endpoints = oauthEndpoints(dedicatedIssuer ? {
    ...env,
    MCP_OAUTH_ISSUER: env.MCP_CLAUDE_OAUTH_ISSUER,
    MCP_OAUTH_JWKS_URL: env.MCP_CLAUDE_OAUTH_JWKS_URL,
  } : env);
  const allowedSubjects = (env.MCP_OAUTH_ALLOWED_SUBJECTS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (httpsConfig(url) && endpoints && allowedSubjects.length) {
    if (endpoint === "claude") resource.pathname += "/claude";
    return { resource, oauth: { ...endpoints, allowedSubjects } };
  }
  const devToken = env.MCP_AUTH_SECRET;
  if (endpoint === "primary" && env.NODE_ENV === "development" && resource.protocol === "http:" &&
      loopback(resource.hostname) && devToken && devToken.length >= 32) {
    return { resource, devToken };
  }
  return null;
}

export function metadataUrl(resource: URL) {
  return new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin);
}

const bearerErrorDescriptions = {
  invalid_token: "The access token is invalid or expired.",
  insufficient_scope: "Sign in and grant the requested permission.",
};

export function bearerChallenge(config: McpConfig, error: keyof typeof bearerErrorDescriptions, scope?: string) {
  const parts: string[] = [];
  if (config.oauth) parts.push(`resource_metadata="${metadataUrl(config.resource).href}"`);
  if (scope && config.oauth) parts.push(`scope="${scope}"`);
  parts.push(`error="${error}"`, `error_description="${bearerErrorDescriptions[error]}"`);
  return `Bearer ${parts.join(", ")}`;
}

export function protectedResourceMetadata(endpoint: McpEndpoint = "primary") {
  const config = mcpConfig(process.env, endpoint);
  if (!config?.oauth) return new Response(null, { status: 404, headers: metadataCorsHeaders });
  return Response.json({
    resource: config.resource.href,
    authorization_servers: [config.oauth.issuer],
    scopes_supported: [readScope, writeScope],
    bearer_methods_supported: ["header"],
  }, { headers: { ...metadataCorsHeaders, "Cache-Control": "public, max-age=300" } });
}

export function protectedResourceMetadataOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...metadataCorsHeaders,
      "Allow": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
    },
  });
}

function remoteKey(url: URL) {
  let key = jwksCache.get(url.href);
  if (!key) {
    key = createRemoteJWKSet(url, { timeoutDuration: 5000 });
    jwksCache.set(url.href, key);
  }
  return key;
}

export async function verifyMcpToken(
  token: string, requestUrl: URL, config: McpConfig, resolveKey: (url: URL) => JWTVerifyGetKey = remoteKey,
): Promise<McpIdentity | null> {
  if (config.devToken && loopback(requestUrl.hostname)) {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (timingSafeEqual(digest(token), digest(config.devToken))) {
      return { actor: "mcp:local", scopes: [readScope, writeScope] };
    }
  }

  if (!config.oauth) return null;
  try {
    const { payload } = await jwtVerify(token, resolveKey(config.oauth.jwks), {
      issuer: config.oauth.issuer,
      audience: config.resource.href,
      algorithms: ["RS256", "ES256", "PS256", "EdDSA"],
      requiredClaims: ["sub", "exp"],
    });
    if (!payload.sub || !config.oauth.allowedSubjects.includes(payload.sub)) return null;
    const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
    return { actor: `mcp:oauth:${payload.sub}`, scopes };
  } catch {
    return null;
  }
}
