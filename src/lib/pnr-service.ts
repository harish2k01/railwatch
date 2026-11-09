import { prisma } from "./db";
import { ApiError } from "./http";
import { storedPlanner } from "./workspace-storage";
import { saveWorkspace } from "./railwatch-store";
import { lookupPnr } from "./pnr-provider";
import { applyPnrStatus } from "./pnr-status";

/** Resolves only an owned journey; unavailable identifiers reveal no ticket information. */
export async function ownedPnrJourney(userId: string, id: string) {
  const workspace = await prisma.railWorkspace.findUnique({ where: { userId } });
  if (!workspace) throw new ApiError(404, "Journey unavailable.");
  const planner = await storedPlanner(prisma, userId, workspace, [id]);
  const journey = planner.journeys.find(j => j.id === id);
  if (!journey) throw new ApiError(404, "Journey unavailable.");
  return { workspace, planner, journey };
}

/** Fetches outside database locks, then saves against fresh account state without overwriting concurrent edits. */
export async function refreshPnr(userId: string, id: string) {
  const initial = await ownedPnrJourney(userId, id);
  if (!initial.journey.pnr) throw new ApiError(400, "Add a PNR to this journey first.");
  let snapshot: Awaited<ReturnType<typeof lookupPnr>> | undefined;
  let failure: unknown;
  try { snapshot = await lookupPnr(initial.journey.pnr); } catch (error) { failure = error; }
  const { workspace, planner, journey } = await ownedPnrJourney(userId, id);
  if (journey.pnr !== initial.journey.pnr || journey.date !== initial.journey.date || journey.from !== initial.journey.from || journey.to !== initial.journey.to) throw new ApiError(409, "The journey changed while checking. Open it again and retry.", "VERSION_CONFLICT");
  const next = snapshot ? applyPnrStatus(journey, snapshot) : { ...journey, pnrLastAttemptAt: new Date().toISOString(), pnrLastError: "Could not refresh. Last successful status retained." };
  const saved = await saveWorkspace(userId, { ...planner, journeys: [next] }, workspace.version, planner, true);
  if (failure) throw failure;
  return { journey: saved.planner.journeys.find(j => j.id === id)!, revision: saved.revision };
}

