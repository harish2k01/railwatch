"use client";
import { useCallback,useEffect,useId,useRef,useState } from "react";
import { EmptyState } from "./empty-state";
import { Bell,RefreshCw,X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import type { CurrentNotifications } from "@/lib/current-notifications";
import s from "./notification-bell.module.css";
import shared from "./planner.module.css";

/** Shows current reminders in a dismissible bell, without a history destination. */
export function NotificationBell({openJourney}:{openJourney:(id:string)=>void}){
  const panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const panelId=useId();
  const sequence=useRef(0),clearing=useRef(false);
  const [data,setData]=useState<CurrentNotifications>({items:[],count:0}),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[open,setOpen]=useState(false);
  const load=useCallback(async()=>{if(clearing.current)return;const request=++sequence.current;setLoading(true);try{const result=await apiRequest<CurrentNotifications>("/api/railwatch/notifications");if(request===sequence.current){setData(result);setError("");}}catch{if(request===sequence.current)setError("Could not load notifications. Try again.");}finally{if(request===sequence.current)setLoading(false);}},[]);
  useEffect(()=>{const update=()=>{if(!document.hidden)void load();};const initial=setTimeout(update,0),timer=setInterval(update,60000);document.addEventListener("visibilitychange",update);return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener("visibilitychange",update);};},[load]);
  /** Clears content on the server so refreshes and other devices cannot restore it. */
  async function clear(id?:string){clearing.current=true;sequence.current++;setLoading(false);setBusy(true);setError("");try{setData(await apiRequest<CurrentNotifications>("/api/railwatch/notifications",{method:"POST",body:JSON.stringify({action:"clear",...(id?{id}:{})})}));}catch{setError("Could not clear notifications. Try again.");}finally{clearing.current=false;setBusy(false);}}
  return <div className={s.root}>
    <button ref={trigger} className={`${shared.iconButton} ${s.trigger}`} aria-label={data.count?`Notifications, ${data.count} current`:"Notifications"} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={()=>{panel.current?.togglePopover();void load();}}><Bell size={19}/>{data.count>0&&<span className={s.dot} aria-hidden="true"/>}</button>
    <div ref={panel} id={panelId} popover="auto" role="dialog" aria-label="Notifications" className={s.panel} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();panel.current?.hidePopover();trigger.current?.focus();}}} onToggle={event=>{const visible=(event.nativeEvent as ToggleEvent).newState==="open";setOpen(visible);if(visible)panel.current?.querySelector<HTMLButtonElement>("button")?.focus();}}>
      <header><h2>Notifications</h2><button className={shared.iconButton} aria-label="Close notifications" onClick={()=>{panel.current?.hidePopover();trigger.current?.focus();}}><X size={18}/></button></header>
      {error&&<div role="alert" className={s.error}><p>{error}</p><button className={shared.reloadButton} aria-label="Reload notifications" onClick={()=>void load()}><RefreshCw size={18}/></button></div>}
      {data.count>0&&<div className={s.actions}><span>{data.count} current</span><button disabled={busy} onClick={()=>void clear()}>Clear all</button></div>}
      <div className={s.items}>{data.items.map(item=><article key={item.id}><button className={s.message} onClick={()=>{panel.current?.hidePopover();openJourney(item.journeyId);}}>{item.message}</button><button className={shared.iconButton} disabled={busy} aria-label={`Clear notification: ${item.message}`} onClick={()=>void clear(item.id)}><X size={16}/></button></article>)}</div>
      {!error&&!data.count&&(loading?<p className={s.empty} role="status">Checking notifications…</p>:<EmptyState compact art="bell" title="You’re All Caught Up">Booking and cancellation reminders show up here when they’re due.</EmptyState>)}
      {data.count>data.items.length&&<p className={s.empty}>Showing the latest {data.items.length}. Clear these or clear all.</p>}
    </div>
  </div>;
}
