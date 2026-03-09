import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function buildServer() {
  return createServer({
    baseUrl: "https://example.com/api/v1/mcp",
    apiKey: "secret",
    timeoutMs: 1000,
    maxRetries: 0,
  });
}

test("registers new account/model/config tools", () => {
  const server = buildServer();
  const tools = Object.keys(server._registeredTools || {});

  assert.ok(tools.includes("search_accounts"));
  assert.ok(tools.includes("search_datasets"));
  assert.ok(tools.includes("search_transformation_models"));
  assert.ok(tools.includes("list_connectors"));
  assert.ok(tools.includes("get_connector"));
  assert.ok(tools.includes("list_dataset_warehouse_fields"));
  assert.ok(tools.includes("get_dataset_warehouse_field"));
  assert.ok(tools.includes("get_dataset_client_config"));
});

test("search_datasets maps endpoint with dataset search params", async () => {
  const server = buildServer();
  const tool = server._registeredTools.search_datasets;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: [{ id: 7, name: "Core Dataset", alias_name: "core" }],
      meta: { page: 1, per_page: 20, total: 1 },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "42",
    q: "core",
    page: 1,
    per_page: 20,
    updated_since: "2026-03-07T00:00:00Z",
    type: "warehouse",
    enabled: true,
  });

  assert.match(urlSeen, /\/accounts\/42\/datasets\/search/);
  assert.match(urlSeen, /q=core/);
  assert.match(urlSeen, /type=warehouse/);
  assert.match(urlSeen, /enabled=true/);
  assert.equal(result.structuredContent.data[0].id, 7);
});

test("search_transformation_models maps endpoint and preserves combined payload", async () => {
  const server = buildServer();
  const tool = server._registeredTools.search_transformation_models;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: [
        {
          transformationModel: { id: 10, name: "orders_rollup" },
          dataTransformation: { id: 99, query: "select * from orders" },
        },
      ],
      meta: { page: 1, per_page: 10, total: 1 },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "42",
    q: "orders",
    dataset_id: "9",
    updated_since: "2026-03-07T00:00:00Z",
    page: 1,
    per_page: 10,
  });

  assert.match(urlSeen, /\/accounts\/42\/transformation_models\/search/);
  assert.match(urlSeen, /q=orders/);
  assert.match(urlSeen, /dataset_id=9/);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.data[0].transformationModel.id, 10);
  assert.equal(result.structuredContent.data[0].dataTransformation.id, 99);
});

test("get_dataset_client_config returns parsed config object payload", async () => {
  const server = buildServer();
  const tool = server._registeredTools.get_dataset_client_config;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: {
        customTransformationsConfig: "models:\\n  - name: foo",
        customTransformationsConfigParsed: { models: [{ name: "foo" }] },
      },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "42",
    dataset_id: "9",
  });

  assert.match(urlSeen, /\/accounts\/42\/datasets\/9\/client_dataset_config/);
  assert.deepEqual(result.structuredContent.data.customTransformationsConfigParsed, {
    models: [{ name: "foo" }],
  });
});

test("list_connectors maps connector filters", async () => {
  const server = buildServer();
  const tool = server._registeredTools.list_connectors;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: [{ id: "fivetran_123", connectorUrl: "https://app.growthnirvana.com/connectors/123" }],
      meta: { page: 1, per_page: 20, total: 1 },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "42",
    provider: "fivetran",
    q: "shopify",
    status: "connected",
    page: 1,
    per_page: 20,
    updated_since: "2026-03-07T00:00:00Z",
  });

  assert.match(urlSeen, /\/accounts\/42\/connectors/);
  assert.match(urlSeen, /provider=fivetran/);
  assert.match(urlSeen, /q=shopify/);
  assert.match(urlSeen, /status=connected/);
  assert.equal(result.structuredContent.data[0].id, "fivetran_123");
});

test("list/get warehouse field tools map nested warehouse field endpoints", async () => {
  const server = buildServer();
  const listTool = server._registeredTools.list_dataset_warehouse_fields;
  const getTool = server._registeredTools.get_dataset_warehouse_field;
  const urls = [];

  globalThis.fetch = async (url) => {
    urls.push(url);
    return jsonResponse(200, { data: { id: 77 }, errors: [] });
  };

  await listTool.handler({
    account_id: "42",
    dataset_id: "9",
    warehouse_table_id: "55",
    page: 1,
    per_page: 25,
    updated_since: "2026-03-07T00:00:00Z",
    name: "email",
  });

  await getTool.handler({
    account_id: "42",
    dataset_id: "9",
    warehouse_table_id: "55",
    warehouse_field_id: "77",
  });

  assert.match(
    urls[0],
    /\/accounts\/42\/datasets\/9\/warehouse_tables\/55\/warehouse_fields\?/,
  );
  assert.match(urls[0], /name=email/);
  assert.match(
    urls[1],
    /\/accounts\/42\/datasets\/9\/warehouse_tables\/55\/warehouse_fields\/77$/,
  );
});
