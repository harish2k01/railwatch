import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/[...path]/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("private backend API proxy", () => {
  it("keeps client paths and queries on the configured backend", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.internal:3001");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(new Request("https://railwatch.example/api/tickets/123?next=https://attacker.example"));
    expect(response.status).toBe(200);
    const target = fetcher.mock.calls[0][0] as URL;
    expect(target.origin).toBe("http://backend.internal:3001");
    expect(target.pathname).toBe("/api/tickets/123");
    expect(target.searchParams.get("next")).toBe("https://attacker.example");
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });

  it.each(["//attacker.example/api/tickets", "/outside", "/%2f%2fattacker.example/api/tickets"])("rejects a non-API path %s before fetching", async path => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(new Request("https://railwatch.example" + path));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards only the proxy-derived client address to the backend", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.internal:3001");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await GET(new Request("https://railwatch.example/api/auth/session", { headers: {
      "x-real-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7",
      "cf-connecting-ip": "198.51.100.1", "true-client-ip": "198.51.100.2", "x-railwatch-client-address": "198.51.100.3",
    } }));
    const sent = fetcher.mock.calls[0][1].headers as Headers;
    expect(sent.get("x-railwatch-client-address")).toBe("203.0.113.7");
    for (const name of ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"]) expect(sent.has(name)).toBe(false);
  });

  it("drops a spoofed internal address when the proxy supplied none", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.internal:3001");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await GET(new Request("https://railwatch.example/api/auth/session", { headers: { "x-railwatch-client-address": "198.51.100.3", "x-real-ip": "not an address" } }));
    expect((fetcher.mock.calls[0][1].headers as Headers).has("x-railwatch-client-address")).toBe(false);
  });

  it("does not interpret encoded path separators as an authority", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.internal:3001");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await GET(new Request("https://railwatch.example/api/%2f%2fattacker.example"));
    expect((fetcher.mock.calls[0][0] as URL).origin).toBe("http://backend.internal:3001");
  });
});
