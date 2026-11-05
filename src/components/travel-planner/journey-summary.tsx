"use client";
import { ArrowRight } from "lucide-react";
import { bookingTimeLabel,bookingDay, formatDay, type Journey, type TicketAttachment } from "@/lib/travel-planner";
import { stationLabel } from "@/lib/journey-display";
import { STATUS } from "./forms";
import s from "./planner.module.css";

/** Presents travel essentials before exposing editing or deliberate status changes. */
export function JourneySummary({ journey: j, routine, edit, view, cancel }: { journey: Journey; routine?: string; edit: () => void; view: (file: TicketAttachment) => void; cancel: () => void }) {
  const details = [
    ["Departure (IST)", j.departureConfirmed ? j.departure : ""], ["Train", [j.trainNumber, j.trainName || j.train].filter(Boolean).join(" · ")],
    ["Class", j.travelClass], ["Coach", j.coach], ["Seat", j.seat], ["Berth", j.berth], ["PNR", j.pnr], ["Routine", routine],
  ].filter(([, value]) => Boolean(value));
  return <div className={s.form}><div className={s.summaryRoute}><b title={j.from}>{stationLabel(j.from)}</b><ArrowRight size={20}/><b title={j.to}>{stationLabel(j.to)}</b></div><p><b>{formatDay(j.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b></p><p><span className={`${s.badge} ${j.status === "cancellation_needed" ? s.badgeAmber : j.status === "booked" ? s.badgeGreen : s.badgePurple}`}>{STATUS[j.status]}</span></p>{j.status === "needs_booking" && <p className={s.help}>Booking opens {formatDay(bookingDay(j))} at {bookingTimeLabel(j)}.</p>}<dl className={s.summaryDetails}>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{j.notes && <p className={s.help}>{j.notes}</p>}{j.attachments?.filter(file => file.type === "application/pdf").map((file, i) => <button key={file.id} className={s.secondary} onClick={() => view(file)}>View ticket{(j.attachments?.length ?? 0) > 1 ? ` ${i + 1}` : ""}</button>)}<footer className={s.formFooter}><button className={s.primary} onClick={edit}>Edit journey</button>{j.status === "cancellation_needed" && <button className={s.secondary} onClick={cancel}>Confirm cancellation</button>}<p className={s.help}>Book or cancel through IRCTC. RailWatch records your plans.</p></footer></div>;
}
