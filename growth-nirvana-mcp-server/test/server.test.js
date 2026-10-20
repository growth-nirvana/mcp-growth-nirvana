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
  assert.ok(tools.includes("browse_dataset_contexts"));
  assert.ok(tools.includes("search_dataset_contexts"));
  assert.ok(tools.includes("get_dataset_context"));
  assert.ok(tools.includes("suggest_dataset_context"));
  assert.ok(tools.includes("update_dataset_context"));
  assert.ok(tools.includes("search_datasets"));
  assert.ok(tools.includes("search_warehouse_fields"));
  assert.ok(tools.includes("list_warehouse_tables"));
  assert.ok(tools.includes("search_transformation_models"));
  assert.ok(tools.includes("list_connectors"));
  assert.ok(tools.includes("get_connector"));
  assert.ok(tools.includes("platform_request"));
  assert.ok(tools.includes("get_platform_request"));
  assert.ok(tools.includes("run_platform_request"));
  assert.ok(tools.includes("list_dataset_warehouse_fields"));
  assert.ok(tools.includes("get_dataset_warehouse_field"));
  assert.ok(tools.includes("get_dataset_client_config"));
  assert.ok(tools.includes("create_query_execution"));
  assert.ok(tools.includes("create_dry_run"));
  assert.ok(tools.includes("install_all_paid_pro"));
  assert.ok(tools.includes("create_dataset_bundle_export"));
  assert.ok(tools.includes("get_dataset_bundle_export"));
  assert.ok(tools.includes("list_report_templates"));
  assert.ok(tools.includes("get_report_template"));
  assert.ok(tools.includes("create_report_template"));
  assert.ok(tools.includes("update_report_template"));
  assert.ok(tools.includes("list_report_specs"));
  assert.ok(tools.includes("get_report_spec"));
  assert.ok(tools.includes("create_report_spec"));
  assert.ok(tools.includes("update_report_spec"));
  assert.ok(tools.includes("run_report_spec"));
  assert.ok(tools.includes("get_report_run"));
  assert.ok(tools.includes("cancel_report_run"));
  assert.ok(tools.includes("list_published_reports"));
  assert.ok(tools.includes("get_published_report"));
  assert.ok(tools.includes("get_brand_kit"));
  assert.ok(tools.includes("update_brand_kit"));
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

test("account-scoped tools default account_id to self", async () => {
  const server = buildServer();
  const tool = server._registeredTools.list_datasets;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, { data: [], meta: { page: 1, per_page: 25, total: 0 }, errors: [] });
  };

  await tool.handler({ page: 1, per_page: 25 });
  assert.match(urlSeen, /\/accounts\/self\/datasets\?/);
});

test("oauth tool calls forward request bearer token to Rails", async () => {
  const server = createServer({
    baseUrl: "https://example.com/api/v1/mcp",
    authMode: "oauth",
    oauthBearerToken: "oauth-token",
    timeoutMs: 1000,
    maxRetries: 0,
  });
  const tool = server._registeredTools.list_datasets;
  let authHeader = "";
  let apiKeyHeader = "unset";

  globalThis.fetch = async (_url, options) => {
    authHeader = options.headers.Authorization;
    apiKeyHeader = options.headers["X-API-Key"];
    return jsonResponse(200, { data: [], meta: { page: 1, per_page: 25, total: 0 }, errors: [] });
  };

  await tool.handler({ page: 1, per_page: 25 });

  assert.equal(authHeader, "Bearer oauth-token");
  assert.equal(apiKeyHeader, undefined);
});

test("oauth account-scoped tools force account_id to self", async () => {
  const server = createServer({
    baseUrl: "https://example.com/api/v1/mcp",
    authMode: "oauth",
    oauthBearerToken: "oauth-token",
    timeoutMs: 1000,
    maxRetries: 0,
  });
  const tool = server._registeredTools.list_datasets;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, { data: [], meta: { page: 1, per_page: 25, total: 0 }, errors: [] });
  };

  await tool.handler({ account_id: "42", page: 1, per_page: 25 });

  assert.match(urlSeen, /\/accounts\/self\/datasets\?/);
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

