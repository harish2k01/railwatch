import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./http";
import { storedPlanner } from "./workspace-storage";
import { saveWorkspace } from "./railwatch-store";
import { finishPnrCheck, startPnrCheck } from "./pnr-provider";
import { applyPnrStatus, pnrSummary } from "./pnr-status";
import { transitionJourney } from "./travel-planner";

/** Resolves only an owned journey; unavailable identifiers reveal no ticket information. */
export async function ownedPnrJourney(userId: string, id: string) {
  const workspace = await prisma.railWorkspace.findUnique({ where: { userId } });
  if (!workspace) throw new ApiError(404, "Journey unavailable.");
  const planner = await storedPlanner(prisma, userId, workspace, [id]);
  const journey = planner.journeys.find(j => j.id === id);
  if (!journey) throw new ApiError(404, "Journey unavailable.");
  return { workspace, planner, journey };
}

/** Open CAPTCHA checks: bound to one account, journey and PNR, kept in memory for three minutes. */
type Check = { userId: string; id: string; pnr: string; cookie: string; expires: number };
const checks = new Map<string, Check>();
const CHECK_TTL = 180_000;
function sweep(now = Date.now()) { for (const [token, c] of checks) if (c.expires < now) checks.delete(token); while (checks.size > 200) checks.delete(checks.keys().next().value!); }

/** Step 1: gets a CAPTCHA picture for the user to answer for this journey's saved PNR. */
export async function startPnrStatus(userId: string, id: string) {
  const { journey } = await ownedPnrJourney(userId, id);
  if (!journey.pnr) throw new ApiError(400, "Add a PNR to this journey first.");
  const { image, cookie } = await startPnrCheck();
  sweep(); const token = randomUUID();
  checks.set(token, { userId, id, pnr: journey.pnr, cookie, expires: Date.now() + CHECK_TTL });
  return { token, image };
}

/** Step 2: submits the user's answer, then saves against fresh account state without overwriting concurrent edits. */
export async function refreshPnr(userId: string, id: string, token: string, answer: string) {
  sweep(); const check = checks.get(token);
  if (!check || check.userId !== userId || check.id !== id) throw new ApiError(410, "That picture expired. Get a new one.", "PNR_EXPIRED");
  checks.delete(token); // one answer per picture
  const initial = await ownedPnrJourney(userId, id);
  if (!initial.journey.pnr || initial.journey.pnr !== check.pnr) throw new ApiError(409, "The PNR changed. Get a new picture.", "VERSION_CONFLICT");
  let snapshot: Awaited<ReturnType<typeof finishPnrCheck>> | undefined;
  let failure: unknown;
  try { snapshot = await finishPnrCheck(check.cookie, check.pnr, answer); } catch (error) { failure = error; }
  // A wrong CAPTCHA answer is not a failed check: nothing is recorded.
  if (failure instanceof ApiError && failure.code === "PNR_CAPTCHA") throw failure;
  const { workspace, planner, journey } = await ownedPnrJourney(userId, id);
  if (journey.pnr !== initial.journey.pnr || journey.date !== initial.journey.date || journey.from !== initial.journey.from || journey.to !== initial.journey.to) throw new ApiError(409, "The journey changed while checking. Open it again and retry.", "VERSION_CONFLICT");
  const next = snapshot ? applyPnrStatus(journey, snapshot) : { ...journey, pnrLastAttemptAt: new Date().toISOString(), pnrLastError: "Could not refresh. Last successful status retained." };
  const saved = await saveWorkspace(userId, { ...planner, journeys: [next] }, workspace.version, planner, true);
  if (failure) throw failure;
  return { journey: saved.planner.journeys.find(j => j.id === id)!, revision: saved.revision };
}

/** Marks the journey cancelled after the user confirms, and only when its latest PNR status shows every passenger cancelled. */
export async function confirmPnrCancellation(userId: string, id: string) {
  const { workspace, planner, journey } = await ownedPnrJourney(userId, id);
  const snapshot = journey.pnrStatus?.pnr === journey.pnr ? journey.pnrStatus : undefined;
  if (!snapshot || pnrSummary(snapshot) !== "CANCELLED") throw new ApiError(409, "The latest PNR status doesn’t show this ticket cancelled.", "PNR_NOT_CANCELLED");
  if (!["booked", "cancellation_needed", "needs_booking"].includes(journey.status)) return { journey, revision: workspace.version };
  const saved = await saveWorkspace(userId, { ...planner, journeys: [transitionJourney(journey, "cancelled")] }, workspace.version, planner, true);
  return { journey: saved.planner.journeys.find(j => j.id === id)!, revision: saved.revision };
}
