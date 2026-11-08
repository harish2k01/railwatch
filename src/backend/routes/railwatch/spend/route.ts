import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";
import { storedPlanner } from "@/lib/workspace-storage";
import { saveWorkspace } from "@/lib/railwatch-store";
import { fareAddsUp } from "@/lib/ticket-fare";
import { journeySchema } from "@/lib/travel-planner";

const PAID = new Set(["booked", "completed", "cancelled", "cancellation_needed"]);
const money = z.number().nonnegative().max(1_000_000);
const fareSchema = z.object({ total: money, ticket: money.optional(), convenience: money.optional(), wallet: money.optional(), insurance: money.optional() });

/**
 * Spend data: the signed-in account's paid journeys (booked, travelled or cancelled) with only the fields the
 * Spend page needs. The browser's planner carries no journeys (they are paged), so Spend reads them here.
 * `pdf` lists stored ticket PDFs so the browser can read fares for trips attached before fares were saved.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const workspace = await prisma.railWorkspace.findUnique({ where: { userId: user.id }, select: { payload: true, storageVersion: true } });
    if (!workspace) return jsonData({ journeys: [] });
    const planner = await storedPlanner(prisma, user.id, workspace);
    const journeys = planner.journeys.filter(j => PAID.has(j.status)).map(j => ({ id: j.id, date: j.date, from: j.from, to: j.to, status: j.status, travelClass: j.travelClass, bookingType: j.bookingType, fare: j.fare, arrival: j.arrival, pdf: j.attachments?.filter(a => a.type === "application/pdf").map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size, createdAt: a.createdAt })) ?? [] }));
    return jsonData({ journeys });
  } catch (error) { return routeError(error, request); }
}

/** Saves fares the browser read from stored ticket PDFs. Fills a missing arrival time and journeys with no fare, or replaces a saved fare that doesn't add up with one that does. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, z.object({ fares: z.array(z.object({ id: z.string().min(1).max(200), fare: fareSchema.optional(), arrival: journeySchema.shape.arrival, arrivalDate: journeySchema.shape.arrivalDate })).min(1).max(500) }));
    const workspace = await prisma.railWorkspace.findUnique({ where: { userId: user.id }, select: { payload: true, storageVersion: true, version: true } });
    if (!workspace) return jsonData({ updated: 0 });
    const planner = await storedPlanner(prisma, user.id, workspace);
    const found = new Map(input.fares.map(f => [f.id, f]));
    let updated = 0;
    const journeys = planner.journeys.map(j => {
      const f = found.get(j.id); if (!f) return j;
      const fare = f.fare && !(j.fare?.total && (fareAddsUp(j.fare) || !fareAddsUp(f.fare))) ? f.fare : undefined;
      const arrival = f.arrival && !j.arrival ? { arrival: f.arrival, arrivalDate: f.arrivalDate } : undefined;
      if (!fare && !arrival) return j; updated++; return { ...j, ...(fare ? { fare } : {}), ...arrival };
    });
    if (updated) await saveWorkspace(user.id, { ...planner, journeys }, workspace.version);
    return jsonData({ updated });
  } catch (error) { return routeError(error, request); }
}
