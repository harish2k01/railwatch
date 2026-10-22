"use client";
import {useEffect,useId,useRef,useState} from "react";
import {CalendarRange,ChevronDown} from "lucide-react";
import {addDays,formatDay,isDay,todayIST} from "@/lib/travel-planner";
import s from "./desktop-journeys.module.css";

export type JourneyRange={from:string;to:string;period:"all"|"upcoming"|"past"};
/** Formats a compact travel window, retaining years when the selection crosses a year boundary. */
export function journeyRangeLabel(value:JourneyRange){
  const date=(day:string,year=false)=>formatDay(day,{day:"numeric",month:"short",...(year?{year:"numeric"}: {})});
  const year=todayIST(new Date()).slice(0,4);
  if(value.from&&value.to)return `${date(value.from,value.from.slice(0,4)!==value.to.slice(0,4)||value.from.slice(0,4)!==year)} – ${date(value.to,value.to.slice(0,4)!==year)}`;
  if(value.from)return `From ${date(value.from,value.from.slice(0,4)!==year)}`;
  if(value.to)return `Until ${date(value.to,value.to.slice(0,4)!==year)}`;
  return value.period==="upcoming"?"Upcoming":value.period==="past"?"Past travel":"All dates";
}
/** Applies a deliberate, validated date selection without fetching on each calendar-field edit. */
export function JourneyDateRange({value,today,apply}:{value:JourneyRange;today:string;apply:(range:JourneyRange)=>void}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(value),[error,setError]=useState("");
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),first=useRef<HTMLInputElement>(null),id=useId();
  useEffect(()=>{if(!open)return;first.current?.focus();
    /** Dismisses the nonmodal picker on outside clicks without applying draft dates. */
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    /** Returns focus to the compact trigger when Escape dismisses the picker. */
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.stopPropagation();setOpen(false);trigger.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  const monthStart=today.slice(0,7)+"-01",next=new Date(`${monthStart}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const presets:[string,JourneyRange][]=[["All upcoming",{from:today,to:"",period:"all"}],["Next 7 days",{from:today,to:addDays(today,6),period:"all"}],["This month",{from:monthStart,to:addDays(next.toISOString().slice(0,10),-1),period:"all"}],["Next 30 days",{from:today,to:addDays(today,29),period:"all"}],["All dates",{from:"",to:"",period:"all"}]];
  /** Validates the inclusive travel-date bounds before committing the shared filter. */
  function submit(){if((draft.from&&!isDay(draft.from))||(draft.to&&!isDay(draft.to))){setError("Choose valid travel dates.");return;}if(draft.from&&draft.to&&draft.from>draft.to){setError("End date must be on or after start date.");return;}apply(draft);setOpen(false);trigger.current?.focus();}
  return <div ref={root} className={s.dateRange}><button ref={trigger} className={s.rangeTrigger} type="button" aria-label="Select Travel Date Range" aria-expanded={open} aria-controls={id} title={"Travel dates: "+journeyRangeLabel(value)} onClick={()=>{setDraft(value);setError("");setOpen(!open);}}><CalendarRange size={14}/>{journeyRangeLabel(value)}<ChevronDown size={13}/></button>{open&&<div className={s.rangePopover} id={id} role="dialog" aria-label="Travel Date Range"><h2>Travel date range</h2><div className={s.presets}>{presets.map(([label,range])=><button type="button" key={label} aria-pressed={draft.from===range.from&&draft.to===range.to&&draft.period===range.period} onClick={()=>{setDraft(range);setError("");}}>{label}</button>)}</div><div className={s.dateFields}><label>From date<input ref={first} type="date" value={draft.from} onChange={e=>{setDraft({...draft,from:e.target.value,period:"all"});setError("");}}/></label><label>To date<input type="date" value={draft.to} min={draft.from||undefined} onChange={e=>{setDraft({...draft,to:e.target.value,period:"all"});setError("");}}/></label></div>{error&&<p role="alert" className={s.rangeError}>{error}</p>}<footer><button type="button" onClick={()=>{setOpen(false);trigger.current?.focus();}}>Cancel</button><button type="button" className={s.primary} onClick={submit}>Apply range</button></footer></div>}</div>;
}
