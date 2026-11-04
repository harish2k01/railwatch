import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { stableHash } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { CLIENT_ADDRESS_HEADER } from "@/lib/client-address";

type BucketRow = { count: number; resetAt: Date };

/** Resolves the client address the frontend gateway derived from the reverse proxy. */
function clientAddress(request: Request) {
  return request.headers.get(CLIENT_ADDRESS_HEADER) ?? "unknown";
}

/** Hashes the resolved client address for private rate-limit accounting. */
export function requestIpHash(request: Request) {
  return stableHash(clientAddress(request));
}

/** Atomically consumes a rate-limit bucket and rejects excess attempts. */
export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = clientAddress(request),
) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const key = `${scope}:${stableHash(discriminator)}`;
  const rows = await prisma.$queryRaw<BucketRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count", "resetAt"
  `);

  const bucket = rows[0];
  if (bucket && bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000));
    throw new ApiError(429, `Too many requests. Try again in ${retryAfter} seconds.`, "RATE_LIMITED");
  }
}
