import { getConfig } from "../src/config.js";
import { handleNodeRequest } from "../src/http-server.js";

export default async function handler(req, res) {
  await handleNodeRequest(req, res, getConfig());
}
