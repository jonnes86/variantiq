// server.mjs
import http from "http";
import { createRequestHandler } from "@remix-run/serve";

const build = await import("./build/server/index.js");
const handler = createRequestHandler({ build });

const port = process.env.PORT || 8080;
http.createServer((req, res) => handler(req, res)).listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
