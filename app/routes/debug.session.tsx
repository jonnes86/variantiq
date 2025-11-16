import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    
    return json({
      success: true,
      sessionId: session.id,
      shop: session.shop,
      scope: session.scope,
      isOnline: session.isOnline,
      accessToken: session.accessToken ? "EXISTS" : "MISSING"
    });
  } catch (error: any) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export default function DebugSession() {
  const data = useLoaderData<typeof loader>();
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', whiteSpace: 'pre' }}>
      {JSON.stringify(data, null, 2)}
    </div>
  );
}
