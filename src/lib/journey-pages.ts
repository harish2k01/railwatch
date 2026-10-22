import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { decryptSecret,stableHash } from "./crypto";
import { ApiError } from "./http";
import { journeySearchText,searchTokens } from "./journey-index";
import { todayIST,isDay,addDays,weekday,type Journey } from "./travel-planner";
import { loadWorkspace } from "./railwatch-store";

const day=z.string().refine(value=>!value||isDay(value));
export const journeyQuerySchema=z.object({view:z.enum(["board","list","completed","archive","tickets"]).default("board"),status:z.enum(["all","ready","needs_booking","booked","cancellation_needed","cancelled"]).default("all"),quick:z.enum(["all","booking_week","travel_week","cancellation"]).default("all"),weekStartsOn:z.coerce.number().int().min(0).max(1).default(0),q:z.string().max(120).default(""),rule:z.string().max(128).default(""),from:day.default(""),to:day.default(""),range:z.enum(["upcoming","past","all"]).default("upcoming"),sort:z.enum(["travel","booking"]).default("travel"),cursor:z.string().max(512).default(""),column:z.enum(["all","needs_booking","booked","cancellation_needed","cancelled"]).optional()}).refine(input=>!input.from||!input.to||input.from<=input.to,{message:"Travel end date must be on or after the start date.",path:["to"]});
export type JourneyQuery=z.infer<typeof journeyQuerySchema>;
export type JourneyQuickFilter=JourneyQuery["quick"];
export type JourneyPage={items:Journey[];nextCursor:string|null;total:number};
export type JourneyPages={revision:number;pages:Record<string,JourneyPage>;filteredTotals?:{board:number;completed:number;archive:number};totals:{board:number;completed:number;archive:number;booked:number;ready:number;toCancel:number}};

