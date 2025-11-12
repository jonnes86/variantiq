// server.mjs
import { createServer } from "node:http";
import { createRequestHandler } from "@remix-run/node";

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

// Import the build and use the default export
let buildModule;
try {
  buildModule = await import("./build/server/index.js");
  console.log("Build module keys:", Object.keys(buildModule));
  console.log("Has default?", !!buildModule.default);
  console.log("Build module.default keys:", buildModule.default ? Object.keys(buildModule.default) : "no default");
  console.log("Routes:", buildModule.default?.routes || buildModule.routes);
} catch (error) {
  console.error("Failed to load build:", error);
  process.exit(1);
}

// Use .default to get the actual build
const build = buildModule.default || buildModule;

console.log("Final build object keys:", Object.keys(build));
console.log("Final build.routes:", build.routes);

const handler = createRequestHandler({ build, mode: process.env.NODE_ENV });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
      duplex: "half",
    });

    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      };
      pump();
    } else {
      res.end();
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Server error");
  }
}).listen(PORT, HOST, () => {
  console.log(`✅ Remix server listening on ${HOST}:${PORT}`);
});