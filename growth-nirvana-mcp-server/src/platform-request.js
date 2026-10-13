export const PLATFORM_STATUSES_TERMINAL = new Set(["completed", "failed"]);

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function platformRequestBody(args) {
  return {
    platformRequest: {
      platform: args.platform,
      method: args.method,
      path: args.path,
      connectorId: args.connectorId,
      datasetId: args.datasetId,
      query: args.query,
      body: args.body,
      maxBytes: args.maxBytes,
    },
  };
}

export function platformRequestPostPath(accountId, args) {
  const datasetId = args.dataset_id ?? args.datasetId;
  if (datasetId !== undefined && datasetId !== null && datasetId !== "") {
    return `/accounts/${accountId}/datasets/${String(datasetId)}/platform_request`;
  }
  return `/accounts/${accountId}/platform_request`;
}

/**
 * Poll GET /platform_requests/:id until completed, failed, or timeout.
 * @param {Function} request - MCP tool request callback
 * @param {object} options
 */
export async function pollPlatformRequestUntilTerminal(request, options) {
  const {
    accountId,
    platformRequestId,
    maxWaitMs = 120_000,
    pollIntervalMs = 1_000,
    excludeBody = false,
  } = options;

  const deadline = Date.now() + maxWaitMs;
  let lastBody = null;

  while (Date.now() < deadline) {
    lastBody = await request(
      "GET",
      `/accounts/${accountId}/platform_requests/${platformRequestId}`,
      excludeBody ? { excludeBody: true } : {},
      undefined,
      accountId,
    );

    const status = lastBody?.data?.status;
    if (status && PLATFORM_STATUSES_TERMINAL.has(status)) {
      return lastBody;
    }

    await sleep(pollIntervalMs);
  }

  const err = new Error(
    `Platform request ${platformRequestId} did not reach a terminal status within ${maxWaitMs}ms (last status: ${lastBody?.data?.status ?? "unknown"})`,
  );
  err.code = "poll_timeout";
  err.lastResponse = lastBody;
  throw err;
}
