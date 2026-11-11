"use client";
import {createContext,useContext,useSyncExternalStore, type ReactNode} from "react";
import { useStationName } from "./journey-detail";
import Link from "next/link";
import { CalendarDays, CircleUserRound, Clock3, Files, House, LayoutList, Plus, Ticket, TriangleAlert, UmbrellaOff } from "lucide-react";
import {addDays,bookingDay,formatDay,todayIST,tripTiming,type Journey,type TicketAttachment} from "@/lib/travel-planner";
import {berthLabel,stationLabel} from "@/lib/journey-display";
import type {DashboardView} from "@/lib/planning-views";
import {STATUS} from "./forms";
import m from "./mobile-workspace.module.css";

/** Observes the phone layout without changing the server-rendered desktop snapshot. */
function subscribe(listener:()=>void){const query=window.matchMedia("(max-width: 768px)");query.addEventListener("change",listener);return()=>query.removeEventListener("change",listener);}
/** Uses a separate phone presentation while retaining the shared account controller. */
export function useMobileWorkspace(){return useSyncExternalStore(subscribe,()=>window.matchMedia("(max-width: 768px)").matches,()=>false);}

/** Header actions every phone screen shows beside its large title (the notification bell), set by the planner. */
export const MobileHeaderActions=createContext<ReactNode>(null);

/**
 * Floating tab bar (canvas NativeToday): Today, Journeys, a centre New journey button, Tickets and You (account,
 * settings and the other destinations). Kept within thumb reach and off the screen edges.
 */
export function MobileNavigation({tab,more,openMore,navigate,newJourney,disabled=false}:{tab:string;more:boolean;disabled?:boolean;openMore:()=>void;navigate:()=>void;newJourney:()=>void}){
  const link=(id:string,label:string,href:string,Icon:typeof House)=><Link key={id} href={href} aria-current={!more&&tab===id?"page":undefined} onClick={navigate}><Icon size={22} aria-hidden="true"/><span>{label}</span></Link>;
  return <nav className={m.tabBar} aria-label="Mobile navigation" inert={disabled}>
    {link("home","Today","/",House)}{link("journeys","Journeys","/journeys",LayoutList)}
    <button type="button" className={m.tabNew} aria-label="New journey" onClick={newJourney}><Plus size={24} strokeWidth={2.6} aria-hidden="true"/></button>
    {link("vault","Tickets","/tickets",Ticket)}
    <button type="button" onClick={openMore} aria-expanded={more} aria-pressed={more||!["home","journeys","vault"].includes(tab)}><CircleUserRound size={22} aria-hidden="true"/><span>You</span></button>
  </nav>;
}
/** Presents one compact journey with a date tile and accessible whole-row action. */
/** Train and seat for a booked trip ("12632 · S7 / 14 Upper"), else its departure time. */
function journeyLine(j:Journey){
  const seat=[j.coach,j.seat].filter(Boolean).join(" / ")+(j.berth?` ${berthLabel(j.berth)}`:"");
  const ticket=[j.trainNumber,seat.trim()].filter(Boolean).join(" · ");
  if(ticket&&j.status!=="needs_booking")return ticket;
  return j.departureConfirmed&&j.departure?`${formatDay(j.date,{weekday:"short"})} · ${j.departure} IST`:"";
}
/**
 * One journey row (canvas JourneysMobile): date, route, four progress bars (planned → booking opened → booked →
 * ticket attached) with a detail line beside them, and the state on the right. Every row shows the bars.
 */
