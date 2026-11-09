import {addDays,daysBetween,type Planner} from "./travel-planner";

/** Removes attachment references the configured number of days after completion/cancellation while retaining journey records. */
export function expiredTicketFiles(planner:Planner,today:string){
 const ids:string[]=[];
 const journeys=planner.journeys.map(j=>{
  const ended=j.status==="completed"?j.completedAt??addDays(j.date,1):["cancelled","skipped"].includes(j.status)?j.cancelledAt:undefined;
  if(!ended||daysBetween(ended,today)<(planner.settings.ticketRetentionDays??7)||!j.attachments?.length)return j;
  ids.push(...j.attachments.map(file=>file.id));return {...j,attachments:[]};
 });
 return {planner:ids.length?{...planner,journeys}:planner,ids};
}
