import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transport: vi.fn(), send: vi.fn(), config: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport } }));
vi.mock("./settings", () => ({ getDeliveryConfiguration: mocks.config }));
import { sendPasswordResetEmail, sendTestEmail,sendVerificationEmail,sendBookingEmail,smtpFailureReason } from "./mail";

describe("email transport", () => {
  it("explains a provider rejection of the sender without exposing its SMTP response",()=>{expect(smtpFailureReason({code:"EENVELOPE",command:"MAIL FROM",responseCode:550,response:"Private address rejected"})).toContain("address or verified alias");});
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockResolvedValue({ smtpUrl: "smtp://example.invalid:587", emailFrom: "planner@example.invalid" });
    mocks.transport.mockReturnValue({ sendMail: mocks.send,close:vi.fn() });
    mocks.send.mockResolvedValue({ accepted: ["user@example.invalid"] });
  });

  it("applies bounded timeouts to the transport, not message defaults", async () => {
    await expect(sendTestEmail("user@example.invalid")).resolves.toEqual({ sent: true });
    expect(mocks.transport).toHaveBeenCalledWith({ url: "smtp://example.invalid:587", connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.invalid", from: "planner@example.invalid" }));
  });

  it("does not report an unconfigured service as delivered", async () => {
    mocks.config.mockResolvedValue({ smtpUrl: undefined });
    await expect(sendTestEmail("user@example.invalid")).resolves.toMatchObject({ sent: false });
    expect(mocks.transport).not.toHaveBeenCalled();
  });

  it("links password resets to the one-time reset page", async () => {
    await sendPasswordResetEmail("user@example.invalid", "test-token");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("/set-password?token=test-token&type=reset"),html:expect.stringContaining("Reset Password") }));
  });

  it("sends ownership and booking emails with HTML actions and plain-text fallbacks",async()=>{
    await sendVerificationEmail("user@example.invalid","verification-token");
    expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({html:expect.stringContaining("/verify-email?token=verification-token"),text:expect.stringContaining("/verify-email?token=verification-token")}));
    await sendBookingEmail("user@example.invalid",{id:"j",from:"MDU",to:"MS",date:"2026-12-01",departure:"20:00",train:"",pnr:"",travelClass:"SL",windowDays:60,originOffset:0,status:"needs_booking",notes:""});
    expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({html:expect.stringContaining("/journeys?journey=j"),text:expect.stringContaining("Booking Date: 2 October 2026")}));
  });

  it("does not report a rejected recipient as success", async () => { mocks.send.mockResolvedValue({accepted:[],rejected:["user@example.invalid"]}); await expect(sendTestEmail("user@example.invalid")).rejects.toThrow(/did not accept/); });

  it("propagates SMTP failure", async () => {
    mocks.send.mockRejectedValue(new Error("SMTP unavailable"));
    await expect(sendTestEmail("user@example.invalid")).rejects.toThrow("SMTP unavailable");
  });
});
