import {generateJourneys,todayIST,type Planner,type Rule} from "./travel-planner";

export type RoutineGroup={id:string;title:string;rules:Rule[]};
export type RoutineChangePreview={revision:number;added:number;removed:number;updated:number;unchanged:number;protected:number;firstDates:string[]};

/** Groups reciprocal links once without combining independent or stale-linked routines. */
export function groupRoutines(rules:Rule[]):RoutineGroup[]{
  const byId=new Map(rules.map(rule=>[rule.id,rule])),seen=new Set<string>();
  return rules.flatMap(rule=>{
    if(seen.has(rule.id))return [];
    seen.add(rule.id);
    const linked=byId.get(rule.linkedRuleId??"");
    if(!linked||linked.id===rule.id||linked.linkedRuleId!==rule.id||seen.has(linked.id))return [{id:rule.id,title:rule.name,rules:[rule]}];
    seen.add(linked.id);
    let index=0;while(index<Math.min(rule.name.length,linked.name.length)&&rule.name[index]===linked.name[index])index++;
    const prefix=rule.name===linked.name?rule.name:rule.name.slice(0,index).replace(/[^\s\-–—·]*$/,"").replace(/[\s\-–—·]+$/,"").trim();
    const directions=[rule,linked].sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
    return [{id:directions[0].id,title:prefix.length>=3?prefix:"Linked routines",rules:directions}];
  }).sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}

/** Returns the next recurrence date in the configured horizon, not a confirmed departure. */
export function nextRoutineDate(rule:Rule,today:string,settings:Planner["settings"]){
  return generateJourneys(rule,today,settings)[0]?.date??null;
}

/** Normalizes object-key order so serialized occurrence metadata does not inflate update counts. */
function canonicalJourney(value:unknown){return JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}

/** Compares canonical occurrences without persisting a proposed routine change. */
export function previewRoutineChange(before:Planner,after:Planner,ruleId:string,today=todayIST()):Omit<RoutineChangePreview,"revision">{
  const old=new Map(before.journeys.filter(j=>j.ruleId===ruleId).map(j=>[j.id,j]));
  const next=new Map(after.journeys.filter(j=>j.ruleId===ruleId).map(j=>[j.id,j]));
  let added=0,removed=0,updated=0,unchanged=0,protectedCount=0;
  const firstDates:string[]=[];
  for(const [id,journey] of next){
    const previous=old.get(id);
    if(!previous){added++;firstDates.push(journey.date);}
    else if(canonicalJourney(previous)!==canonicalJourney(journey))updated++;
    else{unchanged++;if(previous.status!=="needs_booking"||previous.manualOverride||previous.archivedAt||previous.date<today)protectedCount++;}
  }
  for(const id of old.keys())if(!next.has(id))removed++;
  return {added,removed,updated,unchanged,protected:protectedCount,firstDates:[...new Set(firstDates)].sort().slice(0,3)};
}
