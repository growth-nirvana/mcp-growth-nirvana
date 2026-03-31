#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { railsGet, railsPatch, railsPost, toToolError } from "./http.js";

const accountField = z.union([z.literal("self"), z.string().min(1), z.number()]);
const accountOptional = z.object({ account_id: accountField.optional() });
const qRequired = z.object({ q: z.string().min(1) });
const pagingFields = {
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().optional(),
  updated_since: z.string().optional(),
};

const datasetInclude = z
  .string()
  .regex(
    /^(warehouse_tables|warehouse_fields|transformation_models)(,(warehouse_tables|warehouse_fields|transformation_models))*$/,
  )
  .optional();
const tableInclude = z
  .string()
  .regex(/^(dataset|warehouse_fields)(,(dataset|warehouse_fields))*$/)
  .optional();
const fieldInclude = z
  .string()
  .regex(/^(warehouse_table|dataset)(,(warehouse_table|dataset))*$/)
  .optional();

function toToolSuccess(body) {
  const payload = {
    data: body?.data ?? null,
    errors: Array.isArray(body?.errors) ? body.errors : [],
  };
  if (body?.meta !== undefined) payload.meta = body.meta;
  return {
    structuredContent: payload,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function normalizeAccountId(value) {
  if (value === undefined || value === null || value === "") return "self";
  return String(value);
}

async function doRequest(method, path, params, body, accountId) {
  const common = {
    baseUrl: this.baseUrl,
    apiKey: this.apiKey,
    path,
    params,
    body,
    accountId,
    timeoutMs: this.timeoutMs,
    maxRetries: this.maxRetries,
  };
  if (method === "GET") return railsGet(common);
  if (method === "POST") return railsPost(common);
  return railsPatch(common);
}

function registerTool(server, config, name, meta, handler) {
  server.registerTool(name, meta, async (args) => {
    try {
      const body = await handler(args, async (method, path, params, reqBody, accountId) =>
        doRequest.call(config, method, path, params, reqBody, accountId),
      );
      return toToolSuccess(body);
    } catch (error) {
      return toToolError(error);
    }
  });
}

export function createServer(config) {
  const server = new McpServer({ name: "growth-nirvana-rails-mcp", version: "0.3.0" });

  registerTool(
    server,
    config,
    "search_accounts",
    {
      title: "Search Accounts",
      description: "GET /accounts/search. Scope: read:accounts (master key only).",
      inputSchema: qRequired.extend({
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
      }),
    },
    async (args, request) =>
      request("GET", "/accounts/search", { q: args.q, page: args.page, per_page: args.per_page }, undefined, "global"),
  );

  registerTool(
    server,
    config,
    "list_connectors",
    {
      title: "List Connectors",
      description: "GET /accounts/:account_id/connectors. Scope: read:connectors.",
      inputSchema: accountOptional.extend({
        provider: z.enum(["fivetran", "hotglue"]).optional(),
        q: z.string().optional(),
        status: z.string().optional(),
        ...pagingFields,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/connectors`,
        {
          provider: args.provider,
          q: args.q,
          status: args.status,
          updated_since: args.updated_since,
          page: args.page,
          per_page: args.per_page,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_connector",
    {
      title: "Get Connector",
      description: "GET /accounts/:account_id/connectors/:id. Scope: read:connectors.",
      inputSchema: accountOptional.extend({ connector_id: z.string().min(1) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/connectors/${String(args.connector_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_datasets",
    {
      title: "List Datasets",
      description: "GET /accounts/:account_id/datasets. Scope: read:datasets.",
      inputSchema: accountOptional.extend({
        ...pagingFields,
        type: z.string().optional(),
        enabled: z.union([z.boolean(), z.string()]).optional(),
        include: datasetInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          type: args.type,
          enabled: args.enabled,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "search_datasets",
    {
      title: "Search Datasets",
      description: "GET /accounts/:account_id/datasets/search. Scope: read:datasets.",
      inputSchema: accountOptional.extend({
        q: z.string().min(1),
        ...pagingFields,
        type: z.string().optional(),
        enabled: z.union([z.boolean(), z.string()]).optional(),
        include: datasetInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/search`,
        {
          q: args.q,
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          type: args.type,
          enabled: args.enabled,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset",
    {
      title: "Get Dataset",
      description: "GET /accounts/:account_id/datasets/:id. Scope: read:datasets.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        include: datasetInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}`,
        { include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_warehouse_tables",
    {
      title: "List Warehouse Tables",
      description: "GET /accounts/:account_id/warehouse_tables. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        ...pagingFields,
        name: z.string().optional(),
        include: tableInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_tables`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "search_warehouse_tables",
    {
      title: "Search Warehouse Tables",
      description: "GET /accounts/:account_id/warehouse_tables/search. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        q: z.string().min(1),
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
        include: tableInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_tables/search`,
        { q: args.q, page: args.page, per_page: args.per_page, include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_warehouse_table",
    {
      title: "Get Warehouse Table",
      description: "GET /accounts/:account_id/warehouse_tables/:id. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        warehouse_table_id: z.union([z.string(), z.number()]),
        include: tableInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_tables/${String(args.warehouse_table_id)}`,
        { include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_dataset_warehouse_tables",
    {
      title: "List Dataset Warehouse Tables",
      description: "GET /accounts/:account_id/datasets/:dataset_id/warehouse_tables. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        name: z.string().optional(),
        include: tableInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/warehouse_tables`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset_warehouse_table",
    {
      title: "Get Dataset Warehouse Table",
      description: "GET /accounts/:account_id/datasets/:dataset_id/warehouse_tables/:id. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
        include: tableInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/warehouse_tables/${String(args.warehouse_table_id)}`,
        { include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_warehouse_fields",
    {
      title: "List Warehouse Fields",
      description: "GET /accounts/:account_id/warehouse_fields. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        ...pagingFields,
        name: z.string().optional(),
        include: fieldInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_fields`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "search_warehouse_fields",
    {
      title: "Search Warehouse Fields",
      description: "GET /accounts/:account_id/warehouse_fields/search. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        q: z.string().min(1),
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
        include: fieldInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_fields/search`,
        { q: args.q, page: args.page, per_page: args.per_page, include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_warehouse_field",
    {
      title: "Get Warehouse Field",
      description: "GET /accounts/:account_id/warehouse_fields/:id. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        warehouse_field_id: z.union([z.string(), z.number()]),
        include: fieldInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/warehouse_fields/${String(args.warehouse_field_id)}`,
        { include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_dataset_warehouse_fields",
    {
      title: "List Dataset Warehouse Fields",
      description:
        "GET /accounts/:account_id/datasets/:dataset_id/warehouse_tables/:warehouse_table_id/warehouse_fields. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        name: z.string().optional(),
        include: fieldInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/warehouse_tables/${String(args.warehouse_table_id)}/warehouse_fields`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
          include: args.include,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset_warehouse_field",
    {
      title: "Get Dataset Warehouse Field",
      description:
        "GET /accounts/:account_id/datasets/:dataset_id/warehouse_tables/:warehouse_table_id/warehouse_fields/:id. Scope: read:warehouse_tables.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
        warehouse_field_id: z.union([z.string(), z.number()]),
        include: fieldInclude,
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/warehouse_tables/${String(args.warehouse_table_id)}/warehouse_fields/${String(args.warehouse_field_id)}`,
        { include: args.include },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_dataset_transformation_models",
    {
      title: "List Dataset Transformation Models",
      description: "GET /accounts/:account_id/datasets/:dataset_id/transformation_models. Scope: read:transformation_models.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        folder_id: z.union([z.string(), z.number()]).optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/transformation_models`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          folder_id: args.folder_id,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset_transformation_model",
    {
      title: "Get Dataset Transformation Model",
      description: "GET /accounts/:account_id/datasets/:dataset_id/transformation_models/:id. Scope: read:transformation_models.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        transformation_model_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/transformation_models/${String(args.transformation_model_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_transformation_models",
    {
      title: "List Transformation Models",
      description: "GET /accounts/:account_id/transformation_models. Scope: read:transformation_models.",
      inputSchema: accountOptional.extend({
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
        dataset_id: z.union([z.string(), z.number()]).optional(),
        updated_since: z.string().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/transformation_models`,
        {
          page: args.page,
          per_page: args.per_page,
          dataset_id: args.dataset_id,
          updated_since: args.updated_since,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_transformation_model",
    {
      title: "Get Transformation Model",
      description: "GET /accounts/:account_id/transformation_models/:id. Scope: read:transformation_models.",
      inputSchema: accountOptional.extend({
        transformation_model_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/transformation_models/${String(args.transformation_model_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "search_transformation_models",
    {
      title: "Search Transformation Models",
      description: "GET /accounts/:account_id/transformation_models/search. Scope: read:transformation_models.",
      inputSchema: accountOptional.extend({
        q: z.string().min(1),
        dataset_id: z.union([z.string(), z.number()]).optional(),
        updated_since: z.string().optional(),
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/transformation_models/search`,
        {
          q: args.q,
          dataset_id: args.dataset_id,
          updated_since: args.updated_since,
          page: args.page,
          per_page: args.per_page,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "list_data_transformations",
    {
      title: "List Data Transformations",
      description: "GET /accounts/:account_id/data_transformations. Scope: read:data_transformations.",
      inputSchema: accountOptional.extend({
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
        dataset_id: z.union([z.string(), z.number()]).optional(),
        active: z.union([z.boolean(), z.string()]).optional(),
        updated_since: z.string().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/data_transformations`,
        {
          page: args.page,
          per_page: args.per_page,
          dataset_id: args.dataset_id,
          active: args.active,
          updated_since: args.updated_since,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_data_transformation",
    {
      title: "Get Data Transformation",
      description: "GET /accounts/:account_id/data_transformations/:id. Scope: read:data_transformations.",
      inputSchema: accountOptional.extend({ data_transformation_id: z.union([z.string(), z.number()]) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/data_transformations/${String(args.data_transformation_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset_client_config",
    {
      title: "Get Dataset Client Config",
      description: "GET /accounts/:account_id/datasets/:dataset_id/client_dataset_config. Scope: read:client_dataset_config.",
      inputSchema: accountOptional.extend({ dataset_id: z.union([z.string(), z.number()]) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/client_dataset_config`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "create_query_execution",
    {
      title: "Create Query Execution",
      description: "POST /accounts/:account_id/query_executions. Scope: run:query_executions.",
      inputSchema: accountOptional.extend({
        query: z.string().min(1),
        saved_query_id: z.union([z.string(), z.number()]).optional(),
        run_with_liquid: z.boolean().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "POST",
        `/accounts/${accountId}/query_executions`,
        {},
        {
          query_execution: {
            query: args.query,
            saved_query_id: args.saved_query_id ?? null,
            run_with_liquid: args.run_with_liquid ?? false,
          },
        },
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_query_execution",
    {
      title: "Get Query Execution",
      description: "GET /accounts/:account_id/query_executions/:id. Scope: run:query_executions.",
      inputSchema: accountOptional.extend({
        query_execution_id: z.union([z.string(), z.number()]),
        include: z.enum(["results"]).optional(),
        includeResults: z.boolean().optional(),
        row_limit: z.number().int().positive().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/query_executions/${String(args.query_execution_id)}`,
        {
          include: args.include,
          includeResults: args.includeResults,
          row_limit: args.row_limit,
        },
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "cancel_query_execution",
    {
      title: "Cancel Query Execution",
      description: "PATCH /accounts/:account_id/query_executions/:id/cancel. Scope: run:query_executions.",
      inputSchema: accountOptional.extend({ query_execution_id: z.union([z.string(), z.number()]) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "PATCH",
        `/accounts/${accountId}/query_executions/${String(args.query_execution_id)}/cancel`,
        {},
        {},
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "create_dry_run",
    {
      title: "Create Dry Run",
      description: "POST /accounts/:account_id/dry_runs. Scope: run:dry_runs.",
      inputSchema: accountOptional.extend({
        query: z.string().min(1),
        context: z.enum(["SavedQuery", "TransformationModel", "PrebuiltTransformation", "Alert"]),
        dataset_id: z.union([z.string(), z.number()]).optional(),
        package_version_id: z.union([z.string(), z.number()]).optional(),
        queryable_id: z.union([z.string(), z.number()]).optional(),
        queryable_type: z.string().optional(),
        run_with_dependencies: z.boolean().optional(),
        run_with_liquid: z.boolean().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "POST",
        `/accounts/${accountId}/dry_runs`,
        {},
        {
          dry_run: {
            query: args.query,
            context: args.context,
            dataset_id: args.dataset_id ?? null,
            package_version_id: args.package_version_id ?? null,
            queryable_id: args.queryable_id ?? null,
            queryable_type: args.queryable_type ?? null,
            run_with_dependencies: args.run_with_dependencies ?? false,
            run_with_liquid: args.run_with_liquid ?? false,
          },
        },
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dry_run",
    {
      title: "Get Dry Run",
      description: "GET /accounts/:account_id/dry_runs/:id. Scope: run:dry_runs.",
      inputSchema: accountOptional.extend({ dry_run_id: z.union([z.string(), z.number()]) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request("GET", `/accounts/${accountId}/dry_runs/${String(args.dry_run_id)}`, {}, undefined, accountId);
    },
  );

  registerTool(
    server,
    config,
    "install_all_paid_pro",
    {
      title: "Install All Paid Pro",
      description: "POST /accounts/:account_id/packages/all_paid_pro/install. Scope: run:packages.",
      inputSchema: accountOptional.extend({
        connector_id: z.string().min(1),
        dataset_display_name: z.string().min(1),
        package_version_id: z.union([z.string(), z.number()]).optional(),
        dataset_name: z.string().optional(),
        name_suffix: z.string().optional(),
        hotglue_dataset: z.boolean().optional(),
        stream_token: z.string().optional(),
        idempotency_key: z.string().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "POST",
        `/accounts/${accountId}/packages/all_paid_pro/install`,
        {},
        {
          connectorId: args.connector_id,
          datasetDisplayName: args.dataset_display_name,
          packageVersionId: args.package_version_id,
          datasetName: args.dataset_name,
          nameSuffix: args.name_suffix,
          hotglueDataset: args.hotglue_dataset,
          streamToken: args.stream_token,
          idempotencyKey: args.idempotency_key,
        },
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_package_install",
    {
      title: "Get Package Install",
      description: "GET /accounts/:account_id/package_installs/:id. Scope: run:packages.",
      inputSchema: accountOptional.extend({ package_install_id: z.union([z.string(), z.number()]) }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/package_installs/${String(args.package_install_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "create_dataset_bundle_export",
    {
      title: "Create Dataset Bundle Export",
      description:
        "POST /accounts/:account_id/datasets/:dataset_id/bundle_exports. Scope: run:dataset_bundle_exports.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        idempotency_key: z.string().optional(),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "POST",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/bundle_exports`,
        {},
        {
          bundleExport: {
            idempotencyKey: args.idempotency_key,
          },
        },
        accountId,
      );
    },
  );

  registerTool(
    server,
    config,
    "get_dataset_bundle_export",
    {
      title: "Get Dataset Bundle Export",
      description:
        "GET /accounts/:account_id/datasets/:dataset_id/bundle_exports/:id. Scope: run:dataset_bundle_exports.",
      inputSchema: accountOptional.extend({
        dataset_id: z.union([z.string(), z.number()]),
        bundle_export_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, request) => {
      const accountId = normalizeAccountId(args.account_id);
      return request(
        "GET",
        `/accounts/${accountId}/datasets/${String(args.dataset_id)}/bundle_exports/${String(args.bundle_export_id)}`,
        {},
        undefined,
        accountId,
      );
    },
  );

  return server;
}

export async function startServer() {
  const config = getConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await startServer();
}
