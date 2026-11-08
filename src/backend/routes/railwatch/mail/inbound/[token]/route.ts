import { prisma } from "@/lib/db";
import { ApiError, jsonData, routeError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inboundHash, ingestMail, parseRawMail } from "@/lib/ticket-mail";

const MAX = 2_000_000;
type Context = { params: Promise<{ token: string }> };

/**
 * Forwarded mail: an email relay (for example a Cloudflare Email Worker) POSTs the raw message here. The secret token
 * in the path identifies the account; only IRCTC booking emails and Gmail's forwarding confirmation are acted on.
 */
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new ApiError(404, "Not found.");
    await enforceRateLimit(request, "mail-inbound", 60, 3600_000, token);
    const box = await prisma.railMailbox.findUnique({ where: { inboundHash: inboundHash(token) }, select: { userId: true, user: { select: { isActive: true } } } });
    if (!box?.user.isActive) throw new ApiError(404, "Not found.");
    if (Number(request.headers.get("content-length")) > MAX) throw new ApiError(413, "Message too large.");
    const raw = Buffer.from(await request.arrayBuffer()); if (raw.length > MAX) throw new ApiError(413, "Message too large.");
    const result = await ingestMail(box.userId, await parseRawMail(raw, `inbound:${Date.now()}`));
    await prisma.railMailbox.update({ where: { userId: box.userId }, data: { checkedAt: new Date(), ...(/^(attached|created)/.test(result) ? { lastResult: result } : {}) } });
    return jsonData({ result });
  } catch (error) { return routeError(error, request); }
}
