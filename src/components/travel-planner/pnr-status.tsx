"use client";
import { useState } from "react";
import type { Journey } from "@/lib/travel-planner";
import { pnrSummary, suggestPnrCheck } from "@/lib/pnr-status";
import { todayIST } from "@/lib/travel-planner";
import { apiRequest } from "@/lib/client-api";
import { ask } from "./confirm";
import s from "./planner.module.css";
import d from "./journey-detail.module.css";
import p from "./pnr-status.module.css";

/**
 * PNR status from Indian Railways' enquiry. The user answers the enquiry's CAPTCHA (shown here); RailWatch never
 * solves it. A cancelled status is only offered, never applied without confirming.
 */
export function PnrStatus({ journey: j, saved }: { journey: Journey; saved: (journey: Journey) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [check, setCheck] = useState<{ token: string; image: string }>(), [answer, setAnswer] = useState("");
  const snapshot = j.pnrStatus?.pnr === j.pnr ? j.pnrStatus : undefined;
  const summary = snapshot ? pnrSummary(snapshot) : undefined;
  const active = ["booked", "cancellation_needed", "needs_booking"].includes(j.status);
  const suggest = !check && suggestPnrCheck(j, todayIST());
  async function call<T>(body: object) { return apiRequest<T>("/api/railwatch/pnr", { method: "POST", body: JSON.stringify({ id: j.id, ...body }) }); }
  async function start() {
    setBusy(true); setError(""); setAnswer("");
    try { setCheck(await call<{ token: string; image: string }>({ action: "start" })); }
    catch (e) { setCheck(undefined); setError(e instanceof Error ? e.message : "Could not start the check."); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!check || !answer.trim()) return;
    setBusy(true); setError("");
    try { const result = await call<{ journey: Journey }>({ action: "answer", token: check.token, answer: answer.trim() }); setCheck(undefined); saved(result.journey); }
    catch (e) {
      setError(e instanceof Error ? e.message : "Could not check this ticket.");
      // Each picture takes one answer: fetch a fresh one for another try.
      const code = (e as { code?: string }).code;
      if (code === "PNR_CAPTCHA" || code === "PNR_EXPIRED") { setBusy(false); await start(); return; }
      setCheck(undefined);
    }
    finally { setBusy(false); }
  }
  async function markCancelled() {
    if (!await ask(`Indian Railways shows every passenger on this ticket cancelled. Mark ${j.from} → ${j.to} cancelled?`, { confirmLabel: "Mark cancelled", danger: true })) return;
    setBusy(true); setError("");
    try { saved((await call<{ journey: Journey }>({ action: "cancel" })).journey); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update this journey."); }
    finally { setBusy(false); }
  }
  return <section className={`${d.section} ${p.panel}`} aria-label="PNR status">
    <div className={d.line}><h3>PNR status</h3>{!check && <button type="button" className={s.secondary} disabled={busy} onClick={() => void start()}>{busy ? "Loading…" : snapshot ? "Check again" : "Check status"}</button>}</div>
    {suggest && <p className={p.suggest}>Travel is close. Check the PNR for the latest status, chart and berth.</p>}
    {check && <form className={p.captcha} onSubmit={e => void submit(e)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a one-off data: URL from the enquiry */}
      <img src={check.image} alt="Indian Railways check: work out the sum shown" width={150} height={30} />
      <label><span>Answer</span><input inputMode="numeric" autoComplete="off" autoFocus maxLength={12} value={answer} onChange={e => setAnswer(e.target.value)} disabled={busy} /></label>
      <button type="submit" className={s.primary} disabled={busy || !answer.trim()}>{busy ? "Checking…" : "Check"}</button>
      <button type="button" className={s.textButton} disabled={busy} onClick={() => void start()}>New picture</button>
      <button type="button" className={s.textButton} disabled={busy} onClick={() => setCheck(undefined)}>Cancel</button>
    </form>}
    <p className={p.summary} data-status={summary}>{summary === "CANCELLED" ? "Cancelled" : summary === "CNF" ? "Confirmed" : summary === "WL" ? "Waitlisted" : summary === "RAC" ? "RAC" : snapshot ? "See passenger statuses" : "Not checked yet"}</p>
    {summary === "CANCELLED" && active && <div className={p.cancel}><span>Every passenger shows cancelled.</span><button type="button" className={s.secondary} disabled={busy} onClick={() => void markCancelled()}>Mark cancelled</button></div>}
    <p className={d.note}>PNR ••••••{j.pnr.slice(-4)}</p>
    {snapshot ? <>
      <p className={d.note}>{snapshot.chartStatus || "Chart status unavailable"} · Last checked {new Date(snapshot.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</p>
      <div className={p.scroll}><table><caption className={p.caption}>Passenger booking and current status</caption><thead><tr><th>Passenger</th><th>Booked</th><th>Current</th><th>Coach / berth</th></tr></thead><tbody>{snapshot.passengers.map(person => <tr key={person.number}><th scope="row">{person.number}</th><td>{person.booking || "—"}</td><td>{person.current}</td><td>{[person.coach, person.berth].filter(Boolean).join(" / ") || "Not supplied"}</td></tr>)}</tbody></table></div>
    </> : <p className={d.note}>Check the latest passenger status, chart preparation and coach or berth details. You’ll answer Indian Railways’ quick check.</p>}
    {(error || j.pnrLastError) && <p role="alert">{error || j.pnrLastError}</p>}
    <a className={d.link} href="https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html" target="_blank" rel="noreferrer">Check on Indian Railways</a>
  </section>;
}
