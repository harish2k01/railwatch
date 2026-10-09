"use client";
import { useEffect,useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { ActionMenu } from "./action-menu";
import { useViewMotion } from "./view-motion";
import s from "./planner.module.css";

type Item={id:string;kind:string;state:string;dueAt:string;sentAt:string|null;readAt:string|null;attempts:number;lastError:string|null;message:string;journeyId:string|null;canSnooze:boolean;canRead:boolean;pausedUntil:string|null};
type History={items:Item[];nextCursor:string|null;pausedJourneys:{journeyId:string;from:string;to:string;date:string;until:string}[]};
const CHANNELS:Record<string,string>={IN_APP:"In-app",EMAIL:"Email",TELEGRAM:"Telegram",WHATSAPP:"WhatsApp",PUSH:"Device notification"};
const STATES:Record<string,string>={SENT:"Sent",FAILED:"Delivery failed",MISSED:"Missed",SUPPRESSED:"Already in your inbox",CANCELLED:"No longer needed",PENDING:"Scheduled",SENDING:"Sending"};
/** Formats reminder timestamps explicitly in the account's IST scheduling timezone. */
function timestamp(value:string){return new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))+" IST";}

/** Shows paginated delivery outcomes and account-owned read, snooze, and resume actions. */
export function NotificationHistory({open,notice,journeyId}:{journeyId?:string;open:(id:string)=>void;notice:(message:string)=>void}){
  const [history,setHistory]=useState<History & {cursor:string}>(),[error,setError]=useState(""),[busy,setBusy]=useState(false),[cursor,setCursor]=useState(""),[previous,setPrevious]=useState<string[]>([]),[refresh,setRefresh]=useState(0);
  const motion=useViewMotion<HTMLElement>(cursor+":"+refresh);
  useEffect(()=>{let live=true;void apiRequest<History>("/api/railwatch/notifications?"+new URLSearchParams({...cursor?{cursor}:{},...journeyId?{journeyId}:{}}),{cache:"no-store"}).then(data=>{if(live){setHistory({...data,cursor});setError("");}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[cursor,refresh,journeyId]);
  /** Saves a secondary reminder action, then refreshes this page and its feedback. */
  async function action(body:object,message:string){setBusy(true);try{await apiRequest("/api/railwatch/notifications",{method:"POST",body:JSON.stringify(body)});setRefresh(n=>n+1);notice(message);}catch(e){setError(e instanceof Error?e.message:"Could not update reminders.");}finally{setBusy(false);}}
  const page=history?.cursor===cursor?history:undefined;
  return <section ref={motion} className={s.notificationHistory} aria-label="Notification History">
    <div className={s.cardActions}><button className={s.secondary} disabled={busy} onClick={()=>{setCursor("");setPrevious([]);setRefresh(n=>n+1);}}>Refresh</button></div>
    {page?.pausedJourneys.map(j=><article key={j.journeyId} className={s.settingsCard}><strong>{j.from} → {j.to}</strong><p className={s.help}>Reminders paused until {timestamp(j.until)}.</p><div className={s.cardActions}><button className={s.textButton} onClick={()=>open(j.journeyId)}>View Journey</button><button className={s.secondary} disabled={busy} onClick={()=>void action({action:"resume",journeyId:j.journeyId},"Journey reminders resumed.")}>Resume Reminders</button></div></article>)}
    {error&&<p role="alert">{error}</p>}{!page&&!error&&<p role="status">Loading notifications…</p>}
    {page?.items.length===0&&<section className={s.emptyPage}><h2>{page.nextCursor?"No matching notifications on this page":"No notification history yet"}</h2><p>{page.nextCursor?"No matching reminders on this page. Choose Next to check older activity.":"Booking and cancellation reminders will appear here."}</p></section>}
    {page?.items.map(item=><article key={item.id} className={s.settingsCard}>
      <header className={s.cardActions}><strong>{CHANNELS[item.kind]??item.kind} · {STATES[item.state]??item.state}</strong>{(item.canRead||item.canSnooze||item.pausedUntil)&&<ActionMenu label="Reminder Actions" disabled={busy} actions={[
        ...(item.canRead?[{label:"Mark As Read",onClick:()=>void action({action:"read",id:item.id},"Reminder marked as read.")}]:[]),
        ...(item.canSnooze?[...[30,60,1440].map(minutes=>({label:minutes===1440?"Snooze 1 Day":`Snooze ${minutes} Minutes`,onClick:()=>void action({action:"snooze",journeyId:item.journeyId,minutes},"Journey reminders snoozed.")}))]:[]),
        ...(item.pausedUntil?[{label:"Resume Reminders",onClick:()=>void action({action:"resume",journeyId:item.journeyId},"Journey reminders resumed.")}]:[]),
      ]}/>}</header><p>{item.message}</p><small>{item.sentAt?"Sent "+timestamp(item.sentAt):"Scheduled "+timestamp(item.dueAt)}</small>
      <p className={s.help}>Scheduled {timestamp(item.dueAt)} · {item.attempts} delivery attempt{item.attempts===1?"":"s"}</p>
      {item.pausedUntil&&<p className={s.help}>Journey reminders paused until {timestamp(item.pausedUntil)}.</p>}
      {item.lastError&&<p className={s.help}>{item.lastError}</p>}
      <div className={s.cardActions}>{item.journeyId&&<button className={s.textButton} onClick={()=>open(item.journeyId!)}>View Journey</button>}{item.readAt&&<small>Read</small>}</div>
    </article>)}
    {page&&<nav className={s.cardActions} aria-label="Notification history pages"><button className={s.secondary} disabled={!previous.length||busy||!page} onClick={()=>{setCursor(previous.at(-1)??"");setPrevious(p=>p.slice(0,-1));}}>Previous</button><button className={s.secondary} disabled={!page.nextCursor||busy} onClick={()=>{setPrevious(p=>[...p,cursor]);setCursor(page.nextCursor!);}}>Next</button></nav>}
  </section>;
}
