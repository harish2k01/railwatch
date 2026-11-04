import "dotenv/config";
import Fastify from "fastify";
import { Readable } from "node:stream";
import { routes } from "./routes.generated";
import { withRequestContext } from "./context";
import { startScheduler } from "./scheduler";
import { prisma } from "@/lib/db";
import { routeError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { randomUUID } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

// The homelab cluster has no IPv6 egress; try IPv4 provider addresses first.
setDefaultResultOrder("ipv4first");

/** Builds the persistent HTTP backend, adapts Web API routes, and records correlated request outcomes. */
export function createBackend() {
  const server = Fastify({ bodyLimit: 11_000_000, requestTimeout: 30_000, connectionTimeout: 30_000, logger: false,genReqId:request=>{const id=request.headers["x-request-id"];return typeof id==="string"&&/^[a-f0-9-]{36}$/i.test(id)?id:randomUUID();} });
  server.addHook("onRequest",async(request,reply)=>{reply.header("x-request-id",request.id);request.headers["x-request-id"]=request.id;});
  server.addHook("onResponse",async(request,reply)=>{if(request.url.startsWith("/api/health/")&&reply.statusCode<400)return;logger.info("backend.request",{requestId:request.id,method:request.method,route:request.routeOptions.url??"unmatched",status:reply.statusCode,durationMs:Math.round(reply.elapsedTime)});});
  server.removeAllContentTypeParsers();
  server.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  for (const route of routes) {
    server.route({
      method: route.method, url: route.path,
      handler: async (incoming, reply) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const origin = process.env.APP_URL ?? "http://localhost:3000";
        // APP_URL is the canonical browser origin, never an untrusted forwarded host.
        headers.set("x-forwarded-host", new URL(origin).host);
        const request = new Request(new URL(incoming.url, origin), {
          method: incoming.method, headers,
          ...(incoming.body ? { body: incoming.body as Uint8Array<ArrayBuffer> } : {}),
        });
        const params = incoming.params as Record<string, string>;
        const response = await withRequestContext(request, async () => {
          try { return await route.handler(request, { params: Promise.resolve(params) }); }
          catch (error) { return routeError(error, request); }
        });
        reply.code(response.status);
        response.headers.forEach((value, name) => { if (name !== "set-cookie") reply.header(name, value); });
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) reply.header("set-cookie", setCookies);
        return response.body ? reply.send(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream)) : reply.send();
      },
    });
  }
  server.setErrorHandler((error, _request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({ error: { code: status === 413 ? "PAYLOAD_TOO_LARGE" : "REQUEST_FAILED", message: status === 413 ? "The request is too large." : "The request could not be completed." } });
  });
  return server;
}

if (process.env.NODE_ENV !== "test") {
  const server = createBackend();
  await server.listen({ port: Number(process.env.BACKEND_PORT ?? 3001), host: process.env.BACKEND_HOST ?? "0.0.0.0" });
  logger.info("backend.started",{port:Number(process.env.BACKEND_PORT??3001),scheduler:process.env.SCHEDULER_ENABLED!=="false"});
  const stopScheduler = process.env.SCHEDULER_ENABLED === "false" ? async () => {} : startScheduler();
  let stopping = false;
  const /** Stops the scheduler and closes the backend gracefully. */ stop = async () => { if (stopping) return; stopping = true; await server.close(); await stopScheduler(); await prisma.$disconnect(); };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}
