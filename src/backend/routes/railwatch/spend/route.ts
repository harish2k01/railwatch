import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonData, routeError } from "@/lib/http";
import { storedPlanner } from "@/lib/workspace-storage";

const PAID = new Set(["booked", "completed", "cancelled", "cancellation_needed"]);

/**
 * Spend data: the signed-in account's paid journeys (booked, travelled or cancelled) with only the fields the
 * Spend page needs. The browser's planner carries no journeys (they are paged), so Spend reads them here.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const workspace = await prisma.railWorkspace.findUnique({ where: { userId: user.id }, select: { payload: true, storageVersion: true } });
    if (!workspace) return jsonData({ journeys: [] });
    const planner = await storedPlanner(prisma, user.id, workspace);
    const journeys = planner.journeys.filter(j => PAID.has(j.status)).map(j => ({ id: j.id, date: j.date, from: j.from, to: j.to, status: j.status, travelClass: j.travelClass, bookingType: j.bookingType, fare: j.fare }));
    return jsonData({ journeys });
  } catch (error) { return routeError(error, request); }
}
