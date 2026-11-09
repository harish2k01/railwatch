import { randomUUID, createHash } from "node:crypto";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { logger } from "./logger";
import { getProviderConfiguration, googleConfigured } from "./provider-config";
import { storedPlanner } from "./workspace-storage";
import { saveWorkspace } from "./railwatch-store";
import { emailText, isCancelEmail, isTicketEmail, parseCancelEmail, parseTicketEmail } from "./ticket-email";
import { applyCancelMail, applyTicketMail } from "./ticket-mail-apply";

/** A received email, from any source (Gmail API, IMAP, or forwarded to the inbound address). */
export type Mail = { id: string; from: string; subject: string; html?: string; text?: string };
export type ImapSettings = { host: string; port: number; user: string; pass: string };

const POLL_MS = 5 * 60_000, LOOKBACK_DAYS = 14, SEEN_CAP = 300;
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const inboundHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Parses a raw RFC 822 message. */
export async function parseRawMail(raw: Buffer | string, fallbackId: string): Promise<Mail> {
  const { simpleParser } = await import("mailparser");
  const m = await simpleParser(raw);
  return { id: m.messageId ?? fallbackId, from: m.from?.text ?? "", subject: m.subject ?? "", html: typeof m.html === "string" ? m.html : undefined, text: m.text };
}

/** Gmail's forwarding confirmation (sent when the user adds RailWatch as a forwarding address) carries a link to approve. */
function forwardingNotice(mail: Mail) {
  if (!/forwarding-noreply@google\.com/i.test(mail.from) || !/forwarding\s+confirmation/i.test(mail.subject)) return undefined;
  const body = mail.text ?? emailText(mail.html ?? "");
  const link = body.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"]+/)?.[0];
  const code = body.match(/Confirmation code:\s*(\d{6,12})/i)?.[1];
  return [code && `Gmail forwarding confirmation code: ${code}`, link && `Approve: ${link}`].filter(Boolean).join(" · ") || undefined;
}

/** Reads one mail and applies it to the account's journeys. Returns a short outcome for status and logs. */
export async function ingestMail(userId: string, mail: Mail): Promise<string> {
  const notice = forwardingNotice(mail);
  if (notice) { await prisma.railMailbox.updateMany({ where: { userId }, data: { notice } }); return "forwarding-confirmation"; }
  const cancel = isCancelEmail(mail.from, mail.subject) ? parseCancelEmail(mail.html ? emailText(mail.html) : mail.text ?? "") : undefined;
  if (!cancel && !isTicketEmail(mail.from, mail.subject)) return "ignored";
  const details = cancel ? {} : parseTicketEmail(mail.html ? emailText(mail.html) : mail.text ?? "");
  const workspace = await prisma.railWorkspace.findUnique({ where: { userId }, select: { payload: true, storageVersion: true, version: true } });
  if (!workspace) return "no-workspace";
  const planner = await storedPlanner(prisma, userId, workspace);
  const out = cancel ? applyCancelMail(planner, cancel) : applyTicketMail(planner, details, randomUUID);
  if (out.result === "attached" || out.result === "created") await saveWorkspace(userId, out.planner, workspace.version);
  logger.info(cancel ? "mail.cancellation" : "mail.ticket", { result: out.result });
  return out.journey ? `${out.result}:${out.journey.date} ${out.journey.from}-${out.journey.to}` : out.result;
}

async function gmailAccess(userId: string, sealed: string) {
  const config = await getProviderConfiguration(); const google = config.google;
  if (!googleConfigured(config) || !google) throw new Error("Google sign-in is not configured.");
  let tokens = JSON.parse(decryptSecret(sealed)!);
  if (!tokens.access_token || tokens.expiresAt < Date.now() + 60_000) {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: google.clientId, client_secret: google.clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("Reconnect Gmail to renew access.");
    const fresh = await r.json(); tokens = { ...tokens, ...fresh, expiresAt: Date.now() + fresh.expires_in * 1000 };
    await prisma.railMailbox.updateMany({ where: { userId }, data: { gmail: encryptSecret(JSON.stringify(tokens)) } });
  }
  return tokens.access_token as string;
}

