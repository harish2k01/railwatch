import { journeyLink } from "./journey-links";
import webpush from "web-push";
import { Agent } from "node:https";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { ApiError } from "./http";
import { logger } from "./logger";

/** Allows only known browser push services, preventing arbitrary outbound requests. */
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
/** Hashes the endpoint for ownership checks without exposing its bearer URL. */
export function pushEndpointHash(endpoint: string) { return createHash("sha256").update(endpoint).digest("hex"); }
/** Creates one persistent VAPID identity, safely shared by backend replicas. */
export async function pushIdentity() {
  const existing = await prisma.railPushConfig.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  // Prisma can implement an empty-update upsert as find/create. Insert-on-conflict
  // preserves the winner's identity when multiple replicas initialize together.
  await prisma.railPushConfig.createMany({ data: [{ id: "default", publicKey: keys.publicKey, privateKey: encryptSecret(keys.privateKey) }], skipDuplicates: true });
  return prisma.railPushConfig.findUniqueOrThrow({ where: { id: "default" } });
}
/** Sends to one owned device; expired browser subscriptions are removed rather than retried. */
export async function sendBrowserPush(userId: string, deviceId: string, message: string, tag: string) {
  const device = await prisma.railPush.findFirst({ where: { id: deviceId, userId } });
  if (!device) return;
  const subscription = JSON.parse(decryptSecret(device.subscription)!) as webpush.PushSubscription;
  if (!validPushEndpoint(subscription.endpoint)) throw new ApiError(400, "Unsupported browser push service.");
  const identity = await pushIdentity();
  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title: "RailWatch", body: message, tag, url: tag.startsWith("railwatch-journey-") ? journeyLink(tag.slice("railwatch-journey-".length)) : "/journeys" }), {
      TTL: 3600, timeout: 15000,
      // Apple publishes IPv6 addresses even on hosts without usable IPv6 egress.
      ...(new URL(subscription.endpoint).hostname.endsWith(".push.apple.com") ? { agent: new Agent({ family: 4 }) } : {}),
      vapidDetails: { subject: new URL(process.env.APP_URL ?? "http://localhost:3000").origin, publicKey: identity.publicKey, privateKey: decryptSecret(identity.privateKey)! },
    });
    logger.info("push.delivered", { deviceId });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) { await prisma.railPush.deleteMany({ where: { id: deviceId, userId } }); logger.info("push.expired", { deviceId }); return; }
    const code = (error as { code?: string }).code;
    logger.error("push.delivery_failed", { deviceId, status, code });
    throw new ApiError(502, status === 403 ? "The push service rejected this device. Disable notifications on this device, then enable them again." : "Could not reach this device’s push service. Try again shortly.", "PUSH_DELIVERY_FAILED");
  }
}