export function MobileJourneyRow({journey:j,open,label,accessibleLabel,booking=false}:{journey:Journey;open:()=>void;label?:string;accessibleLabel?:string;booking?:boolean}){
  const date=booking?bookingDay(j):j.date, today=todayIST();
  const booked=["booked","completed","cancellation_needed"].includes(j.status);
  const steps=[true,booked||bookingDay(j)<=today,booked,Boolean(j.attachments?.some(a=>a.type==="application/pdf"))];
  const noTicket=j.status==="booked"&&!j.attachments?.length;
  const state=noTicket?"No ticket":j.status==="needs_booking"?"Planned":STATUS[j.status];
  const tone=noTicket||j.status==="cancellation_needed"?"warn":j.status==="needs_booking"?"info":j.status==="booked"?"ok":"muted";
  const sub=label===state?"":label??(booking?`Travel ${formatDay(j.date,{weekday:"short",day:"numeric",month:"short"})}`:journeyLine(j));
  const ended=["cancelled","skipped"].includes(j.status);
  return <button className={m.row} onClick={open} aria-label={`${accessibleLabel??`Open journey ${j.from} to ${j.to}`} on ${formatDay(j.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`}><span className={m.date}><b>{formatDay(date,{day:"2-digit"})}</b><small>{(booking?formatDay(date,{month:"short"}):formatDay(date,{weekday:"short"})).toUpperCase()}</small></span><span className={m.rowText}><strong>{stationLabel(j.from)} → {stationLabel(j.to)}</strong><span className={m.rowMeta}>{!ended&&<span className={m.bars} aria-hidden="true">{steps.map((on,k)=><i key={k} data-on={on||undefined}/>)}</span>}{sub&&<small>{sub}</small>}</span></span><span className={m.rowState} data-tone={tone}>{state}</span></button>;
}
/** A list with a month heading whenever the month changes (lists span months; "26 Thu" then "01 Tue" needs it). */
export function MonthList<T>({items,date,render,className}:{items:T[];date:(item:T)=>string;render:(item:T)=>ReactNode;className?:string}){
  const groups:{month:string;items:T[]}[]=[];
  for(const item of items){const month=date(item).slice(0,7);const last=groups[groups.length-1];if(last?.month===month)last.items.push(item);else groups.push({month,items:[item]});}
  return <>{groups.map(g=><section key={g.month} aria-label={formatDay(`${g.month}-01`,{month:"long",year:"numeric"})}><h3 className={m.monthHead}>{formatDay(`${g.month}-01`,{month:"long",...(g.month.slice(0,4)!==todayIST().slice(0,4)?{year:"numeric"}:{})})}</h3><div className={className??m.list}>{g.items.map(render)}</div></section>)}</>;
}
/** Station code with its directory name underneath (the name, not the code twice). */
function MobileStop({code,end=false}:{code:string;end?:boolean}){const name=useStationName(stationLabel(code));return <span className={m.stop} data-end={end||undefined}><b>{stationLabel(code)}</b>{name&&<small>{name}</small>}</span>;}
/** One horizontally scrolling "Do next" card (canvas NativeToday). */
function DoCard({tone,icon,title,lines,open,children}:{tone:"open"|"warn"|"off";icon:ReactNode;title:string;lines:string[];open:()=>void;children?:ReactNode}){
  return <div className={m.doCard} data-tone={tone}><button type="button" className={m.doOpen} onClick={open}>{icon}<span><b>{title}</b>{lines.map(l=><small key={l}>{l}</small>)}</span></button>{children}</div>;
}
/** The next trip as a boarding pass: route, times, then train, coach, berth and class below a perforation. */
function BoardingPass({j,open,view}:{j:Journey;open:()=>void;view?:()=>void}){
  const days=Math.round((Date.parse(j.date)-Date.parse(todayIST()))/86_400_000);
  const when=days===0?"today":days===1?"tomorrow":`in ${days} days`;
  const status=j.status==="needs_booking"?"Planned":j.ticketStatus==="WL"?"Waitlisted":j.ticketStatus==="RAC"?"RAC":j.status==="booked"?"Confirmed":STATUS[j.status];
  const timing=tripTiming(j), arrive=timing?.split(" → ")[1]?.split(" · ")[0];
  const facts:[string,string|undefined][]=[["Train",j.trainNumber||undefined],["Coach",j.coach],["Berth",[j.seat,berthLabel(j.berth)].filter(Boolean).join(" ")||undefined],["Class",j.travelClass||undefined]];
  const shown=facts.filter((f):f is [string,string]=>Boolean(f[1]));
  return <section className={m.pass} data-booked={j.status==="booked"||undefined} aria-label="Next trip">
    <button type="button" className={m.passMain} onClick={open} aria-label={`Next trip ${j.from} to ${j.to}, ${formatDay(j.date,{weekday:"long",day:"numeric",month:"long"})}, ${status}`}>
      <span className={m.passTop}><span>Next trip · {when}</span><i>{status}</i></span>
      <span className={m.passRoute}><MobileStop code={j.from}/><span className={m.passLine} aria-hidden="true">{timing?.split(" · ")[1]??""}</span><MobileStop code={j.to} end/></span>
      <span className={m.passTimes}><span>{formatDay(j.date,{weekday:"short",day:"numeric",month:"short"})}{j.departureConfirmed&&j.departure?` · ${j.departure}`:""}</span>{arrive&&<span>{arrive}</span>}</span>
    </button>
    {shown.length>0&&<><span className={m.perforation} aria-hidden="true"/><dl className={m.passFacts}>{shown.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></>}
    {view&&<button type="button" className={m.passTicket} onClick={view}><Files size={17} aria-hidden="true"/>Show ticket</button>}
  </section>;
}
/** Today on phones (canvas NativeToday): large title, boarding-pass next trip, swipeable Do next cards, this week. */
export function MobileHome({data,open,view,plan,go,skip,keep,today,attach}:{data:DashboardView;open:(j:Journey)=>void;view:(file:TicketAttachment)=>void;plan:()=>void;go:(status:string)=>void;skip?:(j:Journey)=>void;keep?:(j:Journey)=>void;today?:string;attach?:(j:Journey)=>void}){
  const bell=useContext(MobileHeaderActions);
  const next=data.upcoming.find(j=>j.status==="booked")??data.upcoming[0];
  const pdf=next?.attachments?.find(file=>file.type==="application/pdf");
  const start=today||next?.date||"";
  const decisions=data.conflicts??[];
  const short=(d:string)=>formatDay(d,{day:"numeric",month:"short"});
  const cards:ReactNode[]=[
    ...decisions.map(j=><DoCard key={"d"+j.id} tone="off" icon={<UmbrellaOff size={24} aria-hidden="true"/>} title="On your time off" lines={[`${stationLabel(j.from)} → ${stationLabel(j.to)} · ${short(j.date)}`,"Skip or keep?"]} open={()=>open(j)}>{(skip||keep)&&<span className={m.doActions}>{skip&&<button type="button" onClick={()=>skip(j)}>Skip</button>}{keep&&<button type="button" onClick={()=>keep(j)}>Keep</button>}</span>}</DoCard>),
    ...(next&&next.status==="booked"&&!pdf?[<DoCard key="t" tone="warn" icon={<Ticket size={24} aria-hidden="true"/>} title="Attach ticket" lines={[`${stationLabel(next.from)} → ${stationLabel(next.to)} · ${short(next.date)}`,"So it’s here offline"]} open={()=>attach?attach(next):open(next)}/>]:[]),
    ...data.attention.map(j=><DoCard key={"a"+j.id} tone="warn" icon={<TriangleAlert size={24} aria-hidden="true"/>} title={j.status==="cancellation_needed"?"Confirm cancellation":"Book now"} lines={[`${stationLabel(j.from)} → ${stationLabel(j.to)} · ${short(j.date)}`,j.status==="cancellation_needed"?"Cancelled on IRCTC?":"Booking window is open"]} open={()=>open(j)}/>),
    ...data.bookingSoon.filter(j=>!data.attention.some(a=>a.id===j.id)).map(j=><DoCard key={"b"+j.id} tone="open" icon={<Clock3 size={24} aria-hidden="true"/>} title="Booking opens" lines={[formatDay(bookingDay(j),{weekday:"short",day:"numeric",month:"short"}),`${stationLabel(j.from)} → ${stationLabel(j.to)} · ${short(j.date)}`]} open={()=>open(j)}/>),
  ].slice(0,6);
  const week=start?data.upcoming.filter(j=>j.date>=start&&j.date<=addDays(start,6)&&j.id!==next?.id).slice(0,4):[];
  return <div className={m.screen}>
    <header className={m.largeTitle}><div><span className={m.dateLine}>{start&&formatDay(start,{weekday:"long",day:"numeric",month:"long"})}</span><h1>Today</h1></div><div className={m.titleActions}>{bell}</div></header>
    {next?<BoardingPass j={next} open={()=>open(next)} view={pdf?()=>view(pdf):undefined}/>:<section className={m.empty}><CalendarDays size={26}/><h2>No upcoming trip yet</h2><p>Your next booked journey will appear here.</p><button type="button" className={m.primary} onClick={plan}><Plus size={17}/>Plan a trip</button></section>}
    <section aria-labelledby="mobile-do-next"><div className={m.sectionHead}><h2 id="mobile-do-next">Do next</h2>{cards.length>0&&<button onClick={()=>go("all")}>See all</button>}</div>
      {cards.length?<div className={m.doRail}>{cards}</div>:<p className={m.emptyText}>Nothing to do right now.</p>}</section>
    {week.length>0&&<section aria-labelledby="mobile-week"><h2 id="mobile-week">This week</h2><div className={m.list}>{week.map(j=><MobileJourneyRow key={j.id} journey={j} open={()=>open(j)}/>)}</div></section>}
  </div>;
}
export function MobileScreen({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){const bell=useContext(MobileHeaderActions);return <div className={m.screen}><div className={m.largeTitle}><h1>{title}</h1><div className={m.titleActions}>{action}{bell}</div></div>{children}</div>;}
/** Shows a seven-day selector around the chosen date, including exact event counts. */
export function MobileWeek({date,choose,count}:{date:string;choose:(date:string)=>void;count:(date:string)=>number}){return <div className={m.week} aria-label="Calendar week">{Array.from({length:7},(_,i)=>addDays(date,i-3)).map(value=><button key={value} aria-label={`View ${value}, ${count(value)} events`} aria-pressed={value===date} onClick={()=>choose(value)}><small>{formatDay(value,{weekday:"short"}).toUpperCase()}</small><b>{Number(value.slice(-2))}</b><span aria-hidden="true" data-on={count(value)>0||undefined}/></button>)}</div>;}
/** More on phones (canvas MoreMobile.dc.html): account header, Plan, Settings and Workspace groups, Sign out. */
export function MobileMore({name,admin,missingTickets,hints={},openSettings,theme,signOut,close}:{name:string;admin:boolean;missingTickets:number;hints?:{timeOff?:string;routines?:string;reminders?:string};openSettings:()=>void;theme:{label:string;toggle:()=>void};signOut:()=>void;close:()=>void}){
  const bell=useContext(MobileHeaderActions);
  const item=(href:string,label:string,value?:ReactNode,last?:boolean)=><Link className={m.moreItem} data-last={last||undefined} href={href} onClick={close}>{label}{value!==undefined&&<span className={m.moreValue}>{value}</span>}</Link>;
  return <div className={m.more}>
    <div className={m.moreTop}><button type="button" className={m.moreHead} aria-label="User settings" onClick={openSettings}><span className={m.avatar} aria-hidden="true">{(name.trim()[0]??"?").toUpperCase()}</span><span><h1>{name}</h1><small>{admin?"Admin · ":""}Profile and security</small></span></button><div className={m.titleActions}>{bell}</div></div>
    <nav aria-label="More destinations">
      <h2 className={m.moreGroup}>Plan</h2>
      <div className={m.moreCard}>{item("/calendar","Calendar")}{item("/time-off","Time off",hints.timeOff)}{item("/routines","Routines",hints.routines)}{item("/tickets","Tickets",missingTickets?<b className={m.moreWarn}>{missingTickets} missing</b>:undefined)}{item("/spend","Spend",undefined,true)}</div>
      <h2 className={m.moreGroup}>Settings</h2>
      <div className={m.moreCard}>{item("/settings#settings-reminders","Reminders",hints.reminders)}{item("/settings#settings-trips","Trips & days off")}{item("/settings#settings-connections","Connections")}{item("/settings#settings-account","Account")}{item("/settings#settings-devices","Devices & data")}<button type="button" className={m.moreItem} data-last onClick={theme.toggle}>{theme.label}</button></div>
      {admin&&<><h2 className={m.moreGroup}>Workspace</h2><div className={m.moreCard}>{item("/settings/workspace","Members and booking rules")}{item("/settings/workspace/health","System health",undefined,true)}</div></>}
    </nav>
    <button type="button" className={m.signOut} onClick={signOut}>Sign out</button>
  </div>;
}
