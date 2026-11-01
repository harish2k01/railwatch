import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { quietHoursResume } from "./notification-controls";
import { scheduledReminders, todayIST, formatDay, bookingDay, bookingTimeLabel, type Planner } from "./travel-planner";

export type CurrentNotification = { id:string; message:string; journeyId:string; dueAt:string };
export type CurrentNotifications = { items:CurrentNotification[]; count:number };

/** Creates only currently due reminders; provider delivery history is never copied into the bell. */
export async function planCurrentNotifications(tx:Prisma.TransactionClient,userId:string,planner:Planner,now:Date){
  if(quietHoursResume(planner.settings.quietHours,now))return;
  const pauses=await tx.railReminderPause.findMany({where:{userId,journeyId:{in:planner.journeys.map(j=>j.id)},until:{gt:now}},select:{journeyId:true}});
  const paused=new Set(pauses.map(p=>p.journeyId));
  const rows=planner.journeys.flatMap(j=>{
    if(paused.has(j.id)||j.archivedAt||!["needs_booking","cancellation_needed"].includes(j.status)||j.date<todayIST(now))return [];
    return scheduledReminders(planner,j,now).flatMap(time=>{
      const dueAt=new Date(time);if(dueAt>now||dueAt.getTime()<now.getTime()-86400000)return [];
      const message=j.status==="cancellation_needed"?`Cancel your ticket from ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}. Confirm cancellation in RailWatch after cancelling through IRCTC.`:`Book ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}. Booking opens ${formatDay(bookingDay(j))} at ${bookingTimeLabel(j)}.`;
      const key=createHash("sha256").update(JSON.stringify([j.id,j.status,j.from,j.to,j.date,time])).digest("hex");
      return [{userId,key,dueAt,payload:encryptSecret(JSON.stringify({journeyId:j.id,message}))}];
    });
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
