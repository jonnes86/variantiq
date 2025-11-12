// server.mjs
import http from "http";
import { createRequestHandler } from "@remix-run/serve";

// Import the compiled Remix build at runtime so each deploy uses the latest build
const build = await import("./build/server/index.js");

// Create the request handler once
const handler = createRequestHandler({ build });

const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  // Let Remix handle every request (including /healthz)
  handler(req, res);
});

server.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