/** Builds the list index lazily for upgraded accounts and refreshes it at an IST day boundary. */
export async function ensureJourneyIndex(userId:string,now=new Date()){
  const record=await prisma.railWorkspace.findUnique({where:{userId},select:{version:true,listVersion:true,listDay:true}});
  if(!record||record.version!==record.listVersion||record.listDay!==todayIST(now))await loadWorkspace(userId,now);
}
/** Applies account-owned date, status and routine constraints to indexed journey queries. */
export function journeyWhere(userId:string,input:JourneyQuery,now=new Date(),allViews=false):Prisma.RailJourneyWhereInput{
  const today=todayIST(now),conditions:Prisma.RailJourneyWhereInput[]=[];
  if(!allViews&&input.view!=="tickets"){
    conditions.push({archived:input.view==="archive"});
    if(input.view!=="archive")conditions.push({status:input.view==="completed"?"completed":{not:"completed"}});
    if(input.range==="past")conditions.push({date:{lt:today}});
    if(input.range==="upcoming")conditions.push(["board","list"].includes(input.view)?{OR:[{date:{gte:today}},{status:{in:["cancelled","skipped"]}}]}:{date:{gte:today}});
  }else if(!allViews)conditions.push({hasTicket:true});
  if(input.status==="ready")conditions.push({status:"needs_booking",bookingAt:{lte:now},date:{gte:today}});
  else if(input.status!=="all")conditions.push({status:input.status==="cancelled"?{in:["cancelled","skipped"]}:input.status});
  if(input.rule)conditions.push({ruleId:input.rule});
  if(input.from||input.to)conditions.push({date:{...(input.from?{gte:input.from}:{}),...(input.to?{lte:input.to}:{})}});
  const start=addDays(today,-((weekday(today)-input.weekStartsOn+7)%7));
  if(input.quick==="booking_week")conditions.push({status:"needs_booking",bookingAt:{gte:new Date(`${start}T00:00:00+05:30`),lt:new Date(`${addDays(start,7)}T00:00:00+05:30`)}});
  if(input.quick==="travel_week")conditions.push({status:"booked",date:{gte:start,lte:addDays(start,6)}});
  if(input.quick==="cancellation")conditions.push({status:"cancellation_needed"});
  return {userId,AND:conditions};
}
/** Verifies substring candidates in bounded batches so opaque token matches never inflate totals. */
async function matchSearch(tx:Prisma.TransactionClient,userId:string,where:Prisma.RailJourneyWhereInput,q:string){
  const text=q.normalize("NFKC").toLowerCase(),tokens=searchTokens(userId,text);
  const candidates={...where,...(tokens.length?{searchTokens:{hasEvery:tokens}}:{})};
  const ids:string[]=[];let cursor:string|undefined;
  for(;;){const rows=await tx.railJourney.findMany({where:candidates,orderBy:{id:"asc"},take:250,...(cursor?{cursor:{userId_id:{userId,id:cursor}},skip:1}:{}),select:{id:true,payload:true}});for(const row of rows){const j=JSON.parse(decryptSecret(row.payload)!) as Journey;if(journeySearchText(j).includes(text))ids.push(row.id);}if(rows.length<250)break;cursor=rows.at(-1)!.id;}
  return {...where,id:{in:ids}};
}
/** Reads bounded list pages and full-account totals from one consistent account snapshot. */
export async function readJourneyPages(userId:string,input:JourneyQuery,now=new Date()):Promise<JourneyPages>{
  await ensureJourneyIndex(userId,now);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR SHARE`;
    const workspace=await tx.railWorkspace.findUniqueOrThrow({where:{userId},select:{version:true}});
    const fingerprint=stableHash(userId+JSON.stringify({...input,cursor:"",column:undefined}));
    let after:{id:string;version:number;query:string;column:string}|undefined;
    if(input.cursor){try{after=z.object({id:z.string().min(1).max(128),version:z.number().int(),query:z.string(),column:z.string()}).parse(JSON.parse(Buffer.from(input.cursor,"base64url").toString()));}catch{throw new ApiError(400,"Invalid page. Refresh this view.","INVALID_CURSOR");}if(after.query!==fingerprint||after.column!==input.column)throw new ApiError(400,"Filters changed. Refresh this view.","INVALID_CURSOR");if(after.version!==workspace.version)throw new ApiError(409,"Your journeys changed. Refresh this view.","VERSION_CONFLICT");if(!await tx.railJourney.findUnique({where:{userId_id:{userId,id:after.id}},select:{id:true}}))throw new ApiError(400,"Refresh this view.","INVALID_CURSOR");}
    // Cross-section counts retain explicit dates and search without the current section constraint.
    let scope=journeyWhere(userId,input,now,true);if(input.q)scope=await matchSearch(tx,userId,scope,input.q);
    const where:Prisma.RailJourneyWhereInput={AND:[journeyWhere(userId,input,now),scope]};
    const today=todayIST(now);
    const [totals]=await tx.$queryRaw<JourneyPages["totals"][]>`SELECT
      (COUNT(*) FILTER (WHERE NOT archived AND status <> 'completed'))::int AS board,
      (COUNT(*) FILTER (WHERE NOT archived AND status = 'completed'))::int AS completed,
      (COUNT(*) FILTER (WHERE archived))::int AS archive,
      (COUNT(*) FILTER (WHERE NOT archived AND status = 'booked' AND date >= ${today}))::int AS booked,
      (COUNT(*) FILTER (WHERE NOT archived AND status = 'needs_booking' AND date >= ${today} AND "bookingAt" <= ${now}))::int AS ready,
      (COUNT(*) FILTER (WHERE NOT archived AND status = 'cancellation_needed' AND date >= ${today}))::int AS "toCancel"
      FROM "RailJourney" WHERE "userId" = ${userId}`;
    const groups=await tx.railJourney.groupBy({by:["status"],where,_count:{_all:true}});
    const counts=new Map(groups.map(g=>[g.status,g._count._all]));
    const scopedGroups=await tx.railJourney.groupBy({by:["archived","status"],where:scope,_count:{_all:true}});
    const filteredTotals={board:0,completed:0,archive:0};
    for(const row of scopedGroups)filteredTotals[row.archived?"archive":row.status==="completed"?"completed":"board"]+=row._count._all;

    const columns=input.column?[input.column]:input.view==="board"?["needs_booking","booked","cancellation_needed","cancelled"]:["all"];
    const pages:Record<string,JourneyPage>={};
    for(const column of columns){const selected:Prisma.RailJourneyWhereInput={AND:[where,...(column==="all"?[]:[{status:column==="cancelled"?{in:["cancelled","skipped"]}:column}])]};const rows=await tx.railJourney.findMany({where:selected,orderBy:[input.sort==="booking"?{bookingAt:"asc"}:{date:"asc"},{id:"asc"}],take:31,...(after?{cursor:{userId_id:{userId,id:after.id}},skip:1}:{}),select:{id:true,payload:true}});pages[column]={items:rows.slice(0,30).map(r=>JSON.parse(decryptSecret(r.payload)!) as Journey),total:column==="all"?groups.reduce((sum,g)=>sum+g._count._all,0):column==="cancelled"?(counts.get("cancelled")??0)+(counts.get("skipped")??0):counts.get(column)??0,nextCursor:rows.length>30?Buffer.from(JSON.stringify({id:rows[29].id,version:workspace.version,query:fingerprint,column})).toString("base64url"):null};}
    return {revision:workspace.version,pages,totals,filteredTotals};
  },{timeout:60000});
}
