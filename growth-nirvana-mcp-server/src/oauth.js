export const MCP_SCOPES = [
  "read:accounts",
  "read:connectors",
  "read:datasets",
  "read:dataset_contexts",
  "read:warehouse_tables",
  "read:transformation_models",
  "read:data_transformations",
  "read:client_dataset_config",
  "run:query_executions",
  "run:dry_runs",
  "run:data_transformation_executions",
  "run:packages",
  "run:dataset_bundle_exports",
  "write:dataset_contexts",
  "write:hotglue_connections",
];

export function protectedResourceMetadata(config) {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.railsBaseUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: MCP_SCOPES,
  };
}

export function protectedResourceMetadataUrl(config) {
  return `${config.publicBaseUrl}/.well-known/oauth-protected-resource/mcp`;
}

export function buildWwwAuthenticate(config, { error, scope } = {}) {
  const params = [];
  if (error) params.push(`error="${error}"`);
  params.push(`resource_metadata="${protectedResourceMetadataUrl(config)}"`);
  if (scope) params.push(`scope="${scope}"`);
  return `Bearer ${params.join(", ")}`;
}

export function bearerTokenFromHeader(header) {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