test("create_query_execution maps POST body and endpoint", async () => {
  const server = buildServer();
  const tool = server._registeredTools.create_query_execution;
  let requestBody = null;
  let methodSeen = "";
  let urlSeen = "";

  globalThis.fetch = async (url, options) => {
    urlSeen = url;
    methodSeen = options.method;
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, { data: { id: 123, state: "pending" }, errors: [] });
  };

  await tool.handler({
    account_id: "self",
    query: "SELECT 1",
    saved_query_id: 12,
    run_with_liquid: false,
  });

  assert.equal(methodSeen, "POST");
  assert.match(urlSeen, /\/accounts\/self\/query_executions$/);
  assert.deepEqual(requestBody, {
    query_execution: {
      query: "SELECT 1",
      saved_query_id: 12,
      run_with_liquid: false,
    },
  });
});

test("platform_request maps POST body and nested dataset path", async () => {
  const server = buildServer();
  const tool = server._registeredTools.platform_request;
  let requestBody = null;
  let urlSeen = "";

  globalThis.fetch = async (url, options) => {
    urlSeen = url;
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, {
      data: {
        platform_request_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        status: "queued",
      },
      errors: [],
    });
  };

  await tool.handler({
    account_id: "42",
    dataset_id: 9,
    platform: "google_ads",
    method: "GET",
    path: "/customers/123/googleAds:searchStream",
    connectorId: "hotglue_55",
    query: { pageSize: "100" },
  });

  assert.match(urlSeen, /\/accounts\/42\/datasets\/9\/platform_request$/);
  assert.deepEqual(requestBody.platformRequest, {
    platform: "google_ads",
    method: "GET",
    path: "/customers/123/googleAds:searchStream",
    connectorId: "hotglue_55",
    query: { pageSize: "100" },
  });
});

test("platform_request and run_platform_request accept google_analytics_4", () => {
  const server = buildServer();
  const args = {
    account_id: "42",
    platform: "google_analytics_4",
    method: "POST",
    path: "/properties/414689347:runReport",
    connectorId: "hotglue_208",
    body: {
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "google" } },
      },
    },
  };

  for (const name of ["platform_request", "run_platform_request"]) {
    const parsed = server._registeredTools[name].inputSchema.safeParse(args);
    assert.ok(parsed.success, `${name} rejected google_analytics_4`);
    assert.deepEqual(parsed.data.body.dimensionFilter, args.body.dimensionFilter);
  }

  const rejected = server._registeredTools.platform_request.inputSchema.safeParse({ ...args, platform: "ga4" });
  assert.equal(rejected.success, false);
});

test("get_platform_request maps poll endpoint", async () => {
  const server = buildServer();
  const tool = server._registeredTools.get_platform_request;
  let urlSeen = "";
  const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: { platform_request_id: id, status: "completed", body: { ok: true } },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "self",
    platform_request_id: id,
  });

  assert.match(urlSeen, new RegExp(`/accounts/self/platform_requests/${id}$`));
  assert.equal(result.structuredContent.data.status, "completed");
});

test("run_platform_request POSTs then polls until terminal", async () => {
  const server = buildServer();
  const tool = server._registeredTools.run_platform_request;
  const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method || "GET" });
    if (options?.method === "POST") {
      return jsonResponse(202, {
        data: { platform_request_id: id, status: "queued" },
        errors: [],
      });
    }
    if (calls.filter((c) => c.method === "GET").length < 2) {
      return jsonResponse(200, { data: { platform_request_id: id, status: "running" }, errors: [] });
    }
    return jsonResponse(200, {
      data: { platform_request_id: id, status: "completed", body: { rows: [] } },
      errors: [],
    });
  };

  const result = await tool.handler({
    account_id: "self",
    platform: "meta",
    method: "GET",
    path: "/act_123/insights",
    connectorId: "hotglue_99",
    poll_interval_ms: 1,
    max_wait_ms: 5_000,
  });

  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/accounts\/self\/platform_request$/);
  assert.ok(calls.some((c) => c.method === "GET" && c.url.includes(`/platform_requests/${id}`)));
  assert.equal(result.structuredContent.data.status, "completed");
});

