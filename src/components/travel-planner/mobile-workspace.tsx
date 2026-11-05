"use client";
import {useSyncExternalStore, type ReactNode} from "react";
import Link from "next/link";
import { CalendarDays, Files, House, LayoutList, MoreHorizontal, Plus } from "lucide-react";
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
  const steps=[true,["booked","completed","cancellation_needed"].includes(j.status),["booked","completed","cancellation_needed"].includes(j.status),Boolean(j.attachments?.length)];
  const noTicket=j.status==="booked"&&!j.attachments?.length;
  const state=noTicket?"No ticket":j.status==="needs_booking"?"Planned":STATUS[j.status];
  const tone=noTicket||j.status==="cancellation_needed"?"warn":j.status==="needs_booking"?"info":j.status==="booked"?"ok":"muted";
  const sub=label??(booking?`Booking opens · Travel ${formatDay(j.date)}`:j.departureConfirmed&&j.departure?`${formatDay(j.date,{weekday:"short"})} · ${j.departure} IST`:"");
  return <button className={m.row} onClick={open} aria-label={`${accessibleLabel??`Open journey ${j.from} to ${j.to}`} on ${formatDay(j.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`}><span className={m.date}><b>{formatDay(date,{day:"2-digit"})}</b><small>{(booking?formatDay(date,{month:"short"}):formatDay(date,{weekday:"short"})).toUpperCase()}</small></span><span className={m.rowText}><strong>{j.from} → {j.to}</strong>{sub?<small>{sub}</small>:<span className={m.bars} aria-hidden="true">{steps.map((on,k)=><i key={k} data-on={on||undefined}/>)}</span>}</span><span className={m.rowState} data-tone={tone}>{state}</span></button>;
}
/** Today on phones (canvas TodayMobile.dc.html): header, next trip, Do next, this week. */
export function MobileHome({data,open,view,plan,go,skip,keep,today,attach}:{data:DashboardView;open:(j:Journey)=>void;view:(file:TicketAttachment)=>void;plan:()=>void;go:(status:string)=>void;skip?:(j:Journey)=>void;keep?:(j:Journey)=>void;today?:string;attach?:(j:Journey)=>void}){
  const next=data.upcoming.find(j=>j.status==="booked")??data.upcoming[0];
  const pdf=next?.attachments?.find(file=>file.type==="application/pdf");
  const details=next?[next.trainNumber,next.trainName||next.train,next.coach&&`Coach ${next.coach}`,next.seat&&`Seat ${next.seat}`].filter(Boolean).join(" · "):"";
  const decisions=data.conflicts??[];
  const start=today||next?.date||"";
  const all=[...data.upcoming,...data.attention,...data.bookingSoon];
  const doNext=[...data.attention.map(j=>({j,booking:false})),...data.bookingSoon.filter(j=>!data.attention.some(a=>a.id===j.id)).map(j=>({j,booking:true}))].slice(0,4);
  return <div className={m.screen}>
    <header className={m.todayHead}><div><span className={m.dateLine}>{start&&formatDay(start,{weekday:"long",day:"numeric",month:"long"})}</span><h1>Today</h1></div><button type="button" className={m.iconPrimary} aria-label="New journey" onClick={plan}><Plus size={20}/></button></header>
    {decisions.length>0&&<section className={m.decision} aria-labelledby="mobile-decision"><h2 id="mobile-decision">Needs a decision</h2>{decisions.map(j=><div key={j.id} className={m.decisionRow}><button className={m.decisionTrip} onClick={()=>open(j)}><b>{formatDay(j.date,{weekday:"short",day:"numeric",month:"short"})} · {j.from} → {j.to}</b><small>On your time off</small></button><div className={m.decisionActions}>{skip&&<button onClick={()=>skip(j)}>Skip</button>}{keep&&<button onClick={()=>keep(j)}>Keep</button>}</div></div>)}</section>}
    {next?<section aria-label="Next journey" className={m.trip}><button className={m.tripOpen} onClick={()=>open(next)} aria-label={`Open journey ${next.from} to ${next.to} on ${formatDay(next.date,{day:"numeric",month:"long",year:"numeric"})}`}>
      <span className={m.tripTop}><span className={m.eyebrow}>Next trip</span><span className={m.tripStatus} data-status={next.status}>{next.status==="needs_booking"?"Planned":STATUS[next.status]}</span></span>
      <span className={m.route}><span className={m.stop}><b>{next.from}</b><small>{stationLabel(next.from)}</small></span><span className={m.track} aria-hidden="true"/><span className={m.stop} data-end><b>{next.to}</b><small>{stationLabel(next.to)}</small></span></span>
      <span className={m.when}>{formatDay(next.date,{weekday:"short",day:"numeric",month:"short"})} · Onward{next.departureConfirmed&&next.departure?` · ${next.departure} IST`:""}</span>
      {details&&<span className={m.tripDetails}>{details}</span>}</button>
      {pdf?<button className={m.primary} onClick={()=>view(pdf)}><Files size={17}/>View ticket</button>:next.status==="booked"&&<div className={m.nudge}><span>No ticket attached yet</span><button type="button" onClick={()=>attach?attach(next):open(next)}>Attach</button></div>}
    </section>:<section className={m.empty}><CalendarDays size={26}/><h2>No upcoming trip yet</h2><p>Your next booked journey will appear here.</p></section>}
    <section aria-labelledby="mobile-do-next"><div className={m.sectionHead}><h2 id="mobile-do-next">Do next</h2>{doNext.length>0&&<button onClick={()=>go("all")}>View all</button>}</div>
      {doNext.length?<div className={m.list}>{doNext.map(({j,booking})=><MobileJourneyRow key={j.id} journey={j} booking={booking} open={()=>open(j)} label={booking?`Booking opens ${formatDay(bookingDay(j),{weekday:"short",day:"numeric",month:"short"})}`:j.status==="cancellation_needed"?"Cancellation to confirm":"Booking window open"}/>)}</div>:<p className={m.emptyText}>Nothing to do right now.</p>}</section>
    {start&&<section aria-labelledby="mobile-week"><h2 id="mobile-week">This week</h2><div className={m.strip}>{Array.from({length:7},(_,i)=>addDays(start,i)).map(d=>{const n=all.filter(j=>j.date===d).length;return <span key={d} data-today={d===start||undefined}><small>{formatDay(d,{weekday:"short"}).slice(0,1)}</small><b>{Number(d.slice(-2))}</b><i aria-hidden="true" data-on={n>0||undefined}/></span>;})}</div></section>}
  </div>;
}
export function MobileScreen({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <div className={m.screen}><div className={m.heading}><h1>{title}</h1>{action}</div>{children}</div>;}
/** Shows a seven-day selector around the chosen date, including exact event counts. */
export function MobileWeek({date,choose,count}:{date:string;choose:(date:string)=>void;count:(date:string)=>number}){return <div className={m.week} aria-label="Calendar week">{Array.from({length:7},(_,i)=>addDays(date,i-3)).map(value=><button key={value} aria-label={`View ${value}, ${count(value)} events`} aria-pressed={value===date} onClick={()=>choose(value)}><small>{formatDay(value,{weekday:"short"}).toUpperCase()}</small><b>{Number(value.slice(-2))}</b><span aria-hidden="true" data-on={count(value)>0||undefined}/></button>)}</div>;}
/** More on phones (canvas MoreMobile.dc.html): account header, Plan, Settings and Workspace groups, Sign out. */
export function MobileMore({name,admin,missingTickets,openSettings,theme,signOut,close}:{name:string;admin:boolean;missingTickets:number;openSettings:()=>void;theme:{label:string;toggle:()=>void};signOut:()=>void;close:()=>void}){
  const item=(href:string,label:string,value?:ReactNode,last?:boolean)=><Link className={m.moreItem} data-last={last||undefined} href={href} onClick={close}>{label}{value!==undefined&&<span className={m.moreValue}>{value}</span>}</Link>;
  return <div className={m.more}>
    <button type="button" className={m.moreHead} aria-label="User settings" onClick={openSettings}><span className={m.avatar} aria-hidden="true">{(name.trim()[0]??"?").toUpperCase()}</span><span><h1>{name}</h1><small>{admin?"Admin · ":""}Profile and security</small></span></button>
    <nav aria-label="More destinations">
      <h2 className={m.moreGroup}>Plan</h2>
      <div className={m.moreCard}>{item("/time-off","Time off")}{item("/routines","Routines")}{item("/tickets","Tickets",missingTickets?<b className={m.moreWarn}>{missingTickets} missing</b>:undefined,true)}</div>
      <h2 className={m.moreGroup}>Settings</h2>
      <div className={m.moreCard}>{item("/settings#settings-reminders","Reminders")}{item("/settings#settings-channels","Channels")}{item("/settings#settings-offline","Offline tickets")}{item("/settings#settings-data","Data and backup")}<button type="button" className={m.moreItem} data-last onClick={theme.toggle}>{theme.label}</button></div>
      {admin&&<><h2 className={m.moreGroup}>Workspace</h2><div className={m.moreCard}>{item("/settings/workspace","Members and booking rules")}{item("/settings/workspace/health","System health",undefined,true)}</div></>}
    </nav>
    <button type="button" className={m.signOut} onClick={signOut}>Sign out</button>
  </div>;
}
