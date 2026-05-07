# Growth Nirvana Rails MCP Server

External MCP server for Growth Nirvana Rails MCP endpoints. It supports a hosted Claude connector over Streamable HTTP with user-delegated OAuth, while preserving the existing API-key mode for BFF/server-to-server workflows.

## Requirements

- Node `v20.19.1`
- `pnpm`

## Setup

```bash
nvm use v20.19.1
pnpm install
```

Environment variables:

- `MCP_AUTH_MODE` (optional, default `internal`): set to `oauth` for the hosted Claude connector.
- `GN_RAILS_BASE_URL` (optional): Rails host URL (default `https://app.growthnirvana.com`).
- `MCP_PUBLIC_BASE_URL` (optional): public MCP server origin for OAuth metadata (default `http://localhost:3000`).
- `MCP_RESOURCE_PATH` (optional): public MCP resource path (default `/mcp`).
- `GN_INTERNAL_API_KEY` (required for internal mode): plaintext key issued by `APIClientKey.issue!`.
- `GROWTH_NIRVANA_API_KEY` and `GROWTH_NIRVANA_BASE_URL` remain supported as legacy fallbacks.
  - The server automatically appends `/api/v1/mcp` if missing.
- `GROWTH_NIRVANA_TIMEOUT_MS` (optional, default `15000`)
- `GROWTH_NIRVANA_MAX_RETRIES` (optional, default `3`)

## Run and test

```bash
pnpm start
pnpm start:http
pnpm check
pnpm test
```

`pnpm start` runs the existing stdio server. `pnpm start:http` runs the Streamable HTTP server locally on `PORT` or `3000`.

## Hosted Claude OAuth Flow

For Claude, deploy the HTTP entrypoint and set:

```text
MCP_AUTH_MODE=oauth
GN_RAILS_BASE_URL=https://app.growthnirvana.com
MCP_PUBLIC_BASE_URL=https://mcp.growthnirvana.com
MCP_RESOURCE_PATH=/mcp
```

The server exposes:

