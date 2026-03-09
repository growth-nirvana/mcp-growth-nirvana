const DEFAULT_RAILS_BASE_URL = "https://app.growthnirvana.com";
const MCP_BASE_PATH = "/api/v1/mcp";

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig() {
  const apiKey = process.env.GROWTH_NIRVANA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing env var GROWTH_NIRVANA_API_KEY");
  }

  const rawBaseUrl =
    process.env.GROWTH_NIRVANA_BASE_URL || DEFAULT_RAILS_BASE_URL;
  const timeoutMs = parsePositiveInt(process.env.GROWTH_NIRVANA_TIMEOUT_MS, 15000);
  const maxRetries = parsePositiveInt(process.env.GROWTH_NIRVANA_MAX_RETRIES, 3);
  const sanitized = rawBaseUrl.replace(/\/+$/, "");
  const baseUrl = sanitized.endsWith(MCP_BASE_PATH)
    ? sanitized
    : `${sanitized}${MCP_BASE_PATH}`;

  return {
    apiKey,
    baseUrl,
    timeoutMs,
    maxRetries,
  };
}
