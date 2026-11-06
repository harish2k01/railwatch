"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { daysBetween, formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import { stationLabel, timeOffGroups } from "@/lib/journey-display";
import { ActionMenu } from "./action-menu";
import s from "./time-off-overview.module.css";

type Break = { start: string; end: string; days: number; names: string[]; planBy: string; bookingAlreadyOpen: boolean };
const short = (d: string) => formatDay(d, { day: "numeric", month: "short" });

/** Time off (plan 2.7, canvas TimeOff.dc.html): upcoming ranges with trip impact, trips on leave, long weekends. */
export function TimeOffOverview({ holidays, today, breaks, remove, plan, journeys = [], skip, keep, open }: {
  holidays: Planner["holidays"]; today: string; breaks: Break[];
  remove: (id: string) => void; plan: (date: string) => void;
  journeys?: Journey[]; skip?: (journey: Journey) => void; keep?: (journey: Journey) => void; open?: (journey: Journey) => void;
}) {
  const [past, setPast] = useState(false), [kept, setKept] = useState<string[]>([]);
  const groups = timeOffGroups(holidays, today, past);
  const active = journeys.filter(j => !j.archivedAt && ["needs_booking", "booked"].includes(j.status));
  const tripsIn = (start: string, end: string) => active.filter(j => j.date >= start && j.date <= end);
  const offDays = new Set(holidays.filter(h => h.date >= today).map(h => h.date));
  const affected = active.filter(j => j.date >= today && offDays.has(j.date) && !kept.includes(j.id) && !j.timeOffKept).sort((a, b) => a.date.localeCompare(b.date));
  // A break already under way still counts (e.g. a holiday right after leave you are on now).
  const upcomingBreaks = breaks.filter(b => b.end >= today);
  /** "2 – 6 Nov · 5 days · ends tomorrow" or "Mon, 9 Nov · company holiday", as on the board. */
  const detail = (g: (typeof groups)[number]) => {
    if (g.start === g.end) return `${formatDay(g.start, { weekday: "short", day: "numeric", month: "short" })} · ${g.type === "company" ? "company holiday" : "leave"}`;
    const left = daysBetween(today, g.end), ends = g.start <= today && g.end >= today ? (left === 0 ? " · ends today" : left === 1 ? " · ends tomorrow" : ` · ends in ${left} days`) : "";
    return `${Number(g.start.slice(-2))} – ${short(g.end)} · ${g.days.length} days${ends}`;
  };
  return <div className={s.layout}>
    <section aria-labelledby="time-off-list" className={s.listSection}>
      <h2 id="time-off-list">{past ? "Past" : "Upcoming"}</h2>
      {groups.length ? <div className={s.card}>{groups.map(g => {
        const n = tripsIn(g.start, g.end).length, now = g.start <= today && g.end >= today;
        return <div key={`${g.type}-${g.name}-${g.start}`} className={s.row} data-current={now || undefined}>
          <span className={s.date} aria-hidden="true"><b>{formatDay(g.start, { day: "2-digit" })}</b><small>{formatDay(g.start, { month: "short" })}</small></span>
          <span className={s.text}><strong>{g.name}</strong><span>{detail(g)}</span></span>
          {now && <span className={s.pillNow}>In progress</span>}
          {!past && <span className={n ? s.pillWarn : s.pillOk}>{n ? `${n} ${n === 1 ? "trip" : "trips"} affected` : "No trips affected"}</span>}
          <ActionMenu label={`Actions for ${g.name}`} actions={g.days.map(d => ({ label: g.days.length > 1 ? `Remove ${short(d.date)}` : "Remove time off", danger: true, onClick: () => remove(d.id) }))} />
        </div>;
      })}</div> : <div className={s.empty}><CalendarDays size={24} aria-hidden="true" /><strong>{past ? "No past time off" : "No upcoming time off"}</strong><p>{past ? "Past holidays and leave will appear here." : "Add time off or import company holidays to plan your next break."}</p></div>}
      <button type="button" className={s.link} onClick={() => setPast(!past)}>{past ? "Show upcoming time off" : "Show past time off"}</button>
    </section>
    <aside className={s.side} aria-label="Trips and long weekends">
      {!past && affected.length > 0 && <section className={s.affected} aria-labelledby="time-off-affected"><h2 id="time-off-affected">Trips during your leave</h2>
        {affected.map(j => <div key={j.id} className={s.affectedTrip}><button type="button" className={s.tripLine} onClick={() => open?.(j)}><span>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {stationLabel(j.from)} → {stationLabel(j.to)}</span><span className={s.muted}>{j.status === "booked" ? "Booked" : "Planned"}</span></button>
          <div className={s.actions}>{skip && j.status === "needs_booking" && <button type="button" className={s.skip} onClick={() => skip(j)}>Skip it</button>}<button type="button" className={s.keep} onClick={() => { setKept([...kept, j.id]); keep?.(j); }}>Keep</button></div></div>)}
      </section>}
      <section className={s.card + " " + s.weekends} aria-labelledby="time-off-weekends"><h2 id="time-off-weekends">Long weekends ahead</h2>
        {upcomingBreaks.length ? upcomingBreaks.map(item => <div key={item.start} className={s.tile}>
          <div className={s.tileHead}><strong>{item.names.join(" + ")}</strong><span>{item.days} days off</span></div>
          <span className={s.muted}>{formatDay(item.start, { weekday: "short", day: "numeric" })} – {formatDay(item.end, { weekday: "short", day: "numeric", month: "short" })} · {item.start <= today ? "under way now" : item.bookingAlreadyOpen ? "booking is open" : `booking opens ${short(item.planBy)}`}</span>
          <button type="button" className={s.link} onClick={() => plan(item.start)} aria-label={`Plan a trip for ${item.names.join(" + ")}`}>Plan a trip →</button>
        </div>) : <p className={s.muted}>No upcoming long weekends in your current time off.</p>}
      </section>
    </aside>
  </div>;
}
