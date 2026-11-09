import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ requireUser: vi.fn(), owned: vi.fn(), refresh: vi.fn(), limit: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mock.requireUser }));
vi.mock("@/lib/pnr-service", () => ({ ownedPnrJourney: mock.owned, refreshPnr: mock.refresh }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mock.limit }));
vi.mock("@/lib/railwatch-store", () => ({ saveWorkspace: mock.save }));
import { POST } from "@/backend/routes/railwatch/pnr/route";
import { ApiError } from "./http";
const request = (body: unknown) => new Request("http://localhost/api/railwatch/pnr", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mock.requireUser.mockResolvedValue({ id: "owner" }); mock.owned.mockResolvedValue({}); mock.refresh.mockResolvedValue({ journey: { id: "j" } }); });
it("does not query the provider for another account's journey", async () => {
  mock.owned.mockRejectedValue(new ApiError(404, "Journey unavailable."));
  expect((await POST(request({ id: "other-account" }))).status).toBe(404);
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("requires authentication before looking up tickets", async () => {
  mock.requireUser.mockRejectedValue(new ApiError(401, "Sign in."));
  expect((await POST(request({ id: "j" }))).status).toBe(401);
  expect(mock.owned).not.toHaveBeenCalled();
});
it("limits checks and uses only the saved owned journey", async () => {
  expect((await POST(request({ id: "j", pnr: "9999999999" }))).status).toBe(200);
  expect(mock.refresh).toHaveBeenCalledWith("owner", "j");
  expect(mock.limit).toHaveBeenCalledTimes(2);
});
it("rejects cross-origin requests before checking tickets", async () => {
  const req = request({ id: "j" }); req.headers.set("origin", "https://untrusted.example");
  expect((await POST(req)).status).toBe(403);
  expect(mock.refresh).not.toHaveBeenCalled();
});
