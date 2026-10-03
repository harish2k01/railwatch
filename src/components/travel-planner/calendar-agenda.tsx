import { ArrowRight } from "lucide-react";
import { addDays, formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import { stationLabel } from "@/lib/journey-display";
import { STATUS } from "./forms";
import type {CalendarCounts} from "@/lib/planning-views";
import s from "./planner.module.css";

/** Lists every visible event in a month using the same calendar-layer filters. */
export function CalendarAgenda({ month, eventsFor, open,counts,layers,openDay }: { month: string; eventsFor: (date: string) => { journeys: Journey[]; bookings: Journey[]; holidays: Planner["holidays"] }; open: (journey: Journey) => void;counts:CalendarCounts;layers:{journeys:boolean;bookings:boolean};openDay:(date:string)=>void }) {
  const days = Array.from({ length: 31 }, (_, i) => addDays(`${month}-01`, i)).filter(date => date.startsWith(month)).map(date => ({ date, ...eventsFor(date),total:(layers.journeys?counts[date]?.journeys??0:0)+(layers.bookings?counts[date]?.bookings??0:0) })).filter(day => day.total || day.holidays.length);
  return <section className={s.agenda} aria-label="Month agenda">{days.map(day => <section className={s.agendaDay} key={day.date}><h3>{formatDay(day.date, { weekday: "short", day: "numeric", month: "short" })}</h3>{day.holidays.map(h => <p key={h.id}>{h.name}</p>)}{day.bookings.map(j => <button className={s.agendaRow} key={`b-${j.id}`} onClick={() => open(j)}>Booking opens · {stationLabel(j.from)} → {stationLabel(j.to)}<ArrowRight size={16}/></button>)}{day.journeys.map(j => <button className={s.agendaRow} key={j.id} onClick={() => open(j)}><b>{stationLabel(j.from)} → {stationLabel(j.to)}</b><span className={`${s.badge} ${j.status === "cancellation_needed" ? s.badgeAmber : s.badgeGreen}`}>{STATUS[j.status]}</span>{j.departureConfirmed && <span>{j.departure} IST</span>}<ArrowRight size={16}/></button>)}{day.total>day.journeys.length+day.bookings.length&&<button className={s.secondary} onClick={()=>openDay(day.date)}>View all {day.total} events</button>}</section>)}{!days.length && <p>No events in this month with the selected filters.</p>}<p className={s.help}>Select Month to choose an empty day and plan travel.</p></section>;
}
