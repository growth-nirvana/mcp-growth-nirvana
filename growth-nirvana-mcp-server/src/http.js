const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl, path, params) {
  const base = new URL(baseUrl);
  const normalizedBasePath = base.pathname.replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const fullPath = `${normalizedBasePath}/${normalizedPath}`;
  const url = new URL(fullPath, `${base.protocol}//${base.host}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function parseRailsError(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  const first = errors[0];
  return {
    code: first?.code || "unknown_error",
    message: first?.message || "Request failed",
    errors,
  };
}

// Rails names the account a response came from in X-GN-Account-Id / X-GN-Account-Name.
export function accountFromHeaders(headers) {
  const id = headers?.get?.("x-gn-account-id");
  if (!id) return null;
  const rawName = headers.get("x-gn-account-name") || "";
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch (_err) {
    name = rawName;
  }
  const numericId = Number(id);
  return { id: Number.isSafeInteger(numericId) ? numericId : id, name };
}

function withResponseAccount(body, response) {
  const account = accountFromHeaders(response?.headers);
  if (!account || !body || typeof body !== "object" || Array.isArray(body)) return body;
  return { ...body, account };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

function shouldRetry(status) {
  return RETRYABLE_STATUS.has(status);
}

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

function buildAuthHeaders({ authMode, apiKey, oauthBearerToken, toolName }) {
  const headers = {
    Accept: "application/json",
  };
  // Rails records the tool in its audit log for every call.
  if (toolName && TOOL_NAME_PATTERN.test(toolName)) headers["X-MCP-Tool"] = toolName;

  if (authMode === "oauth") {
    headers.Authorization = `Bearer ${oauthBearerToken}`;
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  headers["X-API-Key"] = apiKey;
  return headers;
}

export async function railsGet({
  baseUrl,
  authMode,
  apiKey,
  oauthBearerToken,
  toolName,
  path,
  params,
  accountId,
  timeoutMs,
  maxRetries,
  backoffBaseMs = 200,
}) {
  return railsRequest({
    method: "GET",
    baseUrl,
    authMode,
    apiKey,
    oauthBearerToken,
    toolName,
    path,
    params,
    accountId,
    timeoutMs,
    maxRetries,
    backoffBaseMs,
  });
}

export async function railsPost({
  baseUrl,
  authMode,
  apiKey,
  oauthBearerToken,
  toolName,
  path,
  params,
  body,
  accountId,
  timeoutMs,
  maxRetries,
  backoffBaseMs = 200,
}) {
  return railsRequest({
    method: "POST",
    baseUrl,
    authMode,
    apiKey,
    oauthBearerToken,
    toolName,
    path,
    params,
    body,
    accountId,
    timeoutMs,
    maxRetries,
    backoffBaseMs,
  });
}

export async function railsPatch({
  baseUrl,
  authMode,
  apiKey,
  oauthBearerToken,
  toolName,
  path,
  params,
  body,
  accountId,
  timeoutMs,
  maxRetries,
  backoffBaseMs = 200,
}) {
  return railsRequest({
    method: "PATCH",
    baseUrl,
    authMode,
    apiKey,
    oauthBearerToken,
    toolName,
    path,
    params,
    body,
    accountId,
    timeoutMs,
    maxRetries,
    backoffBaseMs,
  });
}

export async function railsPut({
  baseUrl,
  authMode,
  apiKey,
  oauthBearerToken,
  toolName,
  path,
  params,
  body,
  accountId,
  timeoutMs,
  maxRetries,
  backoffBaseMs = 200,
}) {
  return railsRequest({
    method: "PUT",
    baseUrl,
    authMode,
    apiKey,
    oauthBearerToken,
    toolName,
    path,
    params,
    body,
    accountId,
    timeoutMs,
    maxRetries,
    backoffBaseMs,
  });
}

export async function railsRequest({
  method,
  baseUrl,
  authMode = "internal",
  apiKey,
  oauthBearerToken,
  toolName,
  path,
  params,
  body: requestBody,
  accountId,
  timeoutMs,
  maxRetries,
  backoffBaseMs = 200,
}) {
  const url = buildUrl(baseUrl, path, params);
  let attempt = 0;

  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = buildAuthHeaders({ authMode, apiKey, oauthBearerToken, toolName });
      const hasBody = requestBody !== undefined;
      if (hasBody) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(requestBody) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const text = await response.text();
      const parsedBody = parseJsonSafe(text);
      const { code, message, errors } = parseRailsError(parsedBody);

      if (!response.ok) {
        const fallbackMessage =
          typeof text === "string" && text.trim().length > 0
            ? text.trim()
            : "Request failed";
        const effectiveMessage =
          message && message !== "Request failed" ? message : fallbackMessage;

        console.error(
          `[growth-nirvana-mcp] url=${url} account_id=${accountId} status=${response.status} error_code=${code} error_message=${effectiveMessage}`,
        );

        if (shouldRetry(response.status) && attempt <= maxRetries) {
          const backoffMs = backoffBaseMs * 2 ** (attempt - 1);
          await sleep(backoffMs);
          continue;
        }

        const err = new Error(effectiveMessage);
        err.name = "RailsApiError";
        err.status = response.status;
        err.code = code;
        err.errors = errors;
        err.raw_body = text;
        err.url = url;
        throw err;
      }

      console.error(
        `[growth-nirvana-mcp] url=${url} account_id=${accountId} status=${response.status} error_code=none error_message=none`,
      );

      return withResponseAccount(parsedBody, response);
    } catch (error) {
      clearTimeout(timeout);
      if (error?.name === "AbortError") {
        const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
        timeoutError.name = "RequestTimeoutError";
        timeoutError.code = "timeout";
        throw timeoutError;
      }
      throw error;
    }
  }
}

function nextStepFor(code, status) {
  if (code === "account_required") {
    return "The user has several Growth Nirvana accounts. Ask which one (errors[0].accounts lists them), then retry with that account_id.";
  }
  if (code === "insufficient_scope") {
    return "This sign-in is read-only for this action. Tell the user which permission is needed (errors[0].required_scope_label); they can reconnect Growth Nirvana and tick it on the consent screen.";
  }
  if (code === "mcp_role_not_allowed" || code === "no_mcp_accounts") {
    return "The user's role doesn't include MCP access in this account. An account admin can change the role.";
  }
  if (status === 404) {
    return "Not found, or not an account this user belongs to. Call list_my_accounts to see which accounts are available.";
  }
  return null;
}

export function toToolError(error) {
  const status = error?.status;
  const code = error?.code || "unknown_error";
  const message = error?.message || "Unknown request error";
  const errors = Array.isArray(error?.errors) ? error.errors : [];

  const statusHint =
    code === "account_required" ||
    code === "insufficient_scope" ||
    code === "mcp_role_not_allowed" ||
    code === "no_mcp_accounts"
      ? code
      : status === 401
      ? code === "invalid_token"
        ? "invalid_token"
        : "invalid_or_missing_key"
      : status === 403
        ? code === "missing_scope"
          ? "missing_scope"
          : "scope_or_account_mismatch"
        : status === 404
          ? "resource_not_found"
          : status === 422
            ? "invalid_request_params"
            : status
              ? `http_${status}`
              : "transport_error";

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: {
              status: status || null,
              status_hint: statusHint,
              code,
              message,
              next_step: nextStepFor(code, status),
              errors,
              raw_body: error?.raw_body || null,
            },
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
