import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ownedPnrJourney, refreshPnr } from "@/lib/pnr-service";

/** Checks a saved account-owned ticket; arbitrary PNR numbers cannot be supplied to this endpoint. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await parseJson(request, z.object({ id: z.string().min(1).max(200) }));
    const owned = await ownedPnrJourney(user.id, id);
    const snapshot = owned.journey?.pnrStatus;
    if (snapshot && snapshot.pnr === owned.journey.pnr && Date.now() - Date.parse(snapshot.checkedAt) < 60_000) return jsonData({journey:owned.journey,revision:owned.workspace.version});
    await enforceRateLimit(request, "pnr-account", 20, 3_600_000, user.id);
    await enforceRateLimit(request, "pnr-journey", 1, 60_000, `${user.id}:${id}`);
    return jsonData(await refreshPnr(user.id, id));
  } catch (error) { return routeError(error, request); }
}

