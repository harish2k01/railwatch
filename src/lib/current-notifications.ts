import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { quietHoursResume } from "./notification-controls";
import { scheduledReminders, todayIST, formatDay, bookingDay, bookingTimeLabel, type Planner } from "./travel-planner";

export type CurrentNotification = { id:string; message:string; journeyId:string; dueAt:string };
export type CurrentNotifications = { items:CurrentNotification[]; count:number };

/**
 * Creates only currently due reminders; provider delivery history is never copied into the bell. The bell holds one
 * entry per journey and action (the evening, morning and opening reminders share it), and entries for journeys that
 * no longer need action are cleared by `clearResolvedNotifications` after planning.
 */
export async function planCurrentNotifications(tx:Prisma.TransactionClient,userId:string,planner:Planner,now:Date){
  if(quietHoursResume(planner.settings.quietHours,now))return;
  const pauses=await tx.railReminderPause.findMany({where:{userId,journeyId:{in:planner.journeys.map(j=>j.id)},until:{gt:now}},select:{journeyId:true}});
  const paused=new Set(pauses.map(p=>p.journeyId));
  const rows=planner.journeys.flatMap(j=>{
    if(paused.has(j.id)||j.archivedAt||!["needs_booking","cancellation_needed"].includes(j.status)||j.date<todayIST(now))return [];
    return scheduledReminders(planner,j,now).flatMap(time=>{
      const dueAt=new Date(time);if(dueAt>now||dueAt.getTime()<now.getTime()-86400000)return [];
      const message=j.status==="cancellation_needed"?`Cancel your ticket from ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}. Confirm cancellation in RailWatch after cancelling through IRCTC.`:`Book ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}. Booking opens ${formatDay(bookingDay(j))} at ${bookingTimeLabel(j)}.`;
      const key=createHash("sha256").update(JSON.stringify([j.id,j.status,j.from,j.to,j.date])).digest("hex");
      return [{userId,key,dueAt,payload:encryptSecret(JSON.stringify({journeyId:j.id,message}))}];
    }).slice(-1);
  });
  if(rows.length)await tx.railNotification.createMany({data:rows,skipDuplicates:true});
}

/** Returns only uncleared content owned by this account, with a bounded first page. */
export async function readCurrentNotifications(userId:string):Promise<CurrentNotifications>{
  const where={userId,dismissedAt:null,payload:{not:null}};
  const [rows,count]=await prisma.$transaction([
    prisma.railNotification.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:50,select:{id:true,payload:true,dueAt:true}}),
    prisma.railNotification.count({where}),
  ]);
  return {count,items:rows.flatMap(row=>{try{const content=JSON.parse(decryptSecret(row.payload)!);return typeof content.message==="string"&&typeof content.journeyId==="string"?[{id:row.id,message:content.message,journeyId:content.journeyId,dueAt:row.dueAt.toISOString()}]:[];}catch{return [];}})};
}

/** Erases cleared message content while retaining only scheduler deduplication metadata. */
export async function clearCurrentNotifications(userId:string,id?:string){
  await prisma.railNotification.updateMany({where:{userId,dismissedAt:null,...(id?{id}:{})},data:{payload:null,dismissedAt:new Date()}});
  return readCurrentNotifications(userId);
}

/** Dismisses bell entries whose journey is not in `active` (journeys still needing booking or cancellation), and duplicates of the same journey (older first). */
export async function clearResolvedNotifications(tx:Prisma.TransactionClient,userId:string,active:Set<string>,now:Date){
  const open=await tx.railNotification.findMany({where:{userId,dismissedAt:null,payload:{not:null}},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,payload:true},take:500});
  if(!open.length)return;
  const seen=new Set<string>(),stale:string[]=[];
  for(const row of open){let journeyId="";try{journeyId=JSON.parse(decryptSecret(row.payload)!).journeyId??"";}catch{/* unreadable: leave it */continue;}
    if(!journeyId)continue; // instance alerts (admins) are not tied to a journey
    if(!active.has(journeyId)||seen.has(journeyId))stale.push(row.id);else seen.add(journeyId);}
  if(stale.length)await tx.railNotification.updateMany({where:{userId,id:{in:stale}},data:{payload:null,dismissedAt:now}});
}