test("create_query_execution defaults run_with_liquid to false", async () => {
  const server = buildServer();
  const tool = server._registeredTools.create_query_execution;
  let requestBody = null;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, { data: { id: 123, state: "pending" }, errors: [] });
  };

  await tool.handler({
    account_id: "self",
    query: "SELECT 1",
  });

  assert.equal(requestBody.query_execution.run_with_liquid, false);
  assert.equal(requestBody.query_execution.saved_query_id, null);
});

test("get_query_execution supports include/results and row_limit params", async () => {
  const server = buildServer();
  const tool = server._registeredTools.get_query_execution;
  let urlSeen = "";

  globalThis.fetch = async (url) => {
    urlSeen = url;
    return jsonResponse(200, {
      data: { id: 123, state: "done", results: { resultType: "table", rowLimit: 10 } },
      errors: [],
    });
  };

  await tool.handler({
    account_id: "self",
    query_execution_id: 123,
    include: "results",
    includeResults: true,
    row_limit: 10,
  });

  assert.match(urlSeen, /\/accounts\/self\/query_executions\/123\?/);
  assert.match(urlSeen, /include=results/);
  assert.match(urlSeen, /includeResults=true/);
  assert.match(urlSeen, /row_limit=10/);
});

test("create_dry_run maps snake_case wrapper and default flags", async () => {
  const server = buildServer();
  const tool = server._registeredTools.create_dry_run;
  let requestBody = null;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, { data: { id: 77, status: "pending" }, errors: [] });
  };

  await tool.handler({
    account_id: "self",
    query: "select 1",
    context: "SavedQuery",
  });

  assert.deepEqual(requestBody, {
    dry_run: {
      query: "select 1",
      context: "SavedQuery",
      dataset_id: null,
      package_version_id: null,
      queryable_id: null,
      queryable_type: null,
      run_with_dependencies: false,
      run_with_liquid: false,
    },
  });
});

test("install_all_paid_pro maps package install request", async () => {
  const server = buildServer();
  const tool = server._registeredTools.install_all_paid_pro;
  let requestBody = null;
  let urlSeen = "";

  globalThis.fetch = async (url, options) => {
    urlSeen = url;
    requestBody = JSON.parse(options.body);
    return jsonResponse(202, { data: { id: 99, status: "pending" }, errors: [] });
  };

  await tool.handler({
    account_id: "42",
    connector_id: "fivetran_123",
    dataset_display_name: "Shopify Orders",
    package_version_id: 5,
    idempotency_key: "abc",
  });

  assert.match(urlSeen, /\/accounts\/42\/packages\/all_paid_pro\/install$/);
  assert.equal(requestBody.connectorId, "fivetran_123");
  assert.equal(requestBody.datasetDisplayName, "Shopify Orders");
  assert.equal(requestBody.packageVersionId, 5);
  assert.equal(requestBody.idempotencyKey, "abc");
});

test("dataset bundle export tools map create/get endpoints", async () => {
  const server = buildServer();
  const createTool = server._registeredTools.create_dataset_bundle_export;
  const getTool = server._registeredTools.get_dataset_bundle_export;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    });
    return jsonResponse(202, { data: { id: 555, status: "pending" }, errors: [] });
  };

  await createTool.handler({
    account_id: "self",
    dataset_id: "42",
    idempotency_key: "idem-1",
  });

  await getTool.handler({
    account_id: "self",
    dataset_id: "42",
    bundle_export_id: "555",
  });

  assert.equal(requests[0].method, "POST");
  assert.match(requests[0].url, /\/accounts\/self\/datasets\/42\/bundle_exports$/);
  assert.deepEqual(requests[0].body, {
    bundleExport: {
      idempotencyKey: "idem-1",
    },
  });

  assert.equal(requests[1].method, "GET");
  assert.match(
    requests[1].url,
    /\/accounts\/self\/datasets\/42\/bundle_exports\/555$/,
  );
});

