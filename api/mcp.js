import { getConfig } from "../growth-nirvana-mcp-server/src/config.js";
import { handleNodeRequest } from "../growth-nirvana-mcp-server/src/http-server.js";

export default async function handler(req, res) {
  await handleNodeRequest(req, res, getConfig());
}
