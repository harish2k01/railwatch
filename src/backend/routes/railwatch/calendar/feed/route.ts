import { createHash, randomBytes, randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonData, routeError } from "@/lib/http";
import { storedPlanner } from "@/lib/workspace-storage";
import { calendarFile } from "@/lib/travel-planner";
import { logger } from "@/lib/logger";

const FOREVER = new Date("9999-12-31T00:00:00Z");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Live calendar feed (iCalendar). Google Calendar and Outlook subscribe to this URL and refresh it themselves,
 * so journeys, booking openings and time off stay in sync without exporting. The URL carries a secret token
 * (stored hashed); anyone with the link can read the calendar, so it can be reset.
 */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return new Response("Not found", { status: 404 });
    const row = await prisma.accountToken.findUnique({ where: { tokenHash: hash(token) }, select: { userId: true, type: true, user: { select: { isActive: true } } } });
    if (!row || row.type !== "CALENDAR_FEED" || !row.user.isActive) return new Response("Not found", { status: 404 });
    const workspace = await prisma.railWorkspace.findUnique({ where: { userId: row.userId }, select: { payload: true, storageVersion: true } });
    if (!workspace) return new Response("Not found", { status: 404 });
    const planner = await storedPlanner(prisma, row.userId, workspace);
    logger.info("calendar.feed_served", { journeys: planner.journeys.length });
    return new Response(calendarFile(planner), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": "inline; filename=railwatch.ics" } });
  } catch (error) { return routeError(error, request); }
}

/** Creates (or resets) the signed-in account's feed link. The previous link stops working. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const token = randomBytes(24).toString("base64url");
    await prisma.$transaction([
      prisma.accountToken.deleteMany({ where: { userId: user.id, type: "CALENDAR_FEED" } }),
      prisma.accountToken.create({ data: { id: randomUUID(), userId: user.id, type: "CALENDAR_FEED", tokenHash: hash(token), expiresAt: FOREVER } }),
    ]);
    const origin = process.env.APP_URL ?? new URL(request.url).origin;
    return jsonData({ url: `${origin}/api/railwatch/calendar/feed?token=${token}` });
  } catch (error) { return routeError(error, request); }
}
