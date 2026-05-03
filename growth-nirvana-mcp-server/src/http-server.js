import { createServer as createHttpServer } from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getConfig } from "./config.js";
import { createServer as createMcpServer } from "./server.js";
import {
  bearerTokenFromHeader,
  buildWwwAuthenticate,
  protectedResourceMetadata,
} from "./oauth.js";

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function textResponse(text, { status = 200, headers = {} } = {}) {
  return new Response(text, {
    status,
    headers,
  });
}

function isProtectedResourceMetadataPath(pathname) {
  return (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  );
}

function isMcpPath(pathname, config) {
  return pathname === config.resourcePath || pathname === "/api/mcp";
}

function unauthorizedResponse(config, error) {
  return textResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": buildWwwAuthenticate(config, { error }),
    },
  });
}

export async function handleWebRequest(request, config = getConfig()) {
  const url = new URL(request.url);

  if (request.method === "GET" && isProtectedResourceMetadataPath(url.pathname)) {
    const payload = protectedResourceMetadata(config);
    console.error(
      "[growth-nirvana-mcp] protected_resource_metadata_response",
      JSON.stringify({
        method: request.method,
        path: url.pathname,
        status: 200,
        userAgent: request.headers.get("user-agent"),
        payload,
      }),
    );
    return jsonResponse(payload);
  }

  if (!isMcpPath(url.pathname, config)) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  if (request.method !== "POST") {
    return textResponse("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "POST",
      },
    });
  }

  let requestConfig = config;
  if (config.authMode === "oauth") {
    const bearerToken = bearerTokenFromHeader(request.headers.get("authorization"));
    if (!bearerToken) return unauthorizedResponse(config);
    requestConfig = { ...config, oauthBearerToken: bearerToken };
  }

  const mcpServer = createMcpServer(requestConfig);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await mcpServer.connect(transport);
    return await transport.handleRequest(request, {
      authInfo:
        requestConfig.authMode === "oauth"
          ? { token: requestConfig.oauthBearerToken }
          : undefined,
    });
  } catch (error) {
    console.error("[growth-nirvana-mcp] streamable_http_error", error);
    return jsonResponse({ error: "internal_server_error" }, { status: 500 });
  } finally {
    await transport.close();
  }
}

function headersFromNodeRequest(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value !== undefined) headers.set(key, String(value));
  }
  return headers;
}

async function readNodeRequestBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function nodeRequestToWebRequest(req) {
  const headers = headersFromNodeRequest(req);
  const host = headers.get("host") || "localhost";
  const protocol = headers.get("x-forwarded-proto") || "http";
  const url = new URL(req.url || "/", `${protocol}://${host}`);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await readNodeRequestBody(req) : undefined;

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

export async function writeWebResponse(nodeResponse, webResponse) {
  nodeResponse.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  const body = Buffer.from(await webResponse.arrayBuffer());
  nodeResponse.end(body);
}

export async function handleNodeRequest(req, res, config = getConfig()) {
  const request = await nodeRequestToWebRequest(req);
  const response = await handleWebRequest(request, config);
  await writeWebResponse(res, response);
}

export function startHttpServer({
  config = getConfig(),
  port = Number.parseInt(process.env.PORT || "3000", 10),
} = {}) {
  const server = createHttpServer((req, res) => {
    handleNodeRequest(req, res, config).catch((error) => {
      console.error("[growth-nirvana-mcp] http_server_error", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  server.listen(port, () => {
    console.error(`[growth-nirvana-mcp] HTTP server listening on :${port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  startHttpServer();
}
