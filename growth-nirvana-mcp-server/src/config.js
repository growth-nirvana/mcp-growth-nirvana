const DEFAULT_RAILS_BASE_URL = "https://app.growthnirvana.com";
const DEFAULT_MCP_PUBLIC_BASE_URL = "http://localhost:3000";
const DEFAULT_MCP_RESOURCE_PATH = "/mcp";
const MCP_BASE_PATH = "/api/v1/mcp";

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePath(value) {
  const path = String(value || DEFAULT_MCP_RESOURCE_PATH).trim();
  if (!path || path === "/") return DEFAULT_MCP_RESOURCE_PATH;
  return `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeAuthMode(value) {
  const mode = String(value || "internal").toLowerCase();
  if (mode === "oauth") return "oauth";
  if (mode === "api_key" || mode === "apikey" || mode === "bff") return "internal";
  return "internal";
}

export function getConfig(env = process.env) {
  const authMode = normalizeAuthMode(env.MCP_AUTH_MODE);
  const apiKey = env.GN_INTERNAL_API_KEY || env.GROWTH_NIRVANA_API_KEY;
  if (authMode !== "oauth" && !apiKey) {
    throw new Error("Missing env var GN_INTERNAL_API_KEY or GROWTH_NIRVANA_API_KEY");
  }

  const rawBaseUrl =
    env.GN_RAILS_BASE_URL || env.GROWTH_NIRVANA_BASE_URL || DEFAULT_RAILS_BASE_URL;
  const timeoutMs = parsePositiveInt(env.GROWTH_NIRVANA_TIMEOUT_MS, 15000);
  const maxRetries = parsePositiveInt(env.GROWTH_NIRVANA_MAX_RETRIES, 3);
  const railsBaseUrl = sanitizeBaseUrl(rawBaseUrl);
  const baseUrl = railsBaseUrl.endsWith(MCP_BASE_PATH)
    ? railsBaseUrl
    : `${railsBaseUrl}${MCP_BASE_PATH}`;
  const publicBaseUrl = sanitizeBaseUrl(env.MCP_PUBLIC_BASE_URL || DEFAULT_MCP_PUBLIC_BASE_URL);
  const resourcePath = normalizePath(env.MCP_RESOURCE_PATH || DEFAULT_MCP_RESOURCE_PATH);

  return {
    authMode,
    apiKey,
    railsBaseUrl,
    baseUrl,
    publicBaseUrl,
    resourcePath,
    resourceUrl: `${publicBaseUrl}${resourcePath}`,
    timeoutMs,
    maxRetries,
  };
}
