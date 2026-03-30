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

export async function railsGet({
  baseUrl,
  apiKey,
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
    apiKey,
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
  apiKey,
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
    apiKey,
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
  apiKey,
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
    apiKey,
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
  apiKey,
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
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        Accept: "application/json",
      };
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
        console.error(
          `[growth-nirvana-mcp] url=${url} account_id=${accountId} status=${response.status} error_code=${code} error_message=${message}`,
        );

        if (shouldRetry(response.status) && attempt <= maxRetries) {
          const backoffMs = backoffBaseMs * 2 ** (attempt - 1);
          await sleep(backoffMs);
          continue;
        }

        const err = new Error(message);
        err.name = "RailsApiError";
        err.status = response.status;
        err.code = code;
        err.errors = errors;
        err.url = url;
        throw err;
      }

      console.error(
        `[growth-nirvana-mcp] url=${url} account_id=${accountId} status=${response.status} error_code=none error_message=none`,
      );

      return parsedBody;
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

export function toToolError(error) {
  const status = error?.status;
  const code = error?.code || "unknown_error";
  const message = error?.message || "Unknown request error";

  const statusHint =
    status === 401
      ? "invalid_or_missing_key"
      : status === 403
        ? "scope_or_account_mismatch"
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
