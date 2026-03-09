import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { railsGet, toToolError } from "./http.js";

const accountRequired = z.object({
  account_id: z.union([z.string(), z.number()]),
});

const qRequired = z.object({
  q: z.string().min(1),
});

const pagingFields = {
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().optional(),
  updated_since: z.string().optional(),
};

function toToolSuccess(body) {
  const payload = {
    data: body?.data ?? null,
    errors: Array.isArray(body?.errors) ? body.errors : [],
  };

  if (body?.meta !== undefined) {
    payload.meta = body.meta;
  }

  return {
    structuredContent: payload,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function normalizeAccountId(value) {
  return String(value);
}

async function doGet(path, params, accountId) {
  return railsGet({
    baseUrl: this.baseUrl,
    apiKey: this.apiKey,
    path,
    params,
    accountId,
    timeoutMs: this.timeoutMs,
    maxRetries: this.maxRetries,
  });
}

function registerToolWithGet(server, config, name, meta, handler) {
  server.registerTool(name, meta, async (args) => {
    try {
      const body = await handler(args, async (path, params, accountId) =>
        doGet.call(config, path, params, accountId),
      );
      return toToolSuccess(body);
    } catch (error) {
      return toToolError(error);
    }
  });
}

export function createServer(config) {
  const server = new McpServer({
    name: "growth-nirvana-rails-mcp",
    version: "0.2.0",
  });

  registerToolWithGet(
    server,
    config,
    "search_accounts",
    {
      title: "Search Accounts",
      description:
        "Searches accounts by partial name. Requires read:accounts scope and master key.",
      inputSchema: qRequired.extend({
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
      }),
    },
    async (args, get) =>
      get(
        "/accounts/search",
        { q: args.q, page: args.page, per_page: args.per_page },
        "global",
      ),
  );

  registerToolWithGet(
    server,
    config,
    "search_transformation_models",
    {
      title: "Search Transformation Models",
      description:
        "Searches transformation models by name and returns model metadata plus SQL payload. Required scope: read:transformation_models or wildcard.",
      inputSchema: accountRequired.extend({
        q: z.string().min(1),
        dataset_id: z.union([z.string(), z.number()]).optional(),
        updated_since: z.string().optional(),
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/transformation_models/search`,
        {
          q: args.q,
          dataset_id: args.dataset_id,
          updated_since: args.updated_since,
          page: args.page,
          per_page: args.per_page,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_connectors",
    {
      title: "List Connectors",
      description:
        "Lists account connectors (link-first metadata only). Required scope: read:connectors or wildcard.",
      inputSchema: accountRequired.extend({
        provider: z.enum(["fivetran", "hotglue"]).optional(),
        q: z.string().optional(),
        status: z.string().optional(),
        ...pagingFields,
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/connectors`,
        {
          provider: args.provider,
          q: args.q,
          status: args.status,
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_connector",
    {
      title: "Get Connector",
      description:
        "Gets a connector by provider-prefixed id. Required scope: read:connectors or wildcard.",
      inputSchema: accountRequired.extend({
        connector_id: z.string().min(1),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const connectorId = String(args.connector_id);
      return get(`/accounts/${accountId}/connectors/${connectorId}`, {}, accountId);
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_datasets",
    {
      title: "List Datasets",
      description:
        "Lists datasets for an account. Required scope: read:datasets or wildcard.",
      inputSchema: accountRequired.extend({
        ...pagingFields,
        type: z.string().optional(),
        enabled: z.union([z.boolean(), z.string()]).optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/datasets`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          type: args.type,
          enabled: args.enabled,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "search_datasets",
    {
      title: "Search Datasets",
      description:
        "Searches datasets by name and alias_name within an account. Required scope: read:datasets or wildcard.",
      inputSchema: accountRequired.extend({
        q: z.string().min(1),
        page: z.number().int().positive().optional(),
        per_page: z.number().int().positive().optional(),
        updated_since: z.string().optional(),
        type: z.string().optional(),
        enabled: z.union([z.boolean(), z.string()]).optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/datasets/search`,
        {
          q: args.q,
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          type: args.type,
          enabled: args.enabled,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_dataset",
    {
      title: "Get Dataset",
      description:
        "Gets a dataset by ID. include supports warehouse_tables,transformation_models. Required scope: read:datasets or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        include: z.string().optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}`,
        { include: args.include },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_dataset_warehouse_tables",
    {
      title: "List Dataset Warehouse Tables",
      description:
        "Lists warehouse tables for a dataset. Required scope: read:warehouse_tables or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        name: z.string().optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/warehouse_tables`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_dataset_warehouse_table",
    {
      title: "Get Dataset Warehouse Table",
      description:
        "Gets a warehouse table by ID within a dataset. Required scope: read:warehouse_tables or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      const warehouseTableId = String(args.warehouse_table_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/warehouse_tables/${warehouseTableId}`,
        {},
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_dataset_warehouse_fields",
    {
      title: "List Dataset Warehouse Fields",
      description:
        "Lists warehouse fields for a warehouse table in a dataset. Required scope: read:warehouse_tables or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        name: z.string().optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      const warehouseTableId = String(args.warehouse_table_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/warehouse_tables/${warehouseTableId}/warehouse_fields`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          name: args.name,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_dataset_warehouse_field",
    {
      title: "Get Dataset Warehouse Field",
      description:
        "Gets a warehouse field by id for a warehouse table in a dataset. Required scope: read:warehouse_tables or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        warehouse_table_id: z.union([z.string(), z.number()]),
        warehouse_field_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      const warehouseTableId = String(args.warehouse_table_id);
      const warehouseFieldId = String(args.warehouse_field_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/warehouse_tables/${warehouseTableId}/warehouse_fields/${warehouseFieldId}`,
        {},
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_dataset_transformation_models",
    {
      title: "List Dataset Transformation Models",
      description:
        "Lists transformation models for a dataset. Required scope: read:transformation_models or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        ...pagingFields,
        folder_id: z.union([z.string(), z.number()]).optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/transformation_models`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          folder_id: args.folder_id,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_dataset_transformation_model",
    {
      title: "Get Dataset Transformation Model",
      description:
        "Gets a transformation model by ID within a dataset. Required scope: read:transformation_models or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
        transformation_model_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      const modelId = String(args.transformation_model_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/transformation_models/${modelId}`,
        {},
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_dataset_client_config",
    {
      title: "Get Dataset Client Config",
      description:
        "Gets client dataset config including raw and parsed custom transformations config. Required scope: read:client_dataset_config or wildcard.",
      inputSchema: accountRequired.extend({
        dataset_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const datasetId = String(args.dataset_id);
      return get(
        `/accounts/${accountId}/datasets/${datasetId}/client_dataset_config`,
        {},
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_transformation_models",
    {
      title: "List Transformation Models",
      description:
        "Lists account-level transformation models. Required scope: read:transformation_models or wildcard.",
      inputSchema: accountRequired.extend({
        ...pagingFields,
        folder_id: z.union([z.string(), z.number()]).optional(),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/transformation_models`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
          folder_id: args.folder_id,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_transformation_model",
    {
      title: "Get Transformation Model",
      description:
        "Gets an account-level transformation model by ID. Required scope: read:transformation_models or wildcard.",
      inputSchema: accountRequired.extend({
        transformation_model_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const modelId = String(args.transformation_model_id);
      return get(
        `/accounts/${accountId}/transformation_models/${modelId}`,
        {},
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "list_data_transformations",
    {
      title: "List Data Transformations",
      description:
        "Lists account-level data transformations. Required scope: read:data_transformations or wildcard.",
      inputSchema: accountRequired.extend({
        ...pagingFields,
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      return get(
        `/accounts/${accountId}/data_transformations`,
        {
          page: args.page,
          per_page: args.per_page,
          updated_since: args.updated_since,
        },
        accountId,
      );
    },
  );

  registerToolWithGet(
    server,
    config,
    "get_data_transformation",
    {
      title: "Get Data Transformation",
      description:
        "Gets an account-level data transformation by ID. Required scope: read:data_transformations or wildcard.",
      inputSchema: accountRequired.extend({
        data_transformation_id: z.union([z.string(), z.number()]),
      }),
    },
    async (args, get) => {
      const accountId = normalizeAccountId(args.account_id);
      const transformationId = String(args.data_transformation_id);
      return get(
        `/accounts/${accountId}/data_transformations/${transformationId}`,
        {},
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
