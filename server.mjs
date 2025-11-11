// server.mjs
import express from "express";
import { createRequestHandler } from "@remix-run/express";

const app = express();
const port = process.env.PORT || 8080;

// simple health endpoint for Railway checks
app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

// load the Remix server build (ESM) and wire the handler
const build = await import("./build/server/index.js");
app.all(
  "*",
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  })
);

app.listen(port, () => {
  console.log(`✅ listening on ${port}`);
});
