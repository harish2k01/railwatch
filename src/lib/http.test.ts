import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, assertSameOrigin, jsonData, parseJson, routeError } from "@/lib/http";

describe("API request handling", () => {
  it("limits actual body bytes even when content-length is absent or incorrect", async () => {
    for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
      const request = new Request("https://app.example.com/api/test", { method: "POST", body: JSON.stringify({ text: "é".repeat(40) }), headers });
      await expect(parseJson(request, z.object({ text: z.string() }), 64)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    }
  });
  it("accepts same-origin requests and rejects cross-origin requests", () => {
    const same = new Request("https://app.example.com/api/test", { headers: { host: "app.example.com", origin: "https://app.example.com" } });
    expect(() => assertSameOrigin(same)).not.toThrow();
    const cross = new Request("https://app.example.com/api/test", { headers: { host: "app.example.com", origin: "https://other.example.com" } });
    expect(() => assertSameOrigin(cross)).toThrow(ApiError);
  });

  it("rejects opaque origins with a 403 instead of an internal error", () => {
    const opaque = new Request("https://app.example.com/api/test", { headers: { host: "app.example.com", origin: "null" } });
    expect(() => assertSameOrigin(opaque)).toThrow(expect.objectContaining({ status: 403, code: "INVALID_ORIGIN" }));
  });

  it("parses and validates bounded JSON bodies", async () => {
    const request = new Request("https://app.example.com/api/test", { method: "POST", body: JSON.stringify({ name: "Ticket" }), headers: { "content-type": "application/json" } });
    await expect(parseJson(request, z.object({ name: z.string().min(2) }))).resolves.toEqual({ name: "Ticket" });
  });

  it("returns validation details for invalid JSON input", async () => {
    const request = new Request("https://app.example.com/api/test", { method: "POST", body: JSON.stringify({ name: "" }), headers: { "content-type": "application/json" } });
    await expect(parseJson(request, z.object({ name: z.string().min(2) }))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("serializes data and known API errors", async () => {
    const dataResponse = jsonData({ ok: true });
    await expect(dataResponse.json()).resolves.toEqual({ data: { ok: true } });
    const errorResponse = routeError(new ApiError(404, "Ticket not found.", "NOT_FOUND"), new Request("https://app.example.com/api/tickets"));
    expect(errorResponse.status).toBe(404);
    await expect(errorResponse.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  });
});
