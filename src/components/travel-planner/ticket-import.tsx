"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { extractTicketFile, saveTicketFile, deleteTicketFile, validateTicketFile } from "@/lib/ticket-files";
import { matchTicket, type TicketMatch } from "@/lib/ticket-match";
import { formatDay, journeySchema, transitionJourney, type Journey, type Planner, type TicketAttachment } from "@/lib/travel-planner";
import type { TicketDetails } from "@/lib/ticket-details";
import type { JourneyPages } from "@/lib/journey-pages";
import { stationLabel } from "@/lib/journey-display";
import s from "./planner.module.css";
import t from "./ticket-import.module.css";

type Row = { file: File; meta: TicketAttachment; details: TicketDetails; match: TicketMatch; choice: string; message: string };

/** Fills journey ticket fields from extracted details without overwriting values already entered. */
function withTicket(j: Journey, d: TicketDetails, meta: TicketAttachment): Journey {
  const pick = <K extends keyof Journey>(k: K, v: Journey[K] | undefined) => (j[k] ? j[k] : v);
  return { ...(j.status === "needs_booking" ? transitionJourney(j, "booked") : j), attachments: [...(j.attachments ?? []), meta], pnr: pick("pnr", d.pnr) ?? "", trainNumber: pick("trainNumber", d.trainNumber), trainName: pick("trainName", d.trainName), coach: pick("coach", d.coach), seat: pick("seat", d.seat), berth: pick("berth", d.berth), travelClass: pick("travelClass", d.travelClass) ?? "", ticketStatus: j.ticketStatus ?? d.ticketStatus, ...(d.departure && !j.departureConfirmed ? { departure: d.departure, departureConfirmed: true } : {}) };
}