- `POST /mcp`
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp`

Unauthenticated MCP requests return `401` with:

```http
WWW-Authenticate: Bearer resource_metadata="https://mcp.growthnirvana.com/.well-known/oauth-protected-resource/mcp"
```

Claude discovers Growth Nirvana Rails from the protected-resource metadata, completes the Doorkeeper authorization-code + PKCE flow there, then calls this MCP server with `Authorization: Bearer <oauth_access_token>`. The MCP server forwards that bearer token to Rails MCP endpoints and does not store user tokens.

Rails must also expose authorization-server metadata at `GET /.well-known/oauth-authorization-server` and enforce OAuth activity, scopes, account binding, and revocation.

## Internal API-key behavior

In the default `internal` auth mode, each Rails request sends:

- `Authorization: Bearer <api_key>` (preferred)
- `X-API-Key: <api_key>`

Key semantics enforced by Rails:

- master key: can operate across accounts
- client key: restricted to its own account
- account-scoped tools support `account_id="self"` (default when omitted)

## Vercel deployment

This package includes a Vercel serverless entrypoint at `api/mcp.js` and rewrites in `vercel.json` for `/mcp` plus the well-known OAuth metadata paths.

Use Streamable HTTP as the primary transport on Vercel. The implementation is stateless, creates request-scoped MCP transport state, uses JSON responses, and does not use in-memory user sessions or durable OAuth token storage. Avoid SSE-first deployments on Vercel unless you add deliberate external state/resumability support.

## Tool set

Master discovery tool:

- `search_accounts(q, page?, per_page?)`

Search and account-scoped tools:

- `browse_dataset_contexts(page?, perPage?, includeReporting?, includeAdClientDatasets?)`
- `search_dataset_contexts(q, page?, perPage?)`
- `get_dataset_context(datasetId, includeSql?, sqlModels?)`
- `suggest_dataset_context(datasetId)`
- `update_dataset_context(datasetId, datasetContext)` requires explicit user approval before use
- `list_connectors(account_id, provider?, q?, status?, updated_since?, page?, per_page?)`
- `get_connector(account_id, connector_id)`
- `search_datasets(account_id, q, page?, per_page?, updated_since?, type?, enabled?)`
- `list_warehouse_tables(account_id, page?, per_page?, updated_since?, name?, include?)`
- `search_warehouse_tables(account_id, q, page?, per_page?, include?)`
- `get_warehouse_table(account_id, warehouse_table_id, include?)`
- `list_warehouse_fields(account_id, page?, per_page?, updated_since?, name?, include?)`
- `search_warehouse_fields(account_id, q, page?, per_page?, include?)`
- `get_warehouse_field(account_id, warehouse_field_id, include?)`
- `search_transformation_models(account_id, q, dataset_id?, updated_since?, page?, per_page?)`
- `list_datasets(account_id, page?, per_page?, updated_since?, type?, enabled?, include?)`
- `get_dataset(account_id, dataset_id, include?)`
- `list_dataset_warehouse_tables(account_id, dataset_id, page?, per_page?, updated_since?, name?, include?)`
- `get_dataset_warehouse_table(account_id, dataset_id, warehouse_table_id, include?)`
- `list_dataset_warehouse_fields(account_id, dataset_id, warehouse_table_id, page?, per_page?, updated_since?, name?, include?)`
- `get_dataset_warehouse_field(account_id, dataset_id, warehouse_table_id, warehouse_field_id, include?)`
- `list_dataset_transformation_models(account_id, dataset_id, page?, per_page?, updated_since?, folder_id?)`
- `get_dataset_transformation_model(account_id, dataset_id, transformation_model_id)`
- `get_dataset_client_config(account_id, dataset_id)`

Top-level account tools:

- `list_transformation_models(account_id, page?, per_page?, dataset_id?, updated_since?)`
- `get_transformation_model(account_id, transformation_model_id)`
- `list_data_transformations(account_id, page?, per_page?, dataset_id?, active?, updated_since?)`
- `get_data_transformation(account_id, data_transformation_id)`

Async run tools:

- `create_query_execution(account_id, query, saved_query_id?, run_with_liquid?)`
- `get_query_execution(account_id, query_execution_id, include?, includeResults?, row_limit?)`
- `cancel_query_execution(account_id, query_execution_id)`
- `create_dry_run(account_id, query, context, dataset_id?, package_version_id?, queryable_id?, queryable_type?, run_with_dependencies?, run_with_liquid?)`
- `get_dry_run(account_id, dry_run_id)`
- `install_all_paid_pro(account_id, connector_id, dataset_display_name, package_version_id?, dataset_name?, name_suffix?, hotglue_dataset?, stream_token?, idempotency_key?)`
- `get_package_install(account_id, package_install_id)`
- `create_dataset_bundle_export(account_id, dataset_id, idempotency_key?)`
- `get_dataset_bundle_export(account_id, dataset_id, bundle_export_id)`

Report spec tools:

- `list_report_templates(account_id, page?, per_page?)`
- `get_report_template(account_id, report_template_id)`
- `create_report_template(account_id, queries?, sections?, defaultDateWindow?, brandKit?, schedule?)` requires explicit user approval before use
- `update_report_template(account_id, report_template_id, queries?, sections?, defaultDateWindow?, brandKit?, schedule?)` requires explicit user approval before use
- `list_report_specs(account_id, dataset_id?, resolved?, page?, per_page?)`
- `get_report_spec(account_id, report_spec_id, resolved?)`
- `create_report_spec(account_id, dataset_id, templateId?, queries?, sections?, defaultDateWindow?, brandKit?, schedule?)` requires explicit user approval before use
- `update_report_spec(account_id, report_spec_id, dataset_id?, templateId?, queries?, sections?, defaultDateWindow?, brandKit?, schedule?)` requires explicit user approval before use
- `run_report_spec(account_id, report_spec_id, idempotency_key?)` requires explicit user approval before use
- `get_report_run(account_id, report_run_id)`
- `cancel_report_run(account_id, report_run_id)`
- `list_published_reports(account_id, report_spec_id?, dataset_id?, page?, per_page?)`
- `get_published_report(account_id, published_report_id)`
- `get_brand_kit(account_id)`
- `update_brand_kit(account_id, brandKit)` requires explicit user approval before use

## Scopes

Scopes expected by the tools:

- `read:accounts` (for `search_accounts`; master key flow)
- `read:datasets`
- `read:dataset_contexts`
- `read:warehouse_tables`
- `read:warehouse_fields`
- `read:connectors`
- `read:transformation_models`
- `read:client_dataset_config`
- `read:data_transformations`
- `read:report_templates`
- `write:report_templates`
- `read:report_specs`
- `write:report_specs`
- `run:reports`
- `read:report_runs`
- `read:published_reports`
- `read:brand_kits`
- `write:brand_kits`
- `run:query_executions`
- `run:dry_runs`
- `run:packages`
- `run:dataset_bundle_exports`
- `write:dataset_contexts`
- `read:*` and `*` wildcard support is server-side
- `run:*` wildcard support is server-side

## Dataset context workflow

Rails OpenAPI docs provide endpoint and response shapes at [Growth Nirvana MCP Swagger UI](https://app.growthnirvana.com/api/docs/mcp/index.html). This README documents MCP tool behavior, scope expectations, and agent workflow.

Dataset context scopes:

| Tool | Rails endpoint | Required scopes |
| --- | --- | --- |
| `browse_dataset_contexts` | `GET /api/v1/mcp/accounts/self/dataset_contexts` | `read:datasets`, `read:dataset_contexts` |
| `search_dataset_contexts` | `GET /api/v1/mcp/accounts/self/dataset_contexts/search` | `read:datasets`, `read:dataset_contexts` |
| `get_dataset_context` | `GET /api/v1/mcp/accounts/self/datasets/:dataset_id/context` | `read:datasets`, `read:dataset_contexts`, `read:warehouse_tables`, `read:transformation_models`, `read:client_dataset_config` |
| `suggest_dataset_context` | `POST /api/v1/mcp/accounts/self/datasets/:dataset_id/context/suggestions` | `read:datasets`, `read:dataset_contexts` |
| `update_dataset_context` | `PATCH /api/v1/mcp/accounts/self/datasets/:dataset_id/context` | `write:dataset_contexts` |

Prefer `browse_dataset_contexts` and `search_dataset_contexts` before raw `list_datasets` when Claude needs to discover the right dataset for a user question. After selecting a likely dataset, use `get_dataset_context` to fetch full markdown guidance, table metadata, model lineage, compiled SQL, and pacing context from Rails.

For a question like “Can you give me performance this week vs last week for Deepgram?”:

1. Call `search_dataset_contexts` with a query such as `Deepgram performance`.
2. Select the best matching dataset context row.
3. Call `get_dataset_context` for that dataset, optionally with `includeSql` and `sqlModels`.
4. Read the markdown guidance to choose the preferred table/model, date field, metrics, and caveats.
5. Use warehouse, dry-run, and query execution tools as needed to inspect schema, validate SQL, and retrieve results.

`suggest_dataset_context` drafts context without saving it. `update_dataset_context` persists changes in Rails and should only be called after explicit user approval.

Use `update_dataset_context` for visibility changes instead of adding separate hide/feature tools. For assistant-authored updates, send `lastEditedBy: "assistant"` in `datasetContext`.

`datasetContext` may include:

- `visibility`: `hidden`, `normal`, or `featured`
- `priority`
- `summary`
- `contextMarkdown`
- `tags`
- `primaryTables`: array of `{ name, reason }` routing hints
- `recommendedQuestions`
- `caveats`
- `lastEditedBy`: `assistant`, `user`, or `system`

## Report spec workflow

Report spec tools let an agent manage reusable account-level templates, dataset-specific report specs, durable report runs, published report metadata, and brand-kit defaults.

Recommended report-authoring flow:

1. Discover the dataset with `search_dataset_contexts`, `get_dataset_context`, and warehouse table/field tools.
2. Read existing report templates with `list_report_templates` and fetch brand defaults with `get_brand_kit`.
3. If brand tokens are missing, inspect public client materials, propose safe palette/logo/font hints, and ask for user approval before `update_brand_kit`.
4. Draft report queries and sections from verified dataset context and schema.
5. Ask for explicit user approval before creating or updating report templates, specs, schedules, brand kits, or runs.
6. Save approved templates/specs with `create_report_template`, `update_report_template`, `create_report_spec`, or `update_report_spec`.
7. Fetch the resolved report spec with `get_report_spec` before execution or explanation.
8. Start a durable run with `run_report_spec`, then poll `get_report_run` until `succeeded`, `failed`, or `cancelled`.
9. Use `list_published_reports` or `get_published_report` when a run produces output metadata.

Report template and spec payloads use structured JSON fields: `queries`, `sections`, `defaultDateWindow`, `brandKit`, and `schedule`. Brand kits are non-executable hints only; do not send React, JavaScript, HTML, arbitrary CSS, or component source.

OAuth users with tokens minted before the report scopes were requested must reauthorize. Older tokens can keep using their existing scopes, but report tools will fail with `missing_scope` until consent includes the new report scopes.

## Response and error handling

Success envelopes are normalized and returned as:

- list: `{ data: [...], meta: { page, per_page, total }, errors: [] }`
- show: `{ data: {...}, errors: [] }`

Error envelope from Rails:

- `{ data: null, errors: [{ code, message }] }`

HTTP status behavior:

- `401`: invalid/missing key (no blind retry)
- `403`: missing scope or forbidden account/key type
- `404`: resource not found
- `422`: invalid query params
- `429` / `5xx`: exponential backoff retries

## Debug logging

Each request logs:

- request URL
- `account_id`
- status code
- Rails `error.code` and `error.message`

## Orchestration guidance

For ambiguous account names in master-key workflows:

1. call `search_accounts("Stackmatix")`
2. present matches and pick `account_id`
3. run account-scoped tools using that `account_id`

Sync strategy:

1. start with `get_dataset(account_id, dataset_id)`
2. fan out to dataset tables/models list tools
3. maintain independent `updated_since` cursors per resource type (datasets, tables, models)
4. page until complete using `page` + `per_page`

Dataset search notes:

- `search_datasets` is account-scoped and searches `name` + `alias_name`
- supports `q` (required), `page`, `per_page`, `updated_since`, `type`, `enabled`
- backend ranking is exact/prefix-first, then broader contains matches

Connector notes:

- `get_connector` expects provider-prefixed connector ids like `fivetran_123` or `hotglue_456`
- endpoints are metadata/link-first and do not return plaintext secrets/tokens

## Dataset client config payload

`get_dataset_client_config` exposes both:

- `customTransformationsConfig` (raw YAML string)
- `customTransformationsConfigParsed` (parsed object/hash)