test("dataset context tools map discovery and context endpoints", async () => {
  const server = buildServer();
  const browseTool = server._registeredTools.browse_dataset_contexts;
  const searchTool = server._registeredTools.search_dataset_contexts;
  const getTool = server._registeredTools.get_dataset_context;
  const suggestTool = server._registeredTools.suggest_dataset_context;
  const updateTool = server._registeredTools.update_dataset_context;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    });
    return jsonResponse(200, { data: { id: 123 }, errors: [] });
  };

  await browseTool.handler({
    page: 1,
    perPage: 10,
    includeReporting: true,
    includeAdClientDatasets: true,
  });
  await searchTool.handler({ q: "Deepgram performance", page: 2, perPage: 5 });
  await getTool.handler({ datasetId: 123, includeSql: true, sqlModels: "combined_report,combined_report_ff" });
  await suggestTool.handler({ datasetId: 123 });
  await updateTool.handler({
    datasetId: 123,
    datasetContext: {
      visibility: "featured",
      priority: 100,
      summary: "Primary paid media performance dataset for Deepgram.",
      contextMarkdown: "## When to use this dataset\nUse this for Deepgram paid media performance.",
      tags: ["deepgram", "paid_media"],
      primaryTables: [
        {
          name: "combined_report_ff",
          reason: "Primary full-funnel table for spend and funnel reporting.",
        },
      ],
      recommendedQuestions: ["How did performance change week over week?"],
      caveats: "Use complete weeks for comparisons.",
      lastEditedBy: "assistant",
    },
  });

  assert.match(
    requests[0].url,
    /\/accounts\/self\/dataset_contexts\?page=1&per_page=10&include_reporting=true&include_ad_client_datasets=true$/,
  );
  assert.equal(requests[0].method, "GET");
  assert.match(
    requests[1].url,
    /\/accounts\/self\/dataset_contexts\/search\?q=Deepgram\+performance&page=2&per_page=5$/,
  );
  assert.equal(requests[1].method, "GET");
  assert.match(
    requests[2].url,
    /\/accounts\/self\/datasets\/123\/context\?include_sql=true&sql_models=combined_report%2Ccombined_report_ff$/,
  );
  assert.equal(requests[2].method, "GET");
  assert.match(requests[3].url, /\/accounts\/self\/datasets\/123\/context\/suggestions$/);
  assert.equal(requests[3].method, "POST");
  assert.deepEqual(requests[3].body, {});
  assert.match(requests[4].url, /\/accounts\/self\/datasets\/123\/context$/);
  assert.equal(requests[4].method, "PATCH");
  assert.equal(requests[4].body.datasetContext.lastEditedBy, "assistant");
  assert.deepEqual(requests[4].body.datasetContext.primaryTables, [
    {
      name: "combined_report_ff",
      reason: "Primary full-funnel table for spend and funnel reporting.",
    },
  ]);
});

test("oauth dataset context tools use account self", async () => {
  const server = createServer({
    baseUrl: "https://example.com/api/v1/mcp",
    authMode: "oauth",
    oauthBearerToken: "oauth-token",
    timeoutMs: 1000,
    maxRetries: 0,
  });
  const getTool = server._registeredTools.get_dataset_context;
  const updateTool = server._registeredTools.update_dataset_context;
  const urls = [];

  globalThis.fetch = async (url) => {
    urls.push(url);
    return jsonResponse(200, { data: { id: 123 }, errors: [] });
  };

  await getTool.handler({ datasetId: 123 });
  await updateTool.handler({
    datasetId: 123,
    datasetContext: {
      visibility: "hidden",
      lastEditedBy: "assistant",
    },
  });

  assert.match(urls[0], /\/accounts\/self\/datasets\/123\/context$/);
  assert.match(urls[1], /\/accounts\/self\/datasets\/123\/context$/);
});

