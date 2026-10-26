"use client";

import {ArrowRight,Plus,Repeat2,Link2} from "lucide-react";
import {formatDay,recurrenceLabel,type Planner,type Rule} from "@/lib/travel-planner";
import {groupRoutines,nextRoutineDate} from "@/lib/routine-overview";
import {stationLabel} from "@/lib/journey-display";
import {ActionMenu} from "./action-menu";
import {MobileScreen} from "./mobile-workspace";
import s from "./planner.module.css";
import r from "./routine-overview.module.css";

/** Presents linked directions together while keeping every routine's own controls and schedule. */
export function RoutineOverview({planner,today,mobile=false,edit,toggle,remove}:{planner:Planner;today:string;mobile?:boolean;edit:(rule?:Partial<Rule>)=>void;toggle:(rule:Rule)=>void;remove:(rule:Rule)=>void}){
  const groups=groupRoutines(planner.rules);
  const content=<div className={r.groups}>{groups.map(group=><article className={r.group} key={group.id} aria-label={group.title}><header>{group.rules.length>1?<Link2 size={19}/>:<Repeat2 size={19}/>}<h2>{group.title}</h2>{group.rules.length>1&&<span>Linked directions</span>}</header>{group.rules.map(rule=>{
    const next=nextRoutineDate(rule,today,planner.settings),ended=Boolean(rule.end&&rule.end<today);
    const label=group.rules.length>1&&group.title!=="Linked routines"&&rule.name.startsWith(group.title)?rule.name.slice(group.title.length).replace(/^[\s\-·]+/,"")||rule.name:rule.name;
    return <section className={r.direction} key={rule.id} aria-label={rule.name}><div className={r.route}><strong>{stationLabel(rule.from)}<ArrowRight size={15}/>{stationLabel(rule.to)}</strong>{group.rules.length>1&&<small>{label}</small>}</div><div className={r.schedule}><span>{recurrenceLabel(rule)}</span><small>{rule.paused?"Planning paused":next?`Next scheduled · ${formatDay(next,{day:"numeric",month:"short",...(next.slice(0,4)!==today.slice(0,4)?{year:"numeric"}: {})})}`:ended?"Schedule has ended":"No dates in the current planning range"}</small></div><span className={`${s.badge} ${rule.paused||ended?s.badgeGray:s.badgeGreen}`}>{rule.paused?"Paused":ended?"Ended":"Active"}</span><div className={r.actions}><button className={s.secondary} aria-label={`Edit routine ${rule.name}`} onClick={()=>edit(rule)}>Edit</button><ActionMenu label={`Actions For ${rule.name}`} actions={[{label:rule.paused?"Resume Routine":"Pause Routine",onClick:()=>toggle(rule)},...(!rule.linkedRuleId?[{label:"Create linked return",onClick:()=>edit({name:`${rule.name} · return`,from:rule.to,to:rule.from,linkedRuleId:rule.id,start:rule.start>today?rule.start:today,end:rule.end,intervalWeeks:rule.intervalWeeks,recurrence:rule.recurrence})}]:[]),{label:"Remove Routine",danger:true,onClick:()=>remove(rule)}]}/></div></section>;
  })}</article>)}{!groups.length&&<section className={r.empty}><Repeat2 size={28}/><h2>Make regular travel easier</h2><p>Choose a route and schedule. Add a linked return when you need one.</p><button className={s.primary} onClick={()=>edit()}><Plus size={16}/>New Routine</button></section>}</div>;
  return mobile?<MobileScreen title="Routines" action={<button className={`${s.iconButton} ${r.add}`} aria-label="New Routine" onClick={()=>edit()}><Plus size={21}/></button>}>{content}</MobileScreen>:content;
}
