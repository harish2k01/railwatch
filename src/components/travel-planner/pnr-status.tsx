"use client";
import { useState, useEffect, useEffectEvent } from "react";
import type { Journey } from "@/lib/travel-planner";
import { pnrSummary } from "@/lib/pnr-status";
import { apiRequest } from "@/lib/client-api";
import s from "./planner.module.css";
import d from "./journey-detail.module.css";
import p from "./pnr-status.module.css";

/** Refreshes when a journey opens, retaining the last successful snapshot during the request. */
export function PnrStatus({ journey: j, saved }: { journey: Journey; saved: (journey: Journey) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const snapshot = j.pnrStatus?.pnr === j.pnr ? j.pnrStatus : undefined;
  const summary = snapshot ? pnrSummary(snapshot) : undefined;
  async function request() {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ journey: Journey }>("/api/railwatch/pnr", { method: "POST", body: JSON.stringify({ id: j.id }) });
      saved(result.journey);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not check this ticket."); }
    finally { setBusy(false); }
  }
  const refreshOnOpen = useEffectEvent(() => { void request(); });
  useEffect(() => { const timer = setTimeout(() => refreshOnOpen(), 0); return () => clearTimeout(timer); }, [j.id, j.pnr]);
  return <section className={`${d.section} ${p.panel}`} aria-label="PNR status">
    <div className={d.line}><h3>PNR status</h3><button type="button" className={s.secondary} disabled={busy} onClick={() => void request()}>{busy ? "Checking…" : "Refresh status"}</button></div>
    <p className={p.summary} data-status={summary}>{summary === "CANCELLED" ? "Cancelled" : summary === "CNF" ? "Confirmed" : summary === "WL" ? "Waitlisted" : summary === "RAC" ? "RAC" : snapshot ? "See passenger statuses" : "Not checked yet"}</p>
    <p className={d.note}>PNR ••••••{j.pnr.slice(-4)}</p>
    {snapshot ? <>
      <p className={d.note}>{snapshot.chartStatus || "Chart status unavailable"} · Last refreshed {new Date(snapshot.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</p>
      <div className={p.scroll}><table><caption className={p.caption}>Passenger booking and current status</caption><thead><tr><th>Passenger</th><th>Booked</th><th>Current</th><th>Coach / berth</th></tr></thead><tbody>{snapshot.passengers.map(person => <tr key={person.number}><th scope="row">{person.number}</th><td>{person.booking || "—"}</td><td>{person.current}</td><td>{[person.coach, person.berth].filter(Boolean).join(" / ") || "Not supplied"}</td></tr>)}</tbody></table></div>
    </> : <p className={d.note}>Check the latest passenger status, chart preparation and coach or berth details.</p>}
    <p className={d.note}>Status refreshes when you open this journey. If every passenger is cancelled, the journey moves to Cancelled automatically.</p>
    {(error || j.pnrLastError) && <p role="alert">{error || j.pnrLastError}</p>}
    <a className={d.link} href="https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html" target="_blank" rel="noreferrer">Check on Indian Railways</a>
  </section>;
}