test("report template tools map list/get/create/update endpoints", async () => {
  const server = buildServer();
  const listTool = server._registeredTools.list_report_templates;
  const getTool = server._registeredTools.get_report_template;
  const createTool = server._registeredTools.create_report_template;
  const updateTool = server._registeredTools.update_report_template;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    });
    return jsonResponse(200, { data: { id: 12 }, errors: [] });
  };

  await listTool.handler({ account_id: "42", page: 1, per_page: 20 });
  await getTool.handler({ account_id: "42", report_template_id: "12" });
  await createTool.handler({
    account_id: "42",
    name: "Weekly template",
    description: "Weekly performance summary",
    queries: [{ name: "spend", sql: "select 1" }],
    sections: [{ title: "Summary" }],
    defaultDateWindow: { preset: "last_7_days" },
    brandKit: { colors: { primary: "#111111" } },
    schedule: { cadence: "weekly" },
  });
  await updateTool.handler({
    account_id: "42",
    report_template_id: "12",
    sections: [{ title: "Updated summary" }],
  });

  assert.match(requests[0].url, /\/accounts\/42\/report_templates\?page=1&per_page=20$/);
  assert.equal(requests[0].method, "GET");
  assert.match(requests[1].url, /\/accounts\/42\/report_templates\/12$/);
  assert.equal(requests[1].method, "GET");
  assert.match(requests[2].url, /\/accounts\/42\/report_templates$/);
  assert.equal(requests[2].method, "POST");
  assert.equal(requests[2].body.reportTemplate.name, "Weekly template");
  assert.equal(requests[2].body.reportTemplate.description, "Weekly performance summary");
  assert.equal(requests[2].body.reportTemplate.queries[0].name, "spend");
  assert.equal(requests[2].body.reportTemplate.defaultDateWindow.preset, "last_7_days");
  assert.match(requests[3].url, /\/accounts\/42\/report_templates\/12$/);
  assert.equal(requests[3].method, "PATCH");
  assert.equal(requests[3].body.reportTemplate.sections[0].title, "Updated summary");
});

test("report spec tools map list/get/create/update endpoints", async () => {
  const server = buildServer();
  const listTool = server._registeredTools.list_report_specs;
  const getTool = server._registeredTools.get_report_spec;
  const createTool = server._registeredTools.create_report_spec;
  const updateTool = server._registeredTools.update_report_spec;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    });
    return jsonResponse(200, { data: { id: 34 }, errors: [] });
  };

  await listTool.handler({ account_id: "42", dataset_id: "9", resolved: false, page: 2, per_page: 10 });
  await getTool.handler({ account_id: "42", report_spec_id: "34", resolved: true });
  await createTool.handler({
    account_id: "42",
    dataset_id: "9",
    templateId: "12",
    name: "May performance report",
    overrides: {
      sections: [{ title: "Summary" }],
    },
    lastEditedBy: "assistant",
  });
  await updateTool.handler({
    account_id: "42",
    report_spec_id: "34",
    overrides: { defaultDateWindow: { preset: "month_to_date" } },
    lastEditedBy: "agent",
  });

  assert.match(
    requests[0].url,
    /\/accounts\/42\/report_specs\?dataset_id=9&resolved=false&page=2&per_page=10$/,
  );
  assert.equal(requests[0].method, "GET");
  assert.match(requests[1].url, /\/accounts\/42\/report_specs\/34\?resolved=true$/);
  assert.equal(requests[1].method, "GET");
  assert.match(requests[2].url, /\/accounts\/42\/report_specs$/);
  assert.equal(requests[2].method, "POST");
  assert.equal(requests[2].body.reportSpec.dataset_id, "9");
  assert.equal(requests[2].body.reportSpec.templateId, "12");
  assert.equal(requests[2].body.reportSpec.name, "May performance report");
  assert.equal(requests[2].body.reportSpec.overrides.sections[0].title, "Summary");
  assert.equal(requests[2].body.reportSpec.lastEditedBy, "assistant");
  assert.match(requests[3].url, /\/accounts\/42\/report_specs\/34$/);
  assert.equal(requests[3].method, "PATCH");
  assert.equal(requests[3].body.reportSpec.overrides.defaultDateWindow.preset, "month_to_date");
  assert.equal(requests[3].body.reportSpec.lastEditedBy, "agent");
});

