"use client";
import {useSyncExternalStore, type ReactNode} from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Files, House, LayoutList, MoreHorizontal } from "lucide-react";
import {addDays,bookingDay,formatDay,type Journey,type TicketAttachment} from "@/lib/travel-planner";
import {stationLabel} from "@/lib/journey-display";
import type {DashboardView} from "@/lib/planning-views";
import {STATUS} from "./forms";
import m from "./mobile-workspace.module.css";

/** Observes the phone layout without changing the server-rendered desktop snapshot. */
function subscribe(listener:()=>void){const query=window.matchMedia("(max-width: 768px)");query.addEventListener("change",listener);return()=>query.removeEventListener("change",listener);}
/** Uses a separate phone presentation while retaining the shared account controller. */
export function useMobileWorkspace(){return useSyncExternalStore(subscribe,()=>window.matchMedia("(max-width: 768px)").matches,()=>false);}

/** Keeps primary destinations within thumb reach; other routes live in More. */
export function MobileNavigation({tab,more,openMore,navigate,disabled=false}:{tab:string;more:boolean;disabled?:boolean;openMore:()=>void;navigate:()=>void}){
  return <nav className={m.navigation} aria-label="Mobile navigation" inert={disabled}>{[{id:"home",label:"Today",href:"/",icon:House},{id:"journeys",label:"Journeys",href:"/journeys",icon:LayoutList},{id:"calendar",label:"Calendar",href:"/calendar",icon:CalendarDays}].map(item=><Link key={item.id} href={item.href} aria-current={!more&&tab===item.id?"page":undefined} onClick={navigate}><item.icon size={21}/><span>{item.label}</span></Link>)}<button onClick={openMore} aria-expanded={more} aria-pressed={more||!["home","journeys","calendar"].includes(tab)}><MoreHorizontal size={21}/><span>More</span></button></nav>;
}
/** Presents one compact journey with a date tile and accessible whole-row action. */
export function MobileJourneyRow({journey:j,open,label,accessibleLabel,booking=false}:{journey:Journey;open:()=>void;label?:string;accessibleLabel?:string;booking?:boolean}){
  const date=booking?bookingDay(j):j.date;
  return <button className={m.row} onClick={open} aria-label={`${accessibleLabel??`Open journey ${j.from} to ${j.to}`} on ${formatDay(j.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`}><span className={m.date}><b>{formatDay(date,{day:"2-digit"})}</b><small>{formatDay(date,{month:"short"})}</small></span><span className={m.rowText}><strong>{stationLabel(j.from)} <ArrowRight size={14}/> {stationLabel(j.to)}</strong><small>{label??(booking?`Booking opens · Travel ${formatDay(j.date)}`:`${formatDay(j.date,{weekday:"short"})} · ${formatDay(j.date,{year:"numeric"})}${j.departureConfirmed&&j.departure?` · ${j.departure} IST`:""}`)}</small></span><ArrowRight size={17}/></button>;
}
/** Gives the next trip and pending actions priority over aggregate dashboard panels. */
export function MobileHome({data,open,view,plan,go,skip,keep}:{data:DashboardView;open:(j:Journey)=>void;view:(file:TicketAttachment)=>void;plan:()=>void;go:(status:string)=>void;skip?:(j:Journey)=>void;keep?:(j:Journey)=>void}){
  const next=data.upcoming.find(j=>j.status==="booked")??data.upcoming[0];
  const pdf=next?.attachments?.find(file=>file.type==="application/pdf");
  const details=next?[next.trainNumber,next.trainName||next.train,next.coach&&`Coach ${next.coach}`,next.seat&&`Seat ${next.seat}`].filter(Boolean).join(" · "):"";
  // Plan 3.1 on phones: trips that fall on time off need a decision first.
  const decisions=data.conflicts??[];
  return <div className={m.screen}>{decisions.length>0&&<section className={m.decision} aria-labelledby="mobile-decision"><h2 id="mobile-decision">Needs a decision</h2>{decisions.map(j=><div key={j.id} className={m.decisionRow}><button className={m.decisionTrip} onClick={()=>open(j)}><b>{formatDay(j.date,{weekday:"short",day:"numeric",month:"short"})} · {j.from} → {j.to}</b><small>On your time off</small></button><div className={m.decisionActions}>{skip&&<button onClick={()=>skip(j)}>Skip</button>}{keep&&<button onClick={()=>keep(j)}>Keep</button>}</div></div>)}</section>}<h1>Your next trip</h1>{next?<section aria-label="Next journey" className={`${m.trip} ${!details?m.compactTrip:""}`}><button className={m.tripOpen} onClick={()=>open(next)} aria-label={`Open journey ${next.from} to ${next.to} on ${formatDay(next.date,{day:"numeric",month:"long",year:"numeric"})}`}><span className={m.tripTop}><span className={m.eyebrow}>{formatDay(next.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}{next.departureConfirmed&&next.departure?` · ${next.departure} IST`:""}</span><span className={m.tripStatus}>{next.status==="needs_booking"?"Planned":STATUS[next.status]}</span></span><span className={m.route}><b>{stationLabel(next.from)}</b><ArrowRight size={22}/><b>{stationLabel(next.to)}</b></span>{details&&<span className={m.tripDetails}>{details}</span>}</button>{pdf&&<button className={m.primary} onClick={()=>view(pdf)}><Files size={17}/>View ticket</button>}</section>:<section className={m.empty}><CalendarDays size={26}/><h2>No upcoming trip yet</h2><p>Your next booked journey will appear here.</p></section>}<div className={m.actions}><button onClick={()=>go("needs_booking")}><b>{data.totals.ready}</b><span>Ready to book</span><ArrowRight size={16}/></button><button onClick={()=>go("cancellation_needed")}><b>{data.totals.toCancel}</b><span>To cancel</span><ArrowRight size={16}/></button></div>{data.attention.length>0&&<section><div className={m.sectionHead}><h2>Needs attention</h2><button onClick={()=>go("all")}>View all</button></div><div className={m.list}>{data.attention.slice(0,3).map(j=><MobileJourneyRow key={j.id} journey={j} open={()=>open(j)} label={j.status==="cancellation_needed"?"Cancellation to confirm":"Booking window open"}/>)}</div></section>}<section><h2>Up next</h2><div className={m.list}>{data.bookingSoon.map(j=><MobileJourneyRow key={j.id} journey={j} booking open={()=>open(j)}/>)}{!data.bookingSoon.length&&<p className={m.emptyText}>No upcoming booking openings.</p>}</div></section><button className={m.primary} onClick={plan}>Plan a journey <ArrowRight size={17}/></button></div>;
}
/** Provides reusable phone list sections without imposing the desktop card grid. */
export function MobileScreen({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <div className={m.screen}><div className={m.heading}><h1>{title}</h1>{action}</div>{children}</div>;}
/** Shows a seven-day selector around the chosen date, including exact event counts. */
export function MobileWeek({date,choose,count}:{date:string;choose:(date:string)=>void;count:(date:string)=>number}){return <div className={m.week} aria-label="Calendar week">{Array.from({length:7},(_,i)=>addDays(date,i-3)).map(value=><button key={value} aria-label={`View ${value}, ${count(value)} events`} aria-pressed={value===date} onClick={()=>choose(value)}><small>{formatDay(value,{weekday:"short"})}</small><b>{Number(value.slice(-2))}</b><span aria-hidden="true">{count(value)>0?"•":" "}</span></button>)}</div>;}
