// server.mjs
import { createServer } from "node:http";
import { createRequestHandler } from "@remix-run/node";
import * as build from "./build/server/index.js";

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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Server error");
  }
}).listen(process.env.PORT || 3000, () =>
  console.log(`✅ Remix listening on ${process.env.PORT || 3000}`)
);
