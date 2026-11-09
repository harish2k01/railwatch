import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ requireUser: vi.fn(), start: vi.fn(), refresh: vi.fn(), cancel: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mock.requireUser }));
vi.mock("@/lib/pnr-service", () => ({ startPnrStatus: mock.start, refreshPnr: mock.refresh, confirmPnrCancellation: mock.cancel }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mock.limit }));
import { POST } from "@/backend/routes/railwatch/pnr/route";
import { ApiError } from "./http";
const token = "00000000-0000-4000-8000-000000000000";
const request = (body: unknown) => new Request("http://localhost/api/railwatch/pnr", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mock.requireUser.mockResolvedValue({ id: "owner" }); mock.start.mockResolvedValue({ token, image: "data:image/png;base64,AA" }); mock.refresh.mockResolvedValue({ journey: { id: "j" } }); });
it("does not start a check for another account's journey", async () => {
  mock.start.mockRejectedValue(new ApiError(404, "Journey unavailable."));
  expect((await POST(request({ id: "other-account", action: "start" }))).status).toBe(404);
});
it("requires authentication first", async () => {
  mock.requireUser.mockRejectedValue(new ApiError(401, "Sign in."));
  expect((await POST(request({ id: "j", action: "start" }))).status).toBe(401);
  expect(mock.start).not.toHaveBeenCalled();
});
it("uses only the saved journey (no PNR can be supplied) and rate-limits", async () => {
  expect((await POST(request({ id: "j", action: "start", pnr: "9999999999" }))).status).toBe(200);
  expect(mock.start).toHaveBeenCalledWith("owner", "j");
  expect((await POST(request({ id: "j", action: "answer", token, answer: "43" }))).status).toBe(200);
  expect(mock.refresh).toHaveBeenCalledWith("owner", "j", token, "43");
  expect(mock.limit).toHaveBeenCalledTimes(3);
});
it("rejects cross-origin requests", async () => {
  const req = request({ id: "j", action: "start" }); req.headers.set("origin", "https://untrusted.example");
  expect((await POST(req)).status).toBe(403);
  expect(mock.start).not.toHaveBeenCalled();
});
