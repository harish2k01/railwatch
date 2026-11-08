"use client";
import { useEffect, useState } from "react";
import { formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import { apiRequest } from "@/lib/client-api";
import { Spinner } from "./loader";
import { extractTicketFile, getTicketFile } from "@/lib/ticket-files";
import { fareAddsUp } from "@/lib/ticket-fare";

type SpendJourney = Journey & { pdf?: { id: string; name: string }[] };
import s from "./spend.module.css";

type Period = "month" | "six" | "year";
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const code = (station: string) => station.match(/\(([A-Z]{2,5})\)/)?.[1] ?? station;

/**
 * Spend (canvas Spend.dc.html): totals, spend by month and where it goes, from the fares read off attached
 * tickets (ERS PDF or IRCTC email). Trips without a fare are counted separately so the totals stay honest.
 */
export function SpendView({ today, attachTickets }: { planner?: Planner; today: string; attachTickets?: () => void }) {
  const [period, setPeriod] = useState<Period>("six");
  const [all, setAll] = useState<SpendJourney[] | undefined>();
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { let live = true; apiRequest<{ journeys: SpendJourney[] }>("/api/railwatch/spend", { cache: "no-store" }).then(async v => {
      if (!live) return; setAll(v.journeys);
      // Trips attached before fares (or arrival times) were saved, or whose saved fare doesn't add up (an older misread): read the stored PDF on this device and save just those.
      const todo = v.journeys.filter(j => j.pdf?.length && (!j.fare?.total || (j.fare.ticket !== undefined && !fareAddsUp(j.fare)) || (!j.arrival && j.date >= today)));
      const fares: { id: string; fare?: NonNullable<Journey["fare"]>; arrival?: string; arrivalDate?: string }[] = [];
      for (const [i, j] of todo.entries()) {
        if (!live) return; setReading(`Reading fares from attached tickets… ${i + 1} of ${todo.length}`);
        for (const pdf of j.pdf!) { try { const blob = await getTicketFile(pdf.id); if (!blob) continue; const d = (await extractTicketFile(new File([blob], pdf.name, { type: "application/pdf" }))).details; const fare = d.fare?.total && (!j.fare?.total || fareAddsUp(d.fare)) ? d.fare : undefined; if (fare || d.arrival) { fares.push({ id: j.id, fare, arrival: d.arrival, arrivalDate: d.arrivalDate }); break; } } catch { /* leave this trip without a fare */ } }
      }
      if (live) setReading("");
      if (fares.length && live) { await apiRequest("/api/railwatch/spend", { method: "POST", body: JSON.stringify({ fares }) }).catch(() => undefined); const byId = new Map(fares.filter(f => f.fare).map(f => [f.id, f.fare])); if (live) setAll(list => list?.map(j => byId.get(j.id) ? { ...j, fare: byId.get(j.id) } : j)); }
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not load spend."); }); return () => { live = false; }; }, [today]);
  const months = period === "month" ? 1 : period === "six" ? 6 : 12;
  const start = (() => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (months - 1)); return d.toISOString().slice(0, 10); })();
  const paid = (all ?? []).filter(j => ["booked", "completed", "cancelled", "cancellation_needed"].includes(j.status) && j.date >= start);
  const ahead = Math.min(3, Math.max(0, ...paid.filter(j => j.fare?.total).map(j => (Number(j.date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(j.date.slice(5, 7)) - Number(today.slice(5, 7)))));
  const withFare = paid.filter((j): j is Journey & { fare: NonNullable<Journey["fare"]> } => Boolean(j.fare?.total));
  const missing = (all ?? []).filter(j => j.status === "booked" && j.date >= today && !j.pdf?.length).length;
  const total = withFare.reduce((a, j) => a + j.fare.total, 0), refunded = withFare.reduce((a, j) => a + (j.fare.refund ?? 0), 0);
  const keys = Array.from({ length: months + ahead }, (_, i) => { const d = new Date(start + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const byMonth = keys.map(k => ({ key: k, label: formatDay(k + "-01", { month: "short" }), amount: withFare.filter(j => j.date.startsWith(k)).reduce((a, j) => a + j.fare.total, 0) }));
  const max = Math.max(1, ...byMonth.map(m => m.amount));
  const thisMonth = byMonth[months - 1]?.amount ?? 0, lastMonth = byMonth[months - 2]?.amount;
  const part = (k: "ticket" | "convenience" | "wallet" | "insurance") => withFare.reduce((a, j) => a + (j.fare[k] ?? 0), 0);
  const parts = [{ label: "Ticket fare", amount: part("ticket"), tone: "brand" }, { label: "IRCTC convenience fee", amount: part("convenience"), tone: "open" }, { label: "eWallet / gateway charges", amount: part("wallet"), tone: "warn" }, { label: "Travel insurance", amount: part("insurance"), tone: "ok" }];
  const recent = [...withFare].filter(j => j.date.startsWith(today.slice(0, 7))).sort((a, b) => a.date.localeCompare(b.date));
  const wallet = part("wallet"), walletTickets = withFare.filter(j => j.fare.wallet).length;

  if (error) return <p className={s.note}>{error}</p>;
  if (!all) return <div className={s.page}><p className={s.muted}><Spinner /> Loading spend…</p></div>;
  return <div className={s.page}>
    <div className={s.periods} role="group" aria-label="Period">{([["month", "Month"], ["six", "6 months"], ["year", "Year"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>
    <div className={s.stats}>
      <div className={s.stat}><span>Spent {period === "month" ? "this month" : `in ${months} months`}{ahead ? " + booked ahead" : ""}</span><b>{inr(total)}</b><small>{withFare.length} {withFare.length === 1 ? "ticket" : "tickets"}</small></div>
      <div className={s.stat}><span>This month</span><b>{inr(thisMonth)}</b><small>{lastMonth === undefined ? "" : lastMonth ? `${thisMonth <= lastMonth ? "↓" : "↑"} ${Math.abs(Math.round(((thisMonth - lastMonth) / lastMonth) * 100))}% vs last month` : "Nothing last month"}</small></div>
      <div className={s.stat}><span>Average per trip</span><b>{withFare.length ? inr(Math.round(total / withFare.length)) : "—"}</b><small>From attached tickets</small></div>
      <div className={s.stat}><span>Refunded</span><b>{inr(refunded)}</b><small>Cancelled tickets</small></div>
    </div>
    {reading && <p className={s.muted}><Spinner /> {reading}</p>}
    {missing > 0 && !reading && <p className={s.note}>{missing} booked {missing === 1 ? "trip has" : "trips have"} no ticket attached. Attach their IRCTC PDFs to include their fares.{attachTickets && <> <button type="button" onClick={attachTickets}>Attach tickets</button></>}</p>}
    <div className={s.grid}>
      <section className={s.card} aria-labelledby="spend-months"><h2 id="spend-months">By month</h2>
        <div className={s.bars} role="img" aria-label={byMonth.map(m => `${m.label} ${inr(m.amount)}`).join(", ")}>{byMonth.map(m => <div key={m.key} className={s.bar}><span>{m.amount ? inr(Math.round(m.amount)) : ""}</span><i style={{ height: `${Math.round((m.amount / max) * 180)}px` }} /><small>{m.label}</small></div>)}</div>
      </section>
      <section className={s.card} aria-labelledby="spend-parts"><h2 id="spend-parts">Where it goes</h2>
        {parts.map(p => <div key={p.label} className={s.part}><div><span>{p.label}</span><b>{inr(Math.round(p.amount * 100) / 100)}</b></div><i><em data-tone={p.tone} style={{ width: `${total ? Math.max(1, Math.round((p.amount / total) * 100)) : 0}%` }} /></i></div>)}
        {walletTickets > 0 && <p className={s.tip}>Paying by UPI instead of the IRCTC eWallet would have saved {inr(Math.round(wallet * 100) / 100)} on {walletTickets} {walletTickets === 1 ? "ticket" : "tickets"}.</p>}
      </section>
    </div>
    <section className={s.card} aria-labelledby="spend-recent"><h2 id="spend-recent">{formatDay(today.slice(0, 7) + "-01", { month: "long" })} · {recent.length} {recent.length === 1 ? "ticket" : "tickets"} · {inr(thisMonth)}</h2>
      {recent.length ? recent.map(j => <div key={j.id} className={s.row}><span>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })}</span><b>{code(j.from)} → {code(j.to)}</b><span>{[j.travelClass, j.bookingType === "tatkal" ? "Tatkal" : "GN"].filter(Boolean).join(" · ")}</span><b className={s.amount}>{inr(j.fare.total)}</b></div>) : <p className={s.muted}>No tickets with a fare this month.</p>}
    </section>
  </div>;
}
