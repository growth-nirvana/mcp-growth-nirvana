import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { handleWebRequest } from "../src/http-server.js";

function buildConfig() {
  return {
    authMode: "oauth",
    apiKey: undefined,
    oauthBearerToken: undefined,
    railsBaseUrl: "https://app.growthnirvana.com",
    baseUrl: "https://app.growthnirvana.com/api/v1/mcp",
    publicBaseUrl: "https://mcp.growthnirvana.com",
    resourcePath: "/mcp",
    resourceUrl: "https://mcp.growthnirvana.com/mcp",
    timeoutMs: 1000,
    maxRetries: 0,
  };
}

function mcpRequest(path, { authorization, body } = {}) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "Mcp-Protocol-Version": "2025-03-26",
  };
  if (authorization) headers.Authorization = authorization;

  return new Request(`https://mcp.growthnirvana.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      body || {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      },
    ),
  });
}

test("unauthenticated mcp request returns OAuth protected resource challenge", async () => {
  const response = await handleWebRequest(mcpRequest("/mcp"), buildConfig());

  assert.equal(response.status, 401);
  assert.match(
    response.headers.get("www-authenticate"),
    /resource_metadata="https:\/\/mcp\.growthnirvana\.com\/\.well-known\/oauth-protected-resource\/mcp"/,
  );
});

test("protected resource metadata is served from both well-known paths", async () => {
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    const response = await handleWebRequest(
      new Request(`https://mcp.growthnirvana.com${path}`),
      buildConfig(),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.resource, "https://mcp.growthnirvana.com/mcp");
    assert.deepEqual(body.authorization_servers, ["https://app.growthnirvana.com"]);
    assert.ok(body.scopes_supported.includes("read:datasets"));
    assert.ok(body.scopes_supported.includes("run:query_executions"));
    assert.ok(body.scopes_supported.includes("read:report_specs"));
    assert.ok(body.scopes_supported.includes("write:report_templates"));
    assert.ok(body.scopes_supported.includes("run:reports"));
    assert.ok(body.scopes_supported.includes("write:brand_kits"));
  }
});

test("authenticated mcp request reaches Streamable HTTP transport", async () => {
  const response = await handleWebRequest(
    mcpRequest("/mcp", { authorization: "Bearer oauth-token" }),
    buildConfig(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.serverInfo.name, "growth-nirvana-rails-mcp");
});

test("authenticated mcp request can list tools statelessly", async () => {
  const response = await handleWebRequest(
    mcpRequest("/mcp", {
      authorization: "Bearer oauth-token",
      body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    }),
    buildConfig(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, 2);
  assert.ok(body.result.tools.some((tool) => tool.name === "list_datasets"));
});

test("vercel rewrite targets route to the shared mcp function", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrites = vercelConfig.rewrites.map((rewrite) => [rewrite.source, rewrite.destination]);

  assert.deepEqual(rewrites, [
    ["/mcp", "/api/mcp"],
    ["/.well-known/oauth-protected-resource", "/api/mcp"],
    ["/.well-known/oauth-protected-resource/mcp", "/api/mcp"],
  ]);
});
