"use client";
import { effectiveTicketStatus, suggestPnrCheck } from "@/lib/pnr-status";
import { ask } from "./confirm";
import { EmptyState } from "./empty-state";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { extractTicketFile, getTicketFile } from "@/lib/ticket-files";

import { AlertTriangle, CheckCheck, Plus, Ticket } from "lucide-react";
import { addDays, bookingDay, bookingTimeLabel, daysBetween, formatDay, tripTiming, type Journey, type Planner } from "@/lib/travel-planner";
import type { DashboardView } from "@/lib/planning-views";
import { stationLabel } from "@/lib/journey-display";
import { useStationName } from "./journey-detail";

import { STATUS } from "./forms";
import s from "./planner.module.css";
import t from "./today.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const every = (days: number[]) => days.length === 7 ? "Every day" : `Every ${days.map(d => DAYS[d]).join(", ")}`;
const dayName = (date: string, today: string) => date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : formatDay(date, { weekday: "long" });
const time = (j: Journey) => bookingTimeLabel(j).replace(" IST", "");

/** A route code with its station name underneath (canvas: Today · Next trip). */
function Stop({ code }: { code: string }) {
  const name = useStationName(code);
  return <span className={t.stop}><b title={code}>{stationLabel(code)}</b>{name && <small>{name}</small>}</span>;
}

type Props = {
  planner: Planner; today: string; data: DashboardView; openJourney: (j: Journey) => void; createJourney: () => void;
  go: (tab: "journeys" | "calendar" | "routines" | "holidays", status?: Journey["status"]) => void; chooseDate: (date: string) => void;
  setStatus?: (j: Journey, status: Journey["status"]) => void; skipTimeOff?: (j: Journey) => void; keepTimeOff?: (j: Journey) => void;
  openBookingDay?: (j: Journey) => void; importTickets?: () => void; attachTicket?: (j: Journey) => void; remind?: (j: Journey) => void; updateStatus?: (j: Journey, text: string) => boolean;
};

