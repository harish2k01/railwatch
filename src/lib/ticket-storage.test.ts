import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptBytes, encryptBytes } from "./crypto";
import { ticketBytes } from "./ticket-storage";

beforeAll(() => { process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64"); });

describe("ticket byte storage", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7 ticket "), Buffer.from([0, 255, 128])]);
  it("round-trips raw bytes and rejects tampering", () => {
    const sealed = encryptBytes(pdf);
    expect(decryptBytes(sealed).equals(pdf)).toBe(true);
    sealed[sealed.length - 1] ^= 1;
    expect(() => decryptBytes(sealed)).toThrow();
    expect(() => decryptBytes(Buffer.from([9, 1, 2]))).toThrow("malformed");
  });
  it("reads stored rows", () => {
    expect(ticketBytes({ payloadBytes: encryptBytes(pdf) }).equals(pdf)).toBe(true);
  });
});
