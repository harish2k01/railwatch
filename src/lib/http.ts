import { randomUUID } from "crypto";

import { ZodError, type ZodType } from "zod";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Rejects cross-origin mutations using the canonical request host. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin && process.env.NODE_ENV !== "production") return;
  if (!origin) throw new ApiError(403, "A same-origin request is required.", "INVALID_ORIGIN");

  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  // Opaque origins such as "null" are not URLs; reject them instead of failing the request.
  if (!URL.canParse(origin) || new URL(origin).host !== expectedHost) {
    throw new ApiError(403, "The request origin is not allowed.", "INVALID_ORIGIN");
  }
}

/** Reads a bounded JSON body and validates it against the route schema. */
export async function parseJson<T>(request: Request, schema: ZodType<T>, maxBytes = 64_000): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new ApiError(413, "The request is too large.", "PAYLOAD_TOO_LARGE");

  let body: unknown;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new ApiError(413, "The request is too large.", "PAYLOAD_TOO_LARGE");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "The request body must be valid JSON.", "INVALID_JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "Review the highlighted fields and try again.", "VALIDATION_ERROR", parsed.error.flatten());
  }
  return parsed.data;
}

/** Returns the standard API data envelope with private no-store caching. */
export function jsonData<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return Response.json({ data }, { ...init, headers });
}

/** Maps known validation and authorization failures to safe API errors and logs unexpected failures. */
export function routeError(error: unknown, request?: Request) {
  const requestId = request?.headers.get("x-request-id") ?? randomUUID();

  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details }, requestId },
      { status: error.status, headers: { "x-request-id": requestId } },
    );
  }

  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Review the submitted values.", details: error.flatten() }, requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  logger.error("api.unhandled_error", {
    requestId,
    path: request ? new URL(request.url).pathname : undefined,
    errorType: error instanceof Error ? error.name : "UnknownError",
    stack:error instanceof Error?error.stack?.split("\n").filter(line=>line.trim().startsWith("at ")).join("\n"):undefined,
  });
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }, requestId },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

/** Returns headers that prevent authenticated data from being cached. */
export function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
