import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), find: vi.fn(), remove: vi.fn(), upsert: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send, generateVAPIDKeys: () => ({ publicKey: "public", privateKey: "private" }) } }));
vi.mock("./db", () => ({ prisma: { railPush: { findFirst: mocks.find, deleteMany: mocks.remove }, railPushConfig: { findUnique: vi.fn(), createMany: vi.fn(), findUniqueOrThrow: mocks.upsert } } }));
vi.mock("./crypto", () => ({ encryptSecret: (s: string) => s, decryptSecret: (s: string) => s }));
import { validPushEndpoint, sendBrowserPush } from "./browser-push";

it("rejects arbitrary, local, credential-bearing and non-HTTPS push endpoints", () => {
  for (const endpoint of ["http://fcm.googleapis.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.evil.test/a", "https://user:pass@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a"]) expect(validPushEndpoint(endpoint)).toBe(false);
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/token", "https://web.push.apple.com/token", "https://updates.push.services.mozilla.com/wpush/v2/token"]) expect(validPushEndpoint(endpoint)).toBe(true);
});
it("routes Apple push over working IPv4 and exposes a safe actionable delivery error",async()=>{
  mocks.find.mockResolvedValue({subscription:JSON.stringify({endpoint:"https://web.push.apple.com/token",keys:{auth:"a",p256dh:"b"}})});
  mocks.upsert.mockResolvedValue({publicKey:"public",privateKey:"private"});mocks.send.mockResolvedValue({});
  await sendBrowserPush("owner","iphone","Test","test");
  expect(mocks.send.mock.lastCall?.[2].agent.options.family).toBe(4);
  mocks.send.mockRejectedValue({statusCode:403,body:"private bearer URL"});
  await expect(sendBrowserPush("owner","iphone","Test","test")).rejects.toThrow("enable them again");
});
it("sends encrypted subscription data with a stable journey tag and removes expired devices", async () => {
  mocks.find.mockResolvedValue({ subscription: JSON.stringify({ endpoint: "https://fcm.googleapis.com/a", keys: { auth: "a", p256dh: "b" } }) });
  mocks.upsert.mockResolvedValue({ publicKey: "public", privateKey: "private" });
  mocks.send.mockResolvedValue({});
  await sendBrowserPush("owner", "device", "Book your train", "railwatch-journey-j1");
  expect(mocks.find).toHaveBeenCalledWith({ where: { id: "device", userId: "owner" } });
  expect(JSON.parse(mocks.send.mock.lastCall?.[1])).toMatchObject({ tag: "railwatch-journey-j1", url: "/journeys?journey=j1" });
  mocks.send.mockRejectedValue({ statusCode: 410 });
  await sendBrowserPush("owner", "device", "Book", "same-tag");
  expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "device", userId: "owner" } });
});
