// app/routes/healthz.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader(_args: LoaderFunctionArgs) {
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
}
