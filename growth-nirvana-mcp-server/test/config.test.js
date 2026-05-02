import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("oauth mode does not require an internal API key", () => {
  const config = getConfig({
    MCP_AUTH_MODE: "oauth",
    GN_RAILS_BASE_URL: "https://app.example.com",
    MCP_PUBLIC_BASE_URL: "https://mcp.example.com",
    MCP_RESOURCE_PATH: "/mcp",
  });

  assert.equal(config.authMode, "oauth");
  assert.equal(config.apiKey, undefined);
  assert.equal(config.railsBaseUrl, "https://app.example.com");
  assert.equal(config.baseUrl, "https://app.example.com/api/v1/mcp");
  assert.equal(config.resourceUrl, "https://mcp.example.com/mcp");
});

test("internal mode preserves required API key behavior", () => {
  assert.throws(
    () => getConfig({ MCP_AUTH_MODE: "internal" }),
    /Missing env var GN_INTERNAL_API_KEY or GROWTH_NIRVANA_API_KEY/,
  );

  const config = getConfig({
    GN_INTERNAL_API_KEY: "secret",
    GROWTH_NIRVANA_BASE_URL: "https://app.example.com/api/v1/mcp",
  });

  assert.equal(config.authMode, "internal");
  assert.equal(config.apiKey, "secret");
  assert.equal(config.baseUrl, "https://app.example.com/api/v1/mcp");
});
