"use client";
import { useState } from "react";
import { addDays, bookingDay, bookingInstant, bookingTimeLabel, formatDay, type Journey } from "@/lib/travel-planner";
import type { JourneyPages } from "@/lib/journey-pages";
import { ActionMenu, type Action } from "./action-menu";
import s from "./journeys-needs-you.module.css";

type Tile = "needs_booking" | "booked" | "cancellation_needed" | "cancelled";
const TILES: { id: Tile; label: string; tone: string }[] = [
  { id: "needs_booking", label: "Planned", tone: "planned" }, { id: "booked", label: "Booked", tone: "booked" },
  { id: "cancellation_needed", label: "To cancel", tone: "cancel" }, { id: "cancelled", label: "Cancelled", tone: "muted" },
];
/** Short station code from a stored name like "MADURAI JN. (MDU)". */
const code = (station: string) => station.match(/\(([A-Z]{2,5})\)/)?.[1] ?? station.match(/[-–]\s*([A-Z]{2,5})\s*$/)?.[1] ?? station;
const noTicket = (j: Journey) => j.status === "booked" && !j.attachments?.length && !j.pnr;

/**
 * Journeys "Needs you + timeline" (canvas JourneysNeedsYou.dc.html): status tiles that filter, a short list of
 * what needs doing, then upcoming trips grouped by month.
 */
export function JourneysNeedsYou({ rows, data, today, now, selectedId, busy, open, more, actions, attachTickets }: {
  rows: Journey[]; data?: JourneyPages; today: string; now: Date; selectedId?: string; busy: boolean;
  open: (j: Journey) => void; more: (column: string) => Promise<void>; actions: (j: Journey) => Action[]; attachTickets?: () => void;
}) {
  const [tile, setTile] = useState<Tile | "all">("all");
  const count = (id: Tile) => data?.pages[id]?.total;
  const missing = data?.totals.noTicket ?? rows.filter(noTicket).length;
  const soon = rows.filter(j => j.status === "needs_booking" && bookingDay(j) <= addDays(today, 2)).sort((a, b) => bookingInstant(a).getTime() - bookingInstant(b).getTime()).slice(0, 3);
  const cancelling = rows.filter(j => j.status === "cancellation_needed");
  const shown = rows.filter(j => tile === "all" || (tile === "cancelled" ? ["cancelled", "skipped"].includes(j.status) : j.status === tile)).sort((a, b) => a.date.localeCompare(b.date));
  const months = shown.reduce<{ key: string; label: string; trips: Journey[] }[]>((acc, j) => { const key = j.date.slice(0, 7); let g = acc.find(x => x.key === key); if (!g) acc.push(g = { key, label: formatDay(j.date, { month: "long", year: j.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" }), trips: [] }); g.trips.push(j); return acc; }, []);
  const status = (j: Journey) => noTicket(j) ? { text: "No PDF", tone: "warn" } : j.status === "booked" ? { text: j.ticketStatus && j.ticketStatus !== "CNF" ? j.ticketStatus : "Booked", tone: j.ticketStatus && j.ticketStatus !== "CNF" ? "warn" : "booked" } : j.status === "needs_booking" ? { text: bookingInstant(j) <= now ? "Book now" : "Planned", tone: bookingInstant(j) <= now ? "warn" : "planned" } : j.status === "cancellation_needed" ? { text: "To cancel", tone: "warn" } : { text: j.status === "skipped" ? "Skipped" : "Cancelled", tone: "muted" };
  const detail = (j: Journey) => j.status === "needs_booking" ? `Booking ${bookingInstant(j) <= now ? "opened" : "opens"} ${formatDay(bookingDay(j), { weekday: "short", day: "numeric", month: "short" })} · ${bookingTimeLabel(j).replace(" IST", "")}${j.bookingType === "tatkal" ? " · Tatkal" : ""}`
    : j.status === "booked" ? [[j.trainNumber, j.trainName || j.train].filter(Boolean).join(" "), [j.coach, j.seat, j.berth].filter(Boolean).join(" "), j.departureConfirmed && j.departure ? `dep ${j.departure}` : ""].filter(Boolean).join(" · ") || "Attach the IRCTC PDF to fill train and seat"
    : j.status === "cancellation_needed" ? "Cancel on IRCTC, then confirm here" : j.status === "skipped" ? "Skipped · restore from the menu" : "Cancelled";
  const needs = soon.length + cancelling.length + (missing ? 1 : 0);
  const nextKeys = Object.entries(data?.pages ?? {}).filter(([key, page]) => page.nextCursor && (tile === "all" || key === tile)).map(([key]) => key);

  return <div className={s.view}>
    <div className={s.tiles} role="group" aria-label="Filter by status">
      {TILES.map(t => <button key={t.id} type="button" className={s.tile} data-tone={t.tone} aria-pressed={tile === t.id} onClick={() => setTile(tile === t.id ? "all" : t.id)}>
        <b>{count(t.id) ?? "…"}</b><span>{t.label}{t.id === "booked" && missing ? ` · ${missing} no PDF` : ""}</span>
      </button>)}
    </div>

    {needs > 0 && tile === "all" && <section className={s.needs} aria-labelledby="needs-you">
      <h2 id="needs-you">Needs you · {needs}</h2>
      {soon.map(j => <div key={j.id} className={s.needRow}><span>{bookingInstant(j) <= now ? "Book now: " : "Book "}<b>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {code(j.from)} → {code(j.to)}</b>{bookingInstant(j) <= now ? ", booking is open" : `, opens ${formatDay(bookingDay(j), { weekday: "short", day: "numeric", month: "short" })} at ${bookingTimeLabel(j).replace(" IST", "")}`}</span><button type="button" className={s.needAction} onClick={() => open(j)}>Open</button></div>)}
      {cancelling.map(j => <div key={j.id} className={s.needRow}><span>Confirm cancellation of <b>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {code(j.from)} → {code(j.to)}</b></span><button type="button" className={s.needAction} onClick={() => open(j)}>Open</button></div>)}
      {missing > 0 && <div className={s.needRow}><span>Attach tickets for <b>{missing} booked {missing === 1 ? "trip" : "trips"}</b>, so train and seat are on hand</span>{attachTickets && <button type="button" className={s.needPrimary} onClick={attachTickets}>Attach tickets</button>}</div>}
    </section>}

    {months.map(m => <section key={m.key} className={s.month} aria-label={m.label}>
      <h2>{m.label}</h2>
      {m.trips.map(j => { const st = status(j); return <div key={j.id} className={s.trip} aria-current={selectedId === j.id || undefined}>
        <button type="button" className={s.tripOpen} aria-label={`Open journey ${j.from} to ${j.to}`} onClick={() => open(j)}>
          <span className={s.day}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { weekday: "short" }).toUpperCase()}</small></span>
          <span className={s.text}><b>{code(j.from)} → {code(j.to)}</b><small>{detail(j)}</small></span>
          <span className={s.pill} data-tone={st.tone}>{st.text}</span>
        </button>
        <ActionMenu label={`Actions For Journey ${j.from} to ${j.to}, ${formatDay(j.date)}`} actions={actions(j)} />
      </div>; })}
    </section>)}
    {!months.length && data && <p className={s.empty}>{tile === "all" ? "No upcoming journeys. Plan one with New journey." : "No journeys with this status."}</p>}
    {nextKeys.length > 0 && <button type="button" className={s.more} disabled={busy} onClick={() => void Promise.all(nextKeys.map(key => more(key)))}>{busy ? "Loading…" : "Load more journeys"}</button>}
  </div>;
}