/** What the attached ticket says: train, timing, class, seat and PNR (shown once a ticket is read). */
function TicketFacts({ j }: { j: Journey }) {
  const seat = [j.coach, j.seat].filter(Boolean).join(" / ");
  const facts: [string, string | undefined][] = [
    ["Train", [j.trainNumber, j.trainName || j.train].filter(Boolean).join(" ") || undefined],
    ["Timing", tripTiming(j)],
    ["Class", j.travelClass || undefined],
    ["Seat", seat ? seat + (j.berth ? ` · ${j.berth}` : "") : j.berth],
    ["PNR", j.pnr || undefined],
  ];
  const shown = facts.filter((f): f is [string, string] => Boolean(f[1]));
  return shown.length ? <dl className={t.facts}>{shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null;
}

/** Today (plan 2.3, canvas Main.dc.html): next trip, Do next, this week, the routine and time off. */
export function Dashboard({ planner, today, data, openJourney, createJourney, go, chooseDate, setStatus, skipTimeOff, keepTimeOff, openBookingDay, importTickets, attachTicket, updateStatus }: Props) {
  const { upcoming, bookingSoon, totals, week } = data;
  const found = upcoming.find(j => j.status === "booked") ?? upcoming[0];
  // Tickets attached before arrival times were read: read the stored PDF on this device once, save the arrival and mark it read.
  const [arrival, setArrival] = useState<{ id: string; arrival: string; arrivalDate?: string }>();
  useEffect(() => {
    const pdf = found?.status === "booked" && !found.arrival ? found.attachments?.find(a => a.type === "application/pdf" && !found.readTickets?.includes(a.id)) : undefined;
    if (!found || !pdf) return; let live = true;
    void (async () => { try { const blob = await getTicketFile(pdf.id); if (!blob) return; const d = (await extractTicketFile(new File([blob], pdf.name, { type: "application/pdf" }))).details; if (d.arrival && live) setArrival({ id: found.id, arrival: d.arrival, arrivalDate: d.arrivalDate }); await apiRequest("/api/railwatch/spend", { method: "POST", body: JSON.stringify({ fares: [{ id: found.id, read: [pdf.id], arrival: d.arrival, arrivalDate: d.arrivalDate }] }) }); } catch { /* the card still shows the other ticket details */ } })();
    return () => { live = false; };
  }, [found?.id, found?.arrival]); // eslint-disable-line react-hooks/exhaustive-deps -- read once per trip, not on every render
  const next = found && arrival?.id === found.id ? { ...found, ...arrival } : found;
  const holidays = planner.holidays.filter(h => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const routine = planner.rules.find(r => !r.paused), linked = routine?.linkedRuleId ? planner.rules.find(r => r.id === routine.linkedRuleId) : undefined;
  const missing = totals.noTicket ?? 0;
  // Tatkal fallback: opens the day before travel (10:00 AC, 11:00 non-AC).
  const tatkal = (j: Journey) => { const tk = { ...j, bookingType: "tatkal" as const, tatkalClass: j.tatkalClass ?? "ac" as const }; return `${formatDay(bookingDay(tk), { weekday: "short", day: "numeric", month: "short" })} · ${bookingTimeLabel(tk).replace(" IST", "")}`; };
  const istHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const missed = (j: Journey) => j.status === "needs_booking" && j.bookingType !== "tatkal" && (bookingDay(j) < today || (bookingDay(j) === today && istHour >= 18));
  const waitlisted = planner.journeys.filter(j => !j.archivedAt && j.status === "booked" && j.date >= today && (effectiveTicketStatus(j) === "WL" || effectiveTicketStatus(j) === "RAC")).sort((a, b) => a.date.localeCompare(b.date));
  const [statusFor, setStatusFor] = useState<string>();
  // Do next: what needs doing now, then missing tickets and the next booking openings (canvas order).
  const items: { key: string; node: React.ReactNode }[] = [
    ...data.attention.map(j => ({ key: "a" + j.id, node: <div className={t.row} data-attention>
      <button type="button" className={`${s.dashboardRow} ${t.rowMain}`} onClick={() => openJourney(j)}><span className={j.status === "cancellation_needed" ? t.tileCancel : t.tileOpen}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { month: "short" })}</small></span><span className={t.rowText}><b>{j.status === "cancellation_needed" ? "Cancellation to confirm" : missed(j) ? `Not booked yet · Tatkal opens ${tatkal(j)}` : "Booking is open"}</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</small></span></button>
      <span className={t.rowActions}>{setStatus && (j.status === "cancellation_needed"
        ? <button type="button" className={s.secondary} onClick={async () => { if (await ask("Have you cancelled this ticket through IRCTC?")) setStatus(j, "cancelled"); }}>Confirm cancellation</button>
        : <>{missed(j) && openBookingDay && <button type="button" className={s.secondary} onClick={() => openBookingDay(j)}>Try Tatkal</button>}<button type="button" className={s.secondary} onClick={() => setStatus(j, "booked")}>Mark booked</button></>)}</span>
    </div> })),
    ...waitlisted.map(j => ({ key: "w" + j.id, node: <div className={t.row} data-attention>
      <button type="button" className={`${s.dashboardRow} ${t.rowMain}`} onClick={() => openJourney(j)}><span className={t.tileCancel}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { month: "short" })}</small></span><span className={t.rowText}><b>{j.currentStatus ?? (j.ticketStatus === "WL" ? "Waitlisted" : "RAC")} · check the chart 4 hours before departure</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · Tatkal opens {tatkal(j)}</small></span></button>
      <span className={t.rowActions}>{updateStatus ? (statusFor === j.id ? <form className={t.statusForm} onSubmit={e => { e.preventDefault(); const text = new FormData(e.currentTarget).get("status")?.toString() ?? ""; if (updateStatus(j, text)) setStatusFor(undefined); }}><input name="status" aria-label="Current status" placeholder="WL 4, RAC 2, CNF or paste the SMS" autoFocus /><button type="submit" className={s.secondary}>Save</button></form> : <button type="button" className={s.secondary} onClick={() => setStatusFor(j.id)}>Update status</button>) : <span className={t.badgeWarn}>{j.ticketStatus}</span>}</span>
    </div> })),
    ...(missing > 0 && importTickets ? [{ key: "tickets", node: <div className={t.row}>
      <span className={`${t.rowMain} ${t.rowStatic}`}><span className={t.tileTicket} aria-hidden="true"><Ticket size={22} /></span><span className={t.rowText}><b>{missing} booked {missing === 1 ? "journey has" : "journeys have"} no ticket</b><small>Drop the IRCTC PDFs in one go. Details are read on your device.</small></span></span>
      <span className={t.rowActions}><button type="button" className={s.secondary} onClick={importTickets}>Attach tickets</button></span>
    </div> }] : []),
    ...bookingSoon.slice(0, 3).map(j => ({ key: "b" + j.id, node: <div className={t.row}>
      <button type="button" className={t.rowMain} onClick={() => openJourney(j)}><span className={t.tileOpen}><b>{bookingDay(j).slice(-2)}</b><small>{formatDay(bookingDay(j), { month: "short" })}</small></span><span className={t.rowText}><b>{j.bookingType === "tatkal" ? <>Tatkal opens {dayName(bookingDay(j), today)}, {time(j)}{bookingDay(j) === addDays(today, 1) ? " · get ready tonight" : bookingDay(j) === today ? " · be logged in 5 minutes early" : ""}</> : <>Booking opens {dayName(bookingDay(j), today)}, {time(j)}</>}</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {j.bookingType === "tatkal" ? "Tatkal" : "Normal quota"}</small></span></button>
      <span className={t.rowActions}>{bookingDay(j) <= addDays(today, 1) && openBookingDay && <button type="button" className={s.secondary} onClick={() => openBookingDay(j)}>Booking day</button>}{bookingDay(j) <= addDays(today, 1) && setStatus && <button type="button" className={s.secondary} onClick={() => setStatus(j, "booked")}>Mark booked</button>}</span>
    </div> })),
  ];
  return <div className={t.today}>
    {data.remindersOn === false && <section className={t.decision} aria-labelledby="today-reminders-off"><h2 id="today-reminders-off">Reminders are off</h2><div className={t.decisionLine}><span className={t.decisionTrip}><b>You won’t be told when booking opens</b><small>Turn on this device, Telegram or email so RailWatch can remind you.</small></span><Link className={s.secondary} href="/settings#settings-reminders">Turn on reminders</Link></div></section>}
    {(data.conflicts?.length ?? 0) > 0 && <section className={t.decision} aria-labelledby="today-decision"><h2 id="today-decision">Needs a decision</h2>
      {data.conflicts.map(j => <div key={j.id} className={t.decisionLine}><button type="button" className={t.decisionTrip} onClick={() => openJourney(j)}><b>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {stationLabel(j.from)} → {stationLabel(j.to)}</b><small>{STATUS[j.status]} on your time off{j.ruleId ? " · from a routine" : ""}</small></button>{skipTimeOff && <button type="button" className={s.primary} onClick={() => skipTimeOff(j)}>Skip this trip</button>}{keepTimeOff && <button type="button" className={s.secondary} onClick={() => keepTimeOff(j)}>Keep</button>}</div>)}
    </section>}
    <div className={t.grid}>
      <div className={t.column}>
        {next ? <section className={t.card} aria-labelledby="today-next">
          <header className={t.cardHead}><h2 id="today-next" className={t.eyebrow}>Next trip · {daysBetween(today, next.date) === 0 ? "today" : `in ${daysBetween(today, next.date)} day${daysBetween(today, next.date) === 1 ? "" : "s"}`}</h2><span className={`${t.pill} ${next.status === "booked" ? t.pillBooked : t.pillPlanned}`}><i aria-hidden="true" />{STATUS[next.status]}{next.ticketStatus && next.ticketStatus !== "CNF" ? ` · ${next.ticketStatus}` : ""}</span></header>
          <div className={t.route}><Stop code={next.from} /><span aria-hidden="true" className={t.track} /><Stop code={next.to} /><span className={t.when}><b>{formatDay(next.date, { weekday: "short", day: "numeric", month: "short" })}</b><small>{(() => { const name = planner.rules.find(r => r.id === next.ruleId)?.name ?? "", leg = next.leg === "return" ? "Return" : next.ruleId ? "Onward" : ""; return [name, name.toLowerCase().includes(leg.toLowerCase()) ? "" : leg]; })().concat([ next.departureConfirmed && next.departure ? `${next.departure} IST` : ""]).filter(Boolean).join(" · ") || "One-off trip"}</small></span></div>
          {next.status === "booked" && <TicketFacts j={next} />}
          {suggestPnrCheck(next, today) && <div className={t.nudge}><Ticket size={20} aria-hidden="true" /><span>Travel is close. Check the PNR for the latest status, chart and berth.</span><button type="button" className={s.secondary} onClick={() => openJourney(next)}>Check PNR</button></div>}
          {next.status === "booked" && !next.attachments?.length && <div className={t.nudge}><AlertTriangle size={20} aria-hidden="true" /><span>No ticket attached. Add it now so the train, coach and PNR are here on the day.</span>{attachTicket && <button type="button" className={s.primary} onClick={() => attachTicket(next)}>Attach ticket</button>}</div>}
          <div className={t.actions}><button type="button" className={s.secondary} onClick={() => openJourney(next)}>Open journey</button></div>
        </section> : <section className={t.card}><div className={s.dashboardEmpty}><CheckCheck size={26} />{planner.rules.length ? <><h3>No trips coming up</h3><p>Your routines have nothing in the next few weeks. Plan a one-off trip or check your routines.</p></> : <><h3>Start with your regular trip</h3><p>Set up your weekly route once. RailWatch plans each journey and reminds you before booking opens.</p><Link className={s.secondary} href="/routines">Set up a routine</Link></>}<button className={s.textButton} onClick={createJourney}><Plus size={15} />Plan a one-off trip</button></div></section>}

        <section className={t.section} aria-labelledby="today-do-next">
          <header className={t.sectionHead}><h2 id="today-do-next">Do next</h2><span className={t.muted}>{items.length} {items.length === 1 ? "item" : "items"}</span></header>
          {items.length ? <div className={t.list}>{items.map(i => <div key={i.key}>{i.node}</div>)}</div> : <EmptyState compact art="done" title="You’re All Caught Up">Nothing needs booking or cancelling right now.</EmptyState>}
        </section>
      </div>

      <div className={t.column} role="complementary" aria-label="This week and plans">
        <section className={t.card} aria-labelledby="today-week">
          <header className={t.cardHead}><h2 id="today-week">This week</h2><button type="button" className={t.link} onClick={() => go("calendar")}>Calendar</button></header>
          <ul className={t.week}>{Array.from({ length: 7 }, (_, i) => {
            const date = addDays(today, i), day = week[date], off = planner.holidays.filter(h => h.date === date);
            const parts = [...off.map(h => h.type === "company" ? `${h.name} · Company Holiday` : h.name), day?.journeys ? (day.journeys === 1 ? "1 Journey" : `${day.journeys} Journeys`) : "", day?.bookings ? "Booking Opens" : "", day?.cancellations ? `${day.cancellations} To Cancel` : ""].filter(Boolean);
            const dot = day?.journeys ? t.dotBooked : day?.bookings ? t.dotOpen : off.length ? t.dotOff : undefined;
            const text = parts.join(" · ");
            return <li key={date} data-today={i === 0 || undefined}><button type="button" onClick={() => chooseDate(date)} aria-label={`View ${formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}><span className={t.weekDay}>{i === 0 ? "Today" : formatDay(date, { weekday: "short", day: "numeric" })}</span><span className={text ? undefined : t.muted}>{text ? text[0].toUpperCase() + text.slice(1) : "Nothing Planned"}</span>{dot && <i className={dot} aria-hidden="true" />}</button></li>;
          })}</ul>
        </section>

        {routine && <section className={t.card} aria-labelledby="today-routine">
          <header className={t.cardHead}><h2 id="today-routine">{routine.name}</h2><button type="button" className={t.link} onClick={() => go("routines")}>Routines</button></header>
          {[routine, linked].filter((r): r is NonNullable<typeof r> => Boolean(r)).map(r => <div key={r.id} className={t.line}><span>{stationLabel(r.from)} → {stationLabel(r.to)}</span><span className={t.muted}>{every(r.weekdays)}</span></div>)}
          <hr className={t.rule} />
          <span className={t.muted}>{totals.upcoming} upcoming · {totals.booked} booked</span>
        </section>}

        <section className={t.card} aria-labelledby="today-off">
          <header className={t.cardHead}><h2 id="today-off">Coming up off</h2><button type="button" className={t.link} onClick={() => go("holidays")}>Time off</button></header>
          {holidays.length ? holidays.map(h => <div key={h.id} className={t.line}><span>{h.name}</span><span className={t.muted}>{formatDay(h.date, { weekday: "short", day: "numeric", month: "short" })}</span></div>) : <p className={t.muted}>Add company holidays or leave to plan around them.</p>}
        </section>
      </div>
    </div>
  </div>;
}