/** Bulk ticket import (plan 3.3): read PDFs on this device, match them to journeys, then save in one commit. */
export function TicketImport({ planner, commit, fail, done }: { planner: Planner; commit: (next: Planner, message: string) => Promise<boolean>; fail: (message: string) => void; done: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  async function choose(files: FileList | null) {
    if (!files?.length) return;
    const pdfs = [...files].filter(f => f.type === "application/pdf").slice(0, 30);
    if (!pdfs.length) { fail("Choose IRCTC e-ticket PDFs."); return; }
    setBusy(true);
    try {
      const read: Omit<Row, "match" | "choice">[] = [];
      for (const [i, file] of pdfs.entries()) {
        setStatus(`Reading ticket ${i + 1} of ${pdfs.length}…`);
        const meta = validateTicketFile(file);
        try { const r = await extractTicketFile(file); read.push({ file, meta, details: r.details, message: r.message }); }
        catch { read.push({ file, meta, details: {}, message: "Couldn’t read details from this ticket." }); }
      }
      // Candidates come from the server for the ticket dates, so journeys not loaded locally still match.
      const dates = [...new Set(read.map(r => r.details.date).filter(Boolean) as string[])];
      const found = new Map<string, Journey>();
      for (const d of dates) { const page = await apiRequest<JourneyPages>(`/api/railwatch/journeys?view=list&range=all&from=${d}&to=${d}`); for (const j of page.pages.all?.items ?? []) found.set(j.id, j); }
      const pool = [...new Map([...planner.journeys, ...found.values()].map(j => [j.id, j])).values()];
      setRows(read.map(r => { const match = matchTicket(r.details, pool); return { ...r, match, choice: match.kind === "matched" ? match.journey.id : "" }; }));
      setStatus("");
    } catch (e) { fail(e instanceof Error ? e.message : "Couldn’t read these tickets."); setStatus(""); }
    finally { setBusy(false); }
  }
  async function save() {
    const chosen = rows.filter(r => r.choice);
    if (!chosen.length) return;
    setBusy(true); const stored: string[] = [];
    try {
      let journeys = [...planner.journeys];
      for (const r of chosen) {
        await saveTicketFile(r.meta.id, r.file); stored.push(r.meta.id);
        if (r.choice === "create") {
          const d = r.details, created = journeySchema.safeParse({ id: crypto.randomUUID(), from: d.from ?? "", to: d.to ?? "", date: d.date, departure: d.departure ?? "20:00", departureConfirmed: Boolean(d.departure), train: d.trainName ?? "", travelClass: d.travelClass ?? "", windowDays: planner.settings.bookingWindowDays, originOffset: 0, pnr: d.pnr ?? "", notes: "", status: "booked", attachments: [r.meta], trainNumber: d.trainNumber, trainName: d.trainName, coach: d.coach, seat: d.seat, berth: d.berth, ticketStatus: d.ticketStatus });
          if (!created.success) throw new Error(`${r.file.name}: the route or date couldn’t be read. Attach it from the journey instead.`);
          journeys.push(created.data);
        } else {
          const base = journeys.find(j => j.id === r.choice) ?? (r.match.kind === "matched" ? r.match.journey : r.match.kind === "check" ? r.match.candidates.find(c => c.id === r.choice) : undefined);
          if (!base) continue;
          journeys = [...journeys.filter(j => j.id !== base.id), withTicket(base, r.details, r.meta)];
        }
      }
      // One workspace commit for every ticket, so the import is all-or-nothing.
      if (await commit({ ...planner, journeys }, `${chosen.length} ${chosen.length === 1 ? "ticket" : "tickets"} imported.`)) done();
      else await Promise.all(stored.map(id => deleteTicketFile(id).catch(() => undefined)));
    } catch (e) { await Promise.all(stored.map(id => deleteTicketFile(id).catch(() => undefined))); fail(e instanceof Error ? e.message : "Couldn’t import these tickets."); }
    finally { setBusy(false); }
  }
  const label = (j: Journey) => `${formatDay(j.date, { day: "numeric", month: "short" })} · ${stationLabel(j.from)} → ${stationLabel(j.to)}`;
  const counts={matched:rows.filter(r=>r.match.kind==="matched").length,check:rows.filter(r=>r.match.kind==="check").length,create:rows.filter(r=>r.match.kind==="create").length};
  const chosen=rows.filter(r=>r.choice).length;
  const read=(r:Row)=>[r.details.date?formatDay(r.details.date,{weekday:"short",day:"numeric",month:"short"}):"",r.details.from&&r.details.to?`${r.details.from} → ${r.details.to}`:"",r.details.ticketStatus??""].filter(Boolean).join(" · ")||"Couldn’t read the travel details";
  // Canvas TicketImport.dc.html: summary pills, drop zone, a File / Read / Journey / Result table, Cancel and Attach N.
  return <div className={t.import}>
    <div className={t.head}><p className={t.muted}>Files are read on this device, matched to your journeys, then stored encrypted.</p>{rows.length>0&&<div className={t.summary}>{counts.matched>0&&<span className={t.pillOk}>{counts.matched} matched</span>}{counts.check>0&&<span className={t.pillCheck}>{counts.check} needs review</span>}{counts.create>0&&<span className={t.pillNew}>{counts.create} new {counts.create===1?"journey":"journeys"}</span>}</div>}</div>
    <label className={t.drop}><input type="file" accept="application/pdf" multiple disabled={busy} onChange={e => { void choose(e.target.files); e.target.value = ""; }} /><span><b>{rows.length?"Drop more PDFs":"Drop IRCTC e-ticket PDFs"}</b> <span className={t.muted}>· up to 10 MB each</span></span><span className={`${s.secondary} ${t.chooseBtn}`}>Choose files</span></label>
    {status && <p role="status">{status}</p>}
    {rows.length > 0 && <div className={t.tableWrap}><table className={t.table} aria-label="Imported tickets"><thead><tr><th scope="col">File</th><th scope="col">Read from ticket</th><th scope="col">Journey</th><th scope="col">Result</th></tr></thead><tbody>{rows.map((r, i) => {
      const set=(choice:string)=>setRows(rows.map((x,k)=>k===i?{...x,choice}:x));
      return <tr key={r.meta.id} data-kind={r.match.kind}>
        <td className={t.file}>{r.file.name}</td>
        <td>{read(r)}</td>
        <td>{r.match.kind==="matched"?label(r.match.journey):r.match.kind==="check"?<select aria-label={`Choose journey for ${r.file.name}`} className={t.select} value={r.choice} onChange={e=>set(e.target.value)}><option value="">Don’t attach</option>{r.match.candidates.map(c=><option key={c.id} value={c.id}>{label(c)}</option>)}{r.details.date&&<option value="create">Create a booked journey</option>}</select>:<span className={t.muted}>{r.choice==="create"?"New booked journey":"No planned journey"}</span>}</td>
        <td>{r.match.kind==="matched"?<span className={t.pillOk}>Matched</span>:r.match.kind==="check"?<span className={t.pillCheck}>Check</span>:r.choice==="create"?<button type="button" className={`${s.secondary} ${t.small}`} onClick={()=>set("")}>Don’t create</button>:<button type="button" className={`${s.secondary} ${t.small}`} disabled={!r.details.date} onClick={()=>set("create")}>Create journey</button>}</td>
      </tr>;})}</tbody></table></div>}
    <div className={t.footer}><button type="button" className={s.secondary} onClick={done}>Cancel</button><button type="button" className={s.primary} disabled={busy || !chosen} onClick={() => void save()}>{busy ? "Working…" : `Attach ${chosen} ${chosen===1?"ticket":"tickets"}`}</button></div>
  </div>;
}