test("report run, published report, and brand kit tools map endpoints", async () => {
  const server = buildServer();
  const runTool = server._registeredTools.run_report_spec;
  const getRunTool = server._registeredTools.get_report_run;
  const cancelRunTool = server._registeredTools.cancel_report_run;
  const listPublishedTool = server._registeredTools.list_published_reports;
  const getPublishedTool = server._registeredTools.get_published_report;
  const getBrandTool = server._registeredTools.get_brand_kit;
  const updateBrandTool = server._registeredTools.update_brand_kit;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    });
    return jsonResponse(200, { data: { id: 56 }, errors: [] });
  };

  await runTool.handler({ account_id: "42", report_spec_id: "34", idempotency_key: "idem-1" });
  await getRunTool.handler({ account_id: "42", report_run_id: "56" });
  await cancelRunTool.handler({ account_id: "42", report_run_id: "56" });
  await listPublishedTool.handler({ account_id: "42", dataset_id: "9", page: 1, per_page: 5 });
  await listPublishedTool.handler({ account_id: "42", report_spec_id: "34" });
  await getPublishedTool.handler({ account_id: "42", published_report_id: "78" });
  await getBrandTool.handler({ account_id: "42" });
  await updateBrandTool.handler({
    account_id: "42",
    brandKit: { colors: { primary: "#111111" }, fonts: { heading: "Inter" } },
  });

  assert.match(requests[0].url, /\/accounts\/42\/report_specs\/34\/runs$/);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].body.reportRun.idempotencyKey, "idem-1");
  assert.match(requests[1].url, /\/accounts\/42\/report_runs\/56$/);
  assert.equal(requests[1].method, "GET");
  assert.match(requests[2].url, /\/accounts\/42\/report_runs\/56\/cancel$/);
  assert.equal(requests[2].method, "PATCH");
  assert.match(requests[3].url, /\/accounts\/42\/published_reports\?dataset_id=9&page=1&per_page=5$/);
  assert.match(requests[4].url, /\/accounts\/42\/report_specs\/34\/published_reports$/);
  assert.match(requests[5].url, /\/accounts\/42\/published_reports\/78$/);
  assert.match(requests[6].url, /\/accounts\/42\/brand_kit$/);
  assert.equal(requests[6].method, "GET");
  assert.match(requests[7].url, /\/accounts\/42\/brand_kit$/);
  assert.equal(requests[7].method, "PUT");
  assert.equal(requests[7].body.brandKit.fonts.heading, "Inter");
});

test("oauth report tools force account self", async () => {
  const server = createServer({
    baseUrl: "https://example.com/api/v1/mcp",
    authMode: "oauth",
    oauthBearerToken: "oauth-token",
    timeoutMs: 1000,
    maxRetries: 0,
  });
  const listTool = server._registeredTools.list_report_specs;
  const updateBrandTool = server._registeredTools.update_brand_kit;
  const urls = [];

  globalThis.fetch = async (url) => {
    urls.push(url);
    return jsonResponse(200, { data: { id: 34 }, errors: [] });
  };

  await listTool.handler({ account_id: "42", dataset_id: "9" });
  await updateBrandTool.handler({ account_id: "42", brandKit: { colors: { primary: "#111111" } } });

  assert.match(urls[0], /\/accounts\/self\/report_specs\?dataset_id=9$/);
  assert.match(urls[1], /\/accounts\/self\/brand_kit$/);
});
