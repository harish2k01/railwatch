import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { ApiError, assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkMailbox, inboundHash, type ImapSettings } from "@/lib/ticket-mail";

const inboundUrl = (token: string) => new URL(`/api/railwatch/mail/inbound/${token}`, process.env.APP_URL ?? "http://localhost:3000").href;

/** Ticket email status: which sources are connected, the forwarding address, and the last outcome. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const box = await prisma.railMailbox.findUnique({ where: { userId: user.id } });
    const token = box?.inboundToken ? decryptSecret(box.inboundToken) : undefined;
    const imap = box?.imap ? JSON.parse(decryptSecret(box.imap)!) as ImapSettings : undefined;
    return jsonData({ gmail: Boolean(box?.gmail), imap: imap ? { host: imap.host, port: imap.port, user: imap.user } : null, forwarding: token ? inboundUrl(token) : null, checkedAt: box?.checkedAt ?? null, lastResult: box?.lastResult ?? null, lastError: box?.lastError ?? null, notice: box?.notice ?? null });
  } catch (error) { return routeError(error, request); }
}

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("forwarding") }),
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("imap"), host: z.string().trim().min(3).max(200).regex(/^[a-z0-9.-]+$/i), port: z.number().int().min(1).max(65535), user: z.string().trim().min(3).max(200), pass: z.string().min(4).max(200) }),
]);

/** Creates the forwarding address, saves (after testing) IMAP settings, or checks the sources now. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseJson(request, input);
    await prisma.railMailbox.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    if (body.action === "forwarding") {
      const token = randomBytes(24).toString("base64url");
      await prisma.railMailbox.update({ where: { userId: user.id }, data: { inboundHash: inboundHash(token), inboundToken: encryptSecret(token) } });
      return jsonData({ forwarding: inboundUrl(token) });
    }
    if (body.action === "imap") {
      await enforceRateLimit(request, "mail-imap", 10, 3600_000, user.id);
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({ host: body.host, port: body.port, secure: body.port === 993, auth: { user: body.user, pass: body.pass }, logger: false, socketTimeout: 20_000 });
      try { await client.connect(); await client.logout(); } catch { throw new ApiError(400, "Could not sign in to that mailbox. Check the server, port, address and app password."); }
      await prisma.railMailbox.update({ where: { userId: user.id }, data: { imap: encryptSecret(JSON.stringify({ host: body.host, port: body.port, user: body.user, pass: body.pass })), checkedAt: null, lastError: null } });
      return jsonData({ saved: true });
    }
    await enforceRateLimit(request, "mail-check", 12, 3600_000, user.id);
    return jsonData(await checkMailbox(user.id));
  } catch (error) { return routeError(error, request); }
}

/** Disconnects one source: ?source=gmail|imap|forwarding. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const source = new URL(request.url).searchParams.get("source");
    const data = source === "gmail" ? { gmail: null } : source === "imap" ? { imap: null } : source === "forwarding" ? { inboundHash: null, inboundToken: null } : source === "notice" ? { notice: null } : undefined;
    if (!data) throw new ApiError(400, "Unknown source.");
    await prisma.railMailbox.updateMany({ where: { userId: user.id }, data });
    return jsonData({ removed: source });
  } catch (error) { return routeError(error, request); }
}
