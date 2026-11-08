import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";
import { storedPlanner } from "@/lib/workspace-storage";
import { saveWorkspace } from "@/lib/railwatch-store";

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
    const journeys = planner.journeys.filter(j => PAID.has(j.status)).map(j => ({ id: j.id, date: j.date, from: j.from, to: j.to, status: j.status, travelClass: j.travelClass, bookingType: j.bookingType, fare: j.fare, pdf: j.attachments?.filter(a => a.type === "application/pdf").map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size, createdAt: a.createdAt })) ?? [] }));
    return jsonData({ journeys });
  } catch (error) { return routeError(error, request); }
}

/** Saves fares the browser read from stored ticket PDFs. Only fills journeys that have no fare yet. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, z.object({ fares: z.array(z.object({ id: z.string().min(1).max(200), fare: fareSchema })).min(1).max(500) }));
    const workspace = await prisma.railWorkspace.findUnique({ where: { userId: user.id }, select: { payload: true, storageVersion: true, version: true } });
    if (!workspace) return jsonData({ updated: 0 });
    const planner = await storedPlanner(prisma, user.id, workspace);
    const fares = new Map(input.fares.map(f => [f.id, f.fare]));
    let updated = 0;
    const journeys = planner.journeys.map(j => { const fare = fares.get(j.id); if (!fare || j.fare?.total) return j; updated++; return { ...j, fare }; });
    if (updated) await saveWorkspace(user.id, { ...planner, journeys }, workspace.version);
    return jsonData({ updated });
  } catch (error) { return routeError(error, request); }
}
