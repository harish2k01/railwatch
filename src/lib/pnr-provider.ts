import { ApiError } from "./http";
import { parsePnrStatus } from "./pnr-status";
import { logger } from "./logger";

/**
 * Indian Railways PNR enquiry, with the CAPTCHA answered by the user. RailWatch fetches the CAPTCHA picture for
 * the user, the user types the answer, and RailWatch submits it with their saved PNR. Nothing solves the CAPTCHA
 * automatically, and requests identify themselves as RailWatch (no browser disguise). If the site stops answering
 * these requests, the check fails and the official page link remains.
 */
const SITE = "https://indianrail.gov.in/enquiry";
const PAGE = `${SITE}/PNR/PnrEnquiry.html`;
const AGENT = "RailWatch (personal PNR check; user-entered CAPTCHA)";
const TIMEOUT = 10_000;

/** Keeps only name=value pairs from Set-Cookie headers, for the follow-up requests of this one check. */
function cookies(response: Response, previous = ""): string {
  const jar = new Map(previous.split("; ").filter(Boolean).map(c => [c.split("=")[0], c] as const));
  for (const header of response.headers.getSetCookie?.() ?? []) { const pair = header.split(";")[0]; if (pair.includes("=")) jar.set(pair.split("=")[0], pair); }
  return [...jar.values()].join("; ");
}

async function get(url: string, cookie: string, accept: string) {
  return fetch(url, { headers: { "User-Agent": AGENT, Referer: PAGE, Accept: accept, "X-Requested-With": "XMLHttpRequest", ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(TIMEOUT), redirect: "manual", cache: "no-store" });
}

/** Starts a check: returns the CAPTCHA picture to show the user and the site session to answer it in. */
export async function startPnrCheck(): Promise<{ image: string; cookie: string }> {
  try {
    const config = await get(`${SITE}/CaptchaConfig`, "", "*/*");
    let cookie = cookies(config);
    const picture = await get(`${SITE}/captchaDraw.png?${Date.now()}`, cookie, "image/png,image/*;q=0.8");
    cookie = cookies(picture, cookie);
    const bytes = Buffer.from(await picture.arrayBuffer());
    if (!picture.ok || bytes.length < 50 || bytes.length > 200_000 || bytes.subarray(1, 4).toString() !== "PNG") throw new Error("no picture");
    return { image: `data:image/png;base64,${bytes.toString("base64")}`, cookie };
  } catch {
    throw new ApiError(502, "Indian Railways' PNR enquiry isn't answering right now. Try again later or use the official page.", "PNR_UNAVAILABLE");
  }
}

/** Submits the user's CAPTCHA answer with the saved PNR and returns the parsed status. */
export async function finishPnrCheck(cookie: string, pnr: string, answer: string) {
  if (!/^\d{10}$/.test(pnr)) throw new ApiError(400, "Enter a valid 10-digit PNR.");
  let data: Record<string, unknown>;
  try {
    const query = new URLSearchParams({ inputCaptcha: answer, inputPnrNo: pnr, inputPage: "PNR", language: "en" });
    const response = await get(`${SITE}/CommonCaptcha?${query}`, cookie, "application/json,*/*");
    const text = await response.text();
    if (!response.ok || !text.trim() || text.length > 256_000) { logger.warn("pnr.answer_failed", { stage: "response", status: response.status, length: text.length, type: response.headers.get("content-type") ?? "" }); throw new Error("empty"); }
    try { data = JSON.parse(text); } catch { logger.warn("pnr.answer_failed", { stage: "json", status: response.status, length: text.length }); throw new Error("json"); }
  } catch {
    throw new ApiError(502, "PNR status could not be checked. Try again later or use the official page. Your last saved status is unchanged.", "PNR_UNAVAILABLE");
  }
  const message = typeof data.errorMessage === "string" ? data.errorMessage : "";
  if (/captcha/i.test(message)) throw new ApiError(422, "That answer didn’t match. Try the new picture.", "PNR_CAPTCHA");
  if (message) { logger.warn("pnr.answer_failed", { stage: "message", message: message.slice(0, 120) }); throw new ApiError(502, "Indian Railways couldn’t return this PNR right now. Your last saved status is unchanged.", "PNR_UNAVAILABLE"); }
  try { return parsePnrStatus(data, pnr); }
  catch (error) {
    // Field names only (never values), to see what the enquiry returned.
    const shape = (v: unknown): string => Array.isArray(v) ? `[${v.length ? shape(v[0]) : ""}]` : v && typeof v === "object" ? `{${Object.keys(v).slice(0, 40).join(",")}}` : typeof v;
    logger.warn("pnr.answer_failed", { stage: "parse", reason: error instanceof Error ? error.message.slice(0, 200) : "", keys: shape(data).slice(0, 600), passengers: shape((data as Record<string, unknown>).passengerList ?? (data as Record<string, unknown>).passengers).slice(0, 400) }); throw new ApiError(502, "Indian Railways returned a status RailWatch couldn’t read. Your last saved status is unchanged.", "PNR_UNAVAILABLE"); }
}
