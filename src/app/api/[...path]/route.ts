// Same-origin API gateway only. All application logic and secrets live in the backend.
import {randomUUID} from "node:crypto";
import {logger} from "@/lib/logger";
import {forwardClientAddress} from "@/lib/client-address";
export const dynamic = "force-dynamic";
/** Streams same-origin API traffic to the private backend with correlated timing and failure logs. */
async function proxy(request: Request) {
  const started=performance.now(),requestId=randomUUID(),path=new URL(request.url).pathname;
  let status=503;
  try {
    const incoming = new URL(request.url);
    // Set path and query separately: resolving a client path against a base URL
    // would let a leading // replace the private backend's host.
    const url = new URL(process.env.BACKEND_URL ?? "http://127.0.0.1:3001");
    if (!incoming.pathname.startsWith("/api/") || incoming.pathname.includes("\\") ||
        !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      status = 400;
      return Response.json({ error: { code: "INVALID_API_PATH", message: "Invalid API request." } }, { status });
    }
    url.pathname = incoming.pathname;
    url.search = incoming.search;
    url.hash = "";
    const headers = new Headers(request.headers);
    headers.set("x-request-id",requestId);
    for (const name of ["host", "connection", "transfer-encoding", "content-length", "x-forwarded-host", "x-forwarded-proto"]) headers.delete(name);
    forwardClientAddress(request.headers, headers);
    const response = await fetch(url, {
      method: request.method, headers, redirect: "manual", cache: "no-store",
      ...(request.body ? { body: request.body, duplex: "half" as const } : {}), signal: AbortSignal.timeout(300_000),
    });
    const outgoing = new Headers(response.headers);
    status=response.status;outgoing.set("x-request-id",requestId);
    for (const name of ["connection", "transfer-encoding", "content-encoding", "content-length"]) outgoing.delete(name);
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch(error) {
    logger.error("frontend.backend_unavailable",{requestId,method:request.method,path,errorType:error instanceof Error?error.name:"UnknownError"});
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", message: "RailWatch is temporarily unavailable. Try again shortly." } }, { status: 503,headers:{"x-request-id":requestId} });
  }finally{if(!path.startsWith("/api/health/")||status>=400)logger.info("frontend.api_request",{requestId,method:request.method,path,status,durationMs:Math.round(performance.now()-started)});}
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
