import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { cookies, withRequestContext } from "@/backend/context";
import { runScheduledWork } from "@/backend/scheduler";
import { createBackend } from "@/backend/server";

// Cold Fastify route initialization under coverage uses the same budget as DB integration tests.
describe("dedicated backend runtime", {timeout:process.env.CI?60000:15000}, () => {
  it("isolates cookies during concurrent requests and forwards every response cookie", async () => {
    const calls = ["alice", "bob"].map(name => withRequestContext(new Request("http://localhost/api/auth/login", { headers: { cookie: "session=" + name } }), async () => {
      const jar = await cookies();
      await new Promise(resolve => setTimeout(resolve, name === "alice" ? 10 : 1));
      expect(jar.get("session")?.value).toBe(name);
      jar.set("session", name + "-new", { path: "/", httpOnly: true, sameSite: "lax" });
      jar.set("oauth", name, { path: "/api", maxAge: 600 });
      return Response.json({ owner: jar.get("session")?.value });
    }));
    const responses = await Promise.all(calls);
    for (const [index, response] of responses.entries()) {
      const name = index === 0 ? "alice" : "bob";
      expect(await response.json()).toEqual({ owner: name + "-new" });
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.getSetCookie()[0]).toContain("session=" + name + "-new");
    }
  });

  it("skips a competing scheduler and releases leadership after a failed task", async () => {
    const connection = { query: vi.fn().mockResolvedValue({ rows: [{ acquired: false }] }), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(connection) } as unknown as Pool;
    const task = vi.fn().mockResolvedValue({ accounts: 0, sent: 0, calendars: 0 });
    await runScheduledWork(pool, task);
    expect(task).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    connection.query.mockResolvedValue({ rows: [{ acquired: true }] });
    task.mockRejectedValueOnce(new Error("delivery interrupted"));
    await expect(runScheduledWork(pool, task)).rejects.toThrow("delivery interrupted");
    expect(connection.query).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(726149, 1)");
    expect(connection.release).toHaveBeenCalledTimes(2);
  });

  it("correlates backend API logs without recording query secrets or cookies",async()=>{
    const log=vi.spyOn(console,"info").mockImplementation(()=>{}),server=createBackend();
    try{
      const id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const response=await server.inject({method:"GET",url:"/api/version?token=private-value",headers:{"x-request-id":id,cookie:"session=private-cookie"}});
      expect(response.headers["x-request-id"]).toBe(id);
      const events=log.mock.calls.map(call=>JSON.parse(call[0]));
      expect(events).toContainEqual(expect.objectContaining({event:"backend.request",requestId:id,status:200,method:"GET",route:"/api/version"}));
      expect(JSON.stringify(events)).not.toContain("private-");
    }finally{await server.close();log.mockRestore();}
  });

  it("serves API health independently and enforces authentication and upload limits", async () => {
    const server = createBackend();
    try {
      expect((await server.inject({ method: "GET", url: "/api/health/live" })).json()).toEqual({ status: "ok" });
      expect((await server.inject({ method: "GET", url: "/api/railwatch/workspace" })).statusCode).toBe(401);
      const invalid = await server.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://foreign.invalid", "x-forwarded-host": "foreign.invalid", "content-type": "application/json" }, payload: "{}" });
      expect(invalid.statusCode).toBe(403);
      const oversize = await server.inject({ method: "PUT", url: "/api/railwatch/workspace", headers: { "content-type": "application/json" }, payload: "x".repeat(11_000_001) });
      expect(oversize.statusCode).toBe(413);
      expect(oversize.json().error.code).toBe("PAYLOAD_TOO_LARGE");
    } finally { await server.close(); }
  });
});