async function gmailMails(userId: string, sealed: string, seen: Set<string>): Promise<Mail[]> {
  const token = await gmailAccess(userId, sealed);
  const get = async (path: string) => { const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`Gmail request failed (${r.status}).`); return r.json(); };
  const q = encodeURIComponent(`{from:irctc.co.in from:forwarding-noreply@google.com} newer_than:${LOOKBACK_DAYS}d`);
  const list = await get(`/messages?q=${q}&maxResults=25`);
  const mails: Mail[] = [];
  for (const { id } of (list.messages ?? []) as { id: string }[]) {
    if (seen.has(`gmail:${id}`)) continue;
    const msg = await get(`/messages/${id}?format=raw`);
    mails.push({ ...(await parseRawMail(Buffer.from(msg.raw, "base64url"), id)), id: `gmail:${id}` });
  }
  return mails;
}

async function imapMails(sealed: string, seen: Set<string>): Promise<Mail[]> {
  const s: ImapSettings = JSON.parse(decryptSecret(sealed)!);
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({ host: s.host, port: s.port, secure: s.port === 993, auth: { user: s.user, pass: s.pass }, logger: false, socketTimeout: 30_000 });
  await client.connect();
  const mails: Mail[] = [];
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
      const uids = [...new Set([...(await client.search({ from: "irctc.co.in", since }, { uid: true }) || []), ...(await client.search({ from: "forwarding-noreply@google.com", since }, { uid: true }) || [])])].slice(-25);
      const validity = String(client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidValidity : "");
      for (const uid of uids) {
        const key = `imap:${validity}:${uid}`; if (seen.has(key)) continue;
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg && msg.source) mails.push({ ...(await parseRawMail(msg.source, key)), id: key });
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => undefined); }
  return mails;
}

/** Checks one account's connected sources now. */
export async function checkMailbox(userId: string): Promise<{ checked: number; applied: string[] }> {
  const box = await prisma.railMailbox.findUnique({ where: { userId } });
  if (!box || (!box.gmail && !box.imap)) return { checked: 0, applied: [] };
  const seen = new Set(box.seen); const applied: string[] = []; const errors: string[] = []; let checked = 0;
  for (const [source, read] of [["Gmail", box.gmail && (() => gmailMails(userId, box.gmail!, seen))], ["IMAP", box.imap && (() => imapMails(box.imap!, seen))]] as const) {
    if (!read) continue;
    try { for (const mail of await read()) { checked++; const r = await ingestMail(userId, mail); seen.add(mail.id); if (/^(attached|created)/.test(r)) applied.push(r); } }
    catch (error) { errors.push(`${source}: ${error instanceof Error ? error.message.slice(0, 160) : "check failed"}`); logger.error("mail.check_failed", { source, errorType: error instanceof Error ? error.name : "UnknownError" }); }
  }
  await prisma.railMailbox.update({ where: { userId }, data: { seen: [...seen].slice(-SEEN_CAP), checkedAt: new Date(), lastError: errors.join(" · ") || null, ...(applied.length ? { lastResult: applied.join(", ").slice(0, 500) } : {}) } });
  return { checked, applied };
}

/** Worker step: checks connected Gmail/IMAP sources every few minutes. */
export async function pollMailboxes(now = new Date()) {
  const due = await prisma.railMailbox.findMany({ where: { OR: [{ gmail: { not: null } }, { imap: { not: null } }], AND: [{ OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - POLL_MS) } }] }, { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }], user: { isActive: true } }, take: 20, select: { userId: true } });
  let done = 0;
  for (const { userId } of due) {
    const lease = randomUUID();
    const claim = await prisma.railMailbox.updateMany({ where: { userId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { lease, leaseUntil: new Date(now.getTime() + 5 * 60_000) } });
    if (!claim.count) continue;
    try { await checkMailbox(userId); done++; } catch (error) { logger.error("mail.poll_failed", { errorType: error instanceof Error ? error.name : "UnknownError" }); }
    finally { await prisma.railMailbox.updateMany({ where: { userId, lease }, data: { lease: null, leaseUntil: null } }); }
  }
  return done;
}
