import {z} from "zod";
import type {Prisma} from "@prisma/client";
import {prisma} from "./db";
import {decryptSecret,stableHash} from "./crypto";
import {ApiError} from "./http";
import {ensureJourneyIndex} from "./journey-pages";
import {addDays,daysBetween,isDay,todayIST,type Journey} from "./travel-planner";

export const planningQuerySchema=z.object({view:z.enum(["dashboard","calendar"]),from:z.string().refine(isDay).optional(),to:z.string().refine(isDay).optional(),cursor:z.string().max(512).default("")});
export type PlanningQuery=z.infer<typeof planningQuerySchema>;
export type CalendarCounts=Record<string,{journeys:number;bookings:number;cancellations:number}>;
export type DashboardView={revision:number;totals:{booked:number;ready:number;completed:number;toCancel:number;attention:number;upcoming:number};attention:Journey[];upcoming:Journey[];bookingSoon:Journey[];week:CalendarCounts};
export type CalendarView={revision:number;journeys:Journey[];counts:CalendarCounts;total:number;nextCursor:string|null};
/** Decrypts only the explicitly selected index records. */
function decode(rows:{payload:string}[]){return rows.map(row=>JSON.parse(decryptSecret(row.payload)!) as Journey);}
/** Loads exact per-day counts independently of the calendar's loaded record batches. */
async function calendarCounts(tx:Prisma.TransactionClient,userId:string,from:string,to:string){
  const counts:CalendarCounts={};
  const entry=(day:string)=>counts[day]??(counts[day]={journeys:0,bookings:0,cancellations:0});
  const travel=await tx.railJourney.groupBy({by:["date","status"],where:{userId,archived:false,date:{gte:from,lte:to},status:{in:["booked","needs_booking","cancellation_needed"]}},_count:{_all:true}});
  for(const row of travel){entry(row.date).journeys+=row._count._all;if(row.status==="cancellation_needed")entry(row.date).cancellations+=row._count._all;}
  const bookings=await tx.railJourney.groupBy({by:["bookingDate"],where:{userId,archived:false,status:"needs_booking",bookingDate:{gte:from,lte:to}},_count:{_all:true}});
  for(const row of bookings)entry(row.bookingDate).bookings+=row._count._all;
  return counts;
}
/** Returns bounded dashboard previews or calendar batches from a consistent owned snapshot. */
export async function readPlanningView(userId:string,input:PlanningQuery,now=new Date()):Promise<DashboardView|CalendarView>{
  if(input.view==="calendar"&&(!input.from||!input.to||input.to<input.from||daysBetween(input.from,input.to)>41))throw new ApiError(400,"Choose a calendar range of up to six weeks.","INVALID_RANGE");
  await ensureJourneyIndex(userId,now);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR SHARE`;
    const {version:revision}=await tx.railWorkspace.findUniqueOrThrow({where:{userId},select:{version:true}});
    const today=todayIST(now),active={userId,archived:false};
    if(input.view==="dashboard"){
      const [totals]=await tx.$queryRaw<DashboardView["totals"][]>`SELECT
        (COUNT(*) FILTER (WHERE status='booked' AND date>=${today}))::int AS booked,
        (COUNT(*) FILTER (WHERE status='needs_booking' AND date>=${today} AND "bookingAt"<=${now}))::int AS ready,
        (COUNT(*) FILTER (WHERE status='completed'))::int AS completed,
        (COUNT(*) FILTER (WHERE status='cancellation_needed' AND date>=${today}))::int AS "toCancel",
        (COUNT(*) FILTER (WHERE status='cancellation_needed' OR (status='needs_booking' AND date>=${today} AND "bookingAt"<=${now})))::int AS attention,
        (COUNT(*) FILTER (WHERE date>=${today} AND (status='booked' OR (status='needs_booking' AND "bookingAt"<=${now}))))::int AS upcoming
        FROM "RailJourney" WHERE "userId"=${userId} AND NOT archived`;
      const open:Prisma.RailJourneyWhereInput={...active,date:{gte:today},status:"needs_booking",bookingAt:{lte:now}};
      const ready=await tx.railJourney.findMany({where:open,orderBy:[{date:"asc"},{id:"asc"}],take:30,select:{payload:true}});
      const cancelling=await tx.railJourney.findMany({where:{...active,status:"cancellation_needed"},orderBy:[{date:"asc"},{id:"asc"}],take:30-ready.length,select:{payload:true}});
      const upcoming=await tx.railJourney.findMany({where:{...active,date:{gte:today},OR:[{status:"booked"},{status:"needs_booking",bookingAt:{lte:now}}]},orderBy:[{date:"asc"},{id:"asc"}],take:4,select:{payload:true}});
      const bookingSoon=await tx.railJourney.findMany({where:{...active,status:"needs_booking",date:{gte:today},bookingAt:{gt:now}},orderBy:[{bookingAt:"asc"},{id:"asc"}],take:4,select:{payload:true}});
      const week=await calendarCounts(tx,userId,today,addDays(today,6));
      // Travel week counts match actionable upcoming travel, excluding future booking windows.
      const weekUpcoming=await tx.railJourney.groupBy({by:["date"],where:{...active,date:{gte:today,lte:addDays(today,6)},OR:[{status:"booked"},{status:"needs_booking",bookingAt:{lte:now}}]},_count:{_all:true}});
      for(const value of Object.values(week))value.journeys=0;
      for(const row of weekUpcoming)(week[row.date]??(week[row.date]={journeys:0,bookings:0,cancellations:0})).journeys=row._count._all;
      return {revision,totals,attention:decode([...ready,...cancelling]),upcoming:decode(upcoming),bookingSoon:decode(bookingSoon),week};
    }
    const from=input.from!,to=input.to!,query=stableHash(userId+JSON.stringify({...input,cursor:""}));
    let after:string|undefined;
    if(input.cursor){let cursor:{id:string;revision:number;query:string};try{cursor=z.object({id:z.string().min(1),revision:z.number().int(),query:z.string()}).parse(JSON.parse(Buffer.from(input.cursor,"base64url").toString()));}catch{throw new ApiError(400,"Refresh this calendar.","INVALID_CURSOR");}if(cursor.query!==query)throw new ApiError(400,"The calendar range changed. Refresh this view.","INVALID_CURSOR");if(cursor.revision!==revision)throw new ApiError(409,"Your journeys changed. Refresh this view.","VERSION_CONFLICT");after=cursor.id;if(!await tx.railJourney.findUnique({where:{userId_id:{userId,id:after}},select:{id:true}}))throw new ApiError(400,"Refresh this calendar.","INVALID_CURSOR");}
    const where:Prisma.RailJourneyWhereInput={...active,OR:[{date:{gte:from,lte:to},status:{in:["booked","needs_booking","cancellation_needed"]}},{bookingDate:{gte:from,lte:to},status:"needs_booking"}]};
    const rows=await tx.railJourney.findMany({where,orderBy:{id:"asc"},take:201,...(after?{cursor:{userId_id:{userId,id:after}},skip:1}:{}),select:{id:true,payload:true}});
    return {revision,journeys:decode(rows.slice(0,200)),counts:await calendarCounts(tx,userId,from,to),total:await tx.railJourney.count({where}),nextCursor:rows.length>200?Buffer.from(JSON.stringify({id:rows[199].id,revision,query})).toString("base64url"):null};
  },{timeout:60000});
}
