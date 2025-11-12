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
      // Node 20 supports fetch streams; duplex hint avoids a warning.
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
}).listen(process.env.PORT || 8080, () => {
  console.log(`✅ Remix server listening on ${process.env.PORT || 3000}`);
});
