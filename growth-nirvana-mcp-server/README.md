# Growth Nirvana Rails MCP Server

External MCP server for account-scoped, API-key-protected read endpoints backed by Growth Nirvana Rails.

## Requirements

- Node `v20.19.1`
- `pnpm`

## Setup

```bash
nvm use v20.19.1
pnpm install
```

Environment variables:

- `GROWTH_NIRVANA_API_KEY` (required): plaintext key issued by `APIClientKey.issue!`
- `GROWTH_NIRVANA_BASE_URL` (optional): Rails host URL (default `https://app.growthnirvana.com`)
  - The server automatically appends `/api/v1/mcp` if missing.
- `GROWTH_NIRVANA_TIMEOUT_MS` (optional, default `15000`)
- `GROWTH_NIRVANA_MAX_RETRIES` (optional, default `3`)

## Run and test

```bash
pnpm start
pnpm check
pnpm test
```

## Auth and key behavior

Each request sends:

- `Authorization: Bearer <api_key>` (preferred)
- `X-API-Key: <api_key>`

Key semantics enforced by Rails:

- master key: can operate across accounts
- client key: restricted to its own account

## Tool set

Master discovery tool:

- `search_accounts(q, page?, per_page?)`

Search and account-scoped tools:

- `list_connectors(account_id, provider?, q?, status?, updated_since?, page?, per_page?)`
- `get_connector(account_id, connector_id)`
- `search_datasets(account_id, q, page?, per_page?, updated_since?, type?, enabled?)`
- `search_transformation_models(account_id, q, dataset_id?, updated_since?, page?, per_page?)`
- `list_datasets(account_id, page?, per_page?, updated_since?, type?, enabled?)`
- `get_dataset(account_id, dataset_id, include?)`
- `list_dataset_warehouse_tables(account_id, dataset_id, page?, per_page?, updated_since?, name?)`
- `get_dataset_warehouse_table(account_id, dataset_id, warehouse_table_id)`
- `list_dataset_warehouse_fields(account_id, dataset_id, warehouse_table_id, page?, per_page?, updated_since?, name?)`
- `get_dataset_warehouse_field(account_id, dataset_id, warehouse_table_id, warehouse_field_id)`
- `list_dataset_transformation_models(account_id, dataset_id, page?, per_page?, updated_since?, folder_id?)`
- `get_dataset_transformation_model(account_id, dataset_id, transformation_model_id)`
- `get_dataset_client_config(account_id, dataset_id)`

Top-level account tools:

- `list_transformation_models(account_id, page?, per_page?, updated_since?, folder_id?)`
- `get_transformation_model(account_id, transformation_model_id)`
- `list_data_transformations(account_id, page?, per_page?, updated_since?)`
- `get_data_transformation(account_id, data_transformation_id)`

## Scopes

Scopes expected by the tools:

- `read:accounts` (for `search_accounts`; master key flow)
- `read:datasets`
- `read:warehouse_tables`
- `read:connectors`
- `read:transformation_models`
- `read:client_dataset_config`
- `read:data_transformations`
- `read:*` and `*` wildcard support is server-side

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
