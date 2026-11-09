import { beforeEach, expect, it, vi } from "vitest";
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const mock = vi.hoisted(() => ({ workspace: vi.fn(), planner: vi.fn(), save: vi.fn(), start: vi.fn(), finish: vi.fn(), notification: vi.fn() }));
vi.mock("./db", () => ({ prisma: { railWorkspace: { findUnique: mock.workspace }, railNotification: { createMany: mock.notification } } }));
vi.mock("./workspace-storage", () => ({ storedPlanner: mock.planner }));
vi.mock("./railwatch-store", () => ({ saveWorkspace: mock.save }));
vi.mock("./pnr-provider", () => ({ startPnrCheck: mock.start, finishPnrCheck: mock.finish }));
import { confirmPnrCancellation, refreshPnr, startPnrStatus } from "./pnr-service";
import { EMPTY_PLANNER, journeySchema } from "./travel-planner";
import { parsePnrStatus } from "./pnr-status";
import { ApiError } from "./http";
// Dummy PNRs only.
const j = journeySchema.parse({ id: "j", from: "MS", to: "MDU", date: "2026-12-01", departure: "21:00", train: "", travelClass: "3A", windowDays: 60, originOffset: 0, status: "booked", pnr: "1234567890", notes: "", ticketStatus: "RAC" });
const snapshot = parsePnrStatus({ PNR: j.pnr, passengers: [{ currentStatus: "CNF", bookingStatus: "RAC 4" }], other_info: [{ chartStatus: "Prepared" }] }, j.pnr);
const cancelled = parsePnrStatus({ PNR: j.pnr, passengers: [{ currentStatus: "CAN" }], other_info: [{ chartStatus: "Prepared" }] }, j.pnr);
async function begin(user = "owner") { return (await startPnrStatus(user, "j")).token; }
beforeEach(() => {
  vi.resetAllMocks(); mock.workspace.mockResolvedValue({ version: 2 });
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [j] });
  mock.start.mockResolvedValue({ image: "data:image/png;base64,AA", cookie: "JSESSIONID=x" }); mock.finish.mockResolvedValue(snapshot);
  mock.save.mockImplementation(async (_user, planner) => ({ planner, revision: 3 }));
});
it("does not contact Indian Railways for unavailable tickets", async () => {
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [] });
  await expect(startPnrStatus("owner", "j")).rejects.toMatchObject({ status: 404 });
  expect(mock.start).not.toHaveBeenCalled();
});
it("submits the user's answer with the saved PNR, for the same account and journey only", async () => {
  const token = await begin();
  await expect(refreshPnr("someone-else", "j", token, "43")).rejects.toMatchObject({ status: 410 });
  const other = await begin();
  await refreshPnr("owner", "j", other, "43");
  expect(mock.finish).toHaveBeenCalledWith("JSESSIONID=x", "1234567890", "43");
  await expect(refreshPnr("owner", "j", "forged-token-value", "43")).rejects.toMatchObject({ status: 410 });
});
it("records nothing for a wrong CAPTCHA answer", async () => {
  mock.finish.mockRejectedValue(new ApiError(422, "That answer didn’t match.", "PNR_CAPTCHA"));
  await expect(refreshPnr("owner", "j", await begin(), "1")).rejects.toMatchObject({ status: 422 });
  expect(mock.save).not.toHaveBeenCalled();
});
it("preserves a successful snapshot on failure and records a safe attempt message", async () => {
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [{ ...j, pnrStatus: snapshot }] }); mock.finish.mockRejectedValue(new Error("provider details"));
  await expect(refreshPnr("owner", "j", await begin(), "43")).rejects.toThrow();
  const saved = mock.save.mock.calls[0][1].journeys[0];
  expect(saved.pnrStatus).toEqual(snapshot);
  expect(saved.pnrLastError).not.toContain("provider details");
});
it("discards a response when the PNR changes during the check", async () => {
  const token = await begin();
  mock.planner.mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [j] }).mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [{ ...j, pnr: "9999999999" }] });
  await expect(refreshPnr("owner", "j", token, "43")).rejects.toMatchObject({ status: 409 });
  expect(mock.save).not.toHaveBeenCalled();
});
it("uses freshly loaded data and revision rather than overwriting an intervening edit", async () => {
  const token = await begin();
  mock.workspace.mockResolvedValueOnce({ version: 2 }).mockResolvedValueOnce({ version: 3 });
  mock.planner.mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [j] }).mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [{ ...j, notes: "Edited during lookup" }] });
  const result = await refreshPnr("owner", "j", token, "43");
  expect(result.journey.notes).toBe("Edited during lookup");
  expect(mock.save.mock.calls[0][2]).toBe(3);
  expect(mock.save.mock.calls[0][4]).toBe(true);
});
it("never cancels on a check; cancels only when the user confirms a cancelled status", async () => {
  mock.finish.mockResolvedValue(cancelled);
  const checked = await refreshPnr("owner", "j", await begin(), "43");
  expect(checked.journey.status).toBe("booked");
  await expect(confirmPnrCancellation("owner", "j")).rejects.toMatchObject({ status: 409 }); // planner mock still has no cancelled snapshot
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [{ ...j, pnrStatus: cancelled }] });
  expect((await confirmPnrCancellation("owner", "j")).journey.status).toBe("cancelled");
});
