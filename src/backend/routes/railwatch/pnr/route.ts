import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { confirmPnrCancellation, refreshPnr, startPnrStatus } from "@/lib/pnr-service";

const body = z.union([
  z.object({ id: z.string().min(1).max(200), action: z.literal("start") }),
  z.object({ id: z.string().min(1).max(200), action: z.literal("answer"), token: z.string().uuid(), answer: z.string().trim().min(1).max(12) }),
  z.object({ id: z.string().min(1).max(200), action: z.literal("cancel") }),
]);

/**
 * PNR status for a saved, account-owned ticket (arbitrary PNRs can't be supplied): "start" returns a CAPTCHA picture,
 * "answer" submits what the user typed, "cancel" marks the trip cancelled after the user confirms a cancelled status.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, body);
    if (input.action === "cancel") return jsonData(await confirmPnrCancellation(user.id, input.id));
    await enforceRateLimit(request, "pnr-account", 30, 3_600_000, user.id);
    if (input.action === "start") {
      await enforceRateLimit(request, "pnr-journey", 6, 60_000, `${user.id}:${input.id}`);
      return jsonData(await startPnrStatus(user.id, input.id));
    }
    return jsonData(await refreshPnr(user.id, input.id, input.token, input.answer));
  } catch (error) { return routeError(error, request); }
}
