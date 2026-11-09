import { spawn } from "node:child_process";
import path from "node:path";
import { ApiError } from "./http";
import { parsePnrStatus } from "./pnr-status";

let busy = false;
/** Runs the pinned Python client without a shell, with bounded output and a hard deadline. */
export async function lookupPnr(pnr: string) {
  if (!/^\d{10}$/.test(pnr)) throw new ApiError(400, "Enter a valid 10-digit PNR.");
  if (busy) throw new ApiError(503, "A PNR check is already running. Try again shortly.", "PNR_BUSY");
  busy = true;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.env.PNR_PYTHON ?? "python3", [path.resolve("scripts/ntes/pnr.py")], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
      let result = "";
      const fail = () => { child.kill(); reject(new Error("PNR_UNAVAILABLE")); };
      const timer = setTimeout(fail, 22_000);
      child.once("error", () => { clearTimeout(timer); fail(); });
      child.stdin.on("error", () => { /* process exit is handled below */ });
      child.stdout.on("data", chunk => { result += chunk.toString(); if (result.length > 128_000) fail(); });
      child.once("close", code => { clearTimeout(timer); if (code === 0) resolve(result); else reject(new Error("PNR_UNAVAILABLE")); });
      child.stdin.end(JSON.stringify({ pnr }));
    });
    return parsePnrStatus(JSON.parse(output), pnr);
  } catch {
    throw new ApiError(502, "PNR status could not be checked. Try again later or check Indian Railways. Your last saved status is unchanged.", "PNR_UNAVAILABLE");
  } finally { busy = false; }
}
