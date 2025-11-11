import http from "http";
import { createRequestHandler } from "@remix-run/serve";

const host = "0.0.0.0";
const port = process.env.PORT || 8080;

// Simple health check endpoint
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  createRequestHandler({ build: await import("./build/server/index.js") })(req, res);
});

server.listen(port, host, () => {
  console.log(`[boot] listening on http://${host}:${port}`);
});
