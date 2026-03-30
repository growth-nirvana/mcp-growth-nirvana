import test from "node:test";
import assert from "node:assert/strict";
import { railsGet, railsPatch, railsPost, toToolError } from "../src/http.js";

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("toToolError maps 401/403/422 status hints", () => {
  const authError = toToolError({ status: 401, code: "invalid_key", message: "bad key" });
  const forbiddenError = toToolError({
    status: 403,
    code: "master_key_required",
    message: "forbidden",
  });
  const validationError = toToolError({
    status: 422,
    code: "invalid_params",
    message: "bad params",
  });

  assert.equal(authError.isError, true);
  assert.match(authError.content[0].text, /invalid_or_missing_key/);
  assert.match(forbiddenError.content[0].text, /scope_or_account_mismatch/);
  assert.match(validationError.content[0].text, /invalid_request_params/);
});

test("railsGet does not retry 401 auth failures", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(401, {
      data: null,
      errors: [{ code: "invalid_key", message: "invalid API key" }],
    });
  };

  await assert.rejects(
    () =>
      railsGet({
        baseUrl: "https://example.com/api/v1/mcp",
        apiKey: "secret",
        path: "/accounts/1/datasets",
        params: {},
        accountId: "1",
        timeoutMs: 1000,
        maxRetries: 3,
        backoffBaseMs: 1,
      }),
    (err) => err?.status === 401 && err?.code === "invalid_key",
  );

  assert.equal(calls, 1);
});

test("railsGet does not retry 403 or 422 failures", async () => {
  let calls403 = 0;
  globalThis.fetch = async () => {
    calls403 += 1;
    return jsonResponse(403, {
      data: null,
      errors: [{ code: "master_key_required", message: "master key required" }],
    });
  };

  await assert.rejects(
    () =>
      railsGet({
        baseUrl: "https://example.com/api/v1/mcp",
        apiKey: "secret",
        path: "/accounts/search",
        params: { q: "Stackmatix" },
        accountId: "global",
        timeoutMs: 1000,
        maxRetries: 3,
        backoffBaseMs: 1,
      }),
    (err) => err?.status === 403 && err?.code === "master_key_required",
  );
  assert.equal(calls403, 1);

  let calls422 = 0;
  globalThis.fetch = async () => {
    calls422 += 1;
    return jsonResponse(422, {
      data: null,
      errors: [{ code: "invalid_params", message: "bad include value" }],
    });
  };

  await assert.rejects(
    () =>
      railsGet({
        baseUrl: "https://example.com/api/v1/mcp",
        apiKey: "secret",
        path: "/accounts/1/datasets/2",
        params: { include: "bogus" },
        accountId: "1",
        timeoutMs: 1000,
        maxRetries: 3,
        backoffBaseMs: 1,
      }),
    (err) => err?.status === 422 && err?.code === "invalid_params",
  );
  assert.equal(calls422, 1);
});

test("railsGet retries 429 once then succeeds", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(429, {
        data: null,
        errors: [{ code: "rate_limited", message: "slow down" }],
      });
    }
    return jsonResponse(200, { data: [{ id: 1 }], meta: { page: 1, per_page: 20, total: 1 }, errors: [] });
  };

  const body = await railsGet({
    baseUrl: "https://example.com/api/v1/mcp",
    apiKey: "secret",
    path: "/accounts/1/datasets",
    params: { page: 1, per_page: 20 },
    accountId: "1",
    timeoutMs: 1000,
    maxRetries: 2,
    backoffBaseMs: 1,
  });

  assert.equal(calls, 2);
  assert.deepEqual(body.data, [{ id: 1 }]);
  assert.deepEqual(body.meta, { page: 1, per_page: 20, total: 1 });
});

test("railsGet serializes pagination and updated_since query params", async () => {
  let urlSeen = "";
  let authHeader = "";
  globalThis.fetch = async (url, options) => {
    urlSeen = url;
    authHeader = options.headers.Authorization;
    return jsonResponse(200, { data: [], meta: { page: 2, per_page: 5, total: 0 }, errors: [] });
  };

  await railsGet({
    baseUrl: "https://example.com/api/v1/mcp",
    apiKey: "secret",
    path: "/accounts/77/transformation_models",
    params: {
      page: 2,
      per_page: 5,
      updated_since: "2026-03-07T00:00:00Z",
    },
    accountId: "77",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.match(urlSeen, /accounts\/77\/transformation_models/);
  assert.match(urlSeen, /api\/v1\/mcp\/accounts\/77\/transformation_models/);
  assert.match(urlSeen, /page=2/);
  assert.match(urlSeen, /per_page=5/);
  assert.match(urlSeen, /updated_since=2026-03-07T00%3A00%3A00Z/);
  assert.equal(authHeader, "Bearer secret");
});

test("railsGet preserves /api/v1/mcp base path for leading-slash routes", async () => {
  let urlSeen = "";
  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, { data: [], meta: { page: 1, per_page: 20, total: 0 }, errors: [] });
  };

  await railsGet({
    baseUrl: "https://app.growthnirvana.com/api/v1/mcp",
    apiKey: "secret",
    path: "/accounts/search",
    params: { q: "Stackmatix" },
    accountId: "global",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(
    urlSeen,
    "https://app.growthnirvana.com/api/v1/mcp/accounts/search?q=Stackmatix",
  );
});

test("railsPost sends json body with headers", async () => {
  let methodSeen = "";
  let contentTypeSeen = "";
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    methodSeen = options.method;
    contentTypeSeen = options.headers["Content-Type"];
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, { data: { id: 1 }, errors: [] });
  };

  await railsPost({
    baseUrl: "https://example.com/api/v1/mcp",
    apiKey: "secret",
    path: "/accounts/self/query_executions",
    params: {},
    body: { queryExecution: { query: "SELECT 1" } },
    accountId: "self",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(methodSeen, "POST");
  assert.equal(contentTypeSeen, "application/json");
  assert.equal(requestBody.queryExecution.query, "SELECT 1");
});

test("railsPatch sends patch requests", async () => {
  let methodSeen = "";
  globalThis.fetch = async () => {
    methodSeen = "PATCH";
    return jsonResponse(200, { data: { id: 9, state: "cancelled" }, errors: [] });
  };

  const body = await railsPatch({
    baseUrl: "https://example.com/api/v1/mcp",
    apiKey: "secret",
    path: "/accounts/self/query_executions/9/cancel",
    params: {},
    body: {},
    accountId: "self",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(methodSeen, "PATCH");
  assert.equal(body.data.state, "cancelled");
});
