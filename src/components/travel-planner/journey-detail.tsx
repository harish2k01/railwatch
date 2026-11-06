"use client";
import { useEffect, useId, useState } from "react";
import { Check, Paperclip, FileText } from "lucide-react";
import { formatDay, type Journey, type TicketAttachment } from "@/lib/travel-planner";
import { journeyStages } from "@/lib/journey-stages";
import { bookingDay as bookingDate, daysBetween } from "@/lib/travel-planner";
/** Days from today until booking opens (0 = today, negative = already open). */
const daysUntilOpen = (j: Journey, today: string) => daysBetween(today, bookingDate(j));
import { stationLabel } from "@/lib/journey-display";
import { loadStations } from "@/lib/stations";
import { ActionMenu } from "./action-menu";
import { useMobileWorkspace } from "./mobile-workspace";
import s from "./planner.module.css";
import d from "./journey-detail.module.css";

/** Resolves a station code to its directory name, once the directory has loaded. */
export function useStationName(code: string) {
  const [name, setName] = useState("");
  useEffect(() => { let live = true; void loadStations().then((all) => { if (live) setName(all.find(([c]) => c === code.trim().toUpperCase())?.[1] ?? ""); }); return () => { live = false; }; }, [code]);
  return name;
}

/** Read-first journey panel (plan 2.2): stages, ticket, details, reminders and notes; edits sit behind ⋯. */
const PILL: Record<Journey["status"], string> = { needs_booking: "Planned", booked: "Booked", skipped: "Skipped", cancellation_needed: "To cancel", cancelled: "Cancelled", completed: "Travelled" };

export function JourneyDetail({ skip, restore, attachFile, journey: j, today, routine, reminders, uploadsEnabled, edit, attach, view, cancel, remove, bookingDay }: {
  bookingDay?: () => void; attachFile?: (file: File) => void; skip?: () => void; restore?: () => void;
  journey: Journey; today: string; routine?: string; reminders: string; uploadsEnabled: boolean;
  edit: () => void; attach: () => void; view: (file: TicketAttachment) => void; cancel: () => void; remove?: () => void;
}) {
  const mobile = useMobileWorkspace();
  const pickerId = useId();
  const [dragging, setDragging] = useState(false);
  const choose = attachFile ? () => (document.getElementById(pickerId) as HTMLInputElement | null)?.click() : attach;
  const from = useStationName(j.from), to = useStationName(j.to);
  const pdfs = j.attachments?.filter((f) => f.type === "application/pdf") ?? [];
  const stages = journeyStages(j, today, routine);
  const details: [string, string][] = [
    ["Train", [j.trainNumber, j.trainName || j.train].filter(Boolean).join(" · ")], ["PNR", j.pnr],
    ["Coach · berth", [j.coach, j.seat, j.berth].filter(Boolean).join(" · ")], ["Departs", j.departureConfirmed && j.departure ? `${j.departure} IST` : ""],
    ["Class", j.travelClass], ["Ticket status", j.ticketStatus === "CNF" ? "Confirmed" : j.ticketStatus ?? ""],
  ];
  const booked = j.status === "booked";
  const main = j.status === "cancellation_needed" ? { label: "Confirm cancellation", run: cancel }
    : booked && !pdfs.length && uploadsEnabled ? { label: "Attach ticket", run: choose }
    : j.status === "needs_booking" && bookingDay && daysUntilOpen(j, today) <= 1 ? { label: "Booking day", run: bookingDay }
    : j.status === "needs_booking" ? { label: "Record booked ticket", run: attach } : undefined;
  const actions = [{ label: "Edit journey", onClick: edit }, ...(bookingDay ? [{ label: "Booking day", onClick: bookingDay }] : []), ...(j.status === "cancellation_needed" ? [{ label: "Confirm cancellation", onClick: cancel }] : []), ...(skip ? [{ label: "Skip this trip", onClick: skip }] : []), ...(restore ? [{ label: "Restore trip", onClick: restore }] : []), ...(remove ? [{ label: "Delete journey", onClick: remove, danger: true }] : [])];
  return <div className={d.detail}>
    <header className={d.head}>
      <div>
        <p className={d.kicker}>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{mobile ? " · Onward" : routine ? ` · ${routine}` : ""}</p>
        {mobile ? <h2 className={d.route}>{j.from} → {j.to}</h2> : <p className={d.route}><b title={j.from}>{stationLabel(j.from)}</b> → <b title={j.to}>{stationLabel(j.to)}</b></p>}
        {(from || to) && <p className={d.names}>{from || j.from} to {to || j.to}</p>}
        {mobile && <span className={d.pill} data-status={j.status}>{PILL[j.status]}</span>}
      </div>
      <ActionMenu label="More journey actions" actions={actions} />
    </header>
    <ol className={d.stages} aria-label="Journey stages">{stages.map((st) => <li key={st.label} data-state={st.state}><span className={d.dot} aria-hidden="true">{st.state === "done" && <Check size={12} strokeWidth={3} />}</span><span className={d.stageText}><span className={d.stageLabel}>{st.label}</span><span className={st.warn ? d.warn : d.note}>{st.note}</span></span></li>)}</ol>
    <section aria-labelledby="journey-ticket" className={d.section}>
      <h3 id="journey-ticket">{mobile ? "Ticket details" : "Ticket"}</h3>
      {pdfs.length ? <ul className={d.files}>{pdfs.map((file, i) => <li key={file.id}><button type="button" className={s.secondary} onClick={() => view(file)}><FileText size={16} />View ticket{pdfs.length > 1 ? ` ${i + 1}` : ""}</button></li>)}</ul>
        : mobile ? null : uploadsEnabled && j.status !== "cancelled" ? <button type="button" className={d.drop} data-dragging={dragging || undefined} onClick={choose} onDragOver={e => { if (!attachFile) return; e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { if (!attachFile) return; e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) attachFile(f); }}><Paperclip size={22} aria-hidden="true" /><span>Drop the IRCTC PDF here</span><small>Train, coach, berth and PNR are read on this device and filled in below.</small><span className={`${s.primary} ${d.choose}`}>Choose file</span></button>
        : <p className={d.note}>No ticket attached.</p>}
      <dl className={d.grid}>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd data-empty={!value || undefined}>{value || "Not set"}</dd></div>)}</dl>
    </section>
    <section aria-labelledby="journey-reminders" className={d.section}>
      <h3 id="journey-reminders">{mobile ? "Reminders & notes" : "Reminders"}</h3>
      <div className={d.line}><span>{j.status === "cancellation_needed" ? "Cancellation follow-up" : "Booking reminders"}</span><span className={d.note}>{reminders}</span></div>
      <div className={d.line}><span>Notes</span>{j.notes ? <span className={d.noteText}>{j.notes}</span> : <button type="button" className={d.link} onClick={edit}>Add note</button>}</div>
      <p className={s.help}>Book or cancel through IRCTC. RailWatch records your plans.</p>
    </section>
    {attachFile && <input id={pickerId} type="file" accept="application/pdf,.pdf" hidden aria-label="Choose ticket PDF" onChange={e => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ""; }} />}
    {main && <footer className={d.sticky}><button type="button" className={s.primary} onClick={() => main.run()}>{main.label}</button></footer>}
  </div>;
}
