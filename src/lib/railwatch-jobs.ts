import { encryptSecret } from "./crypto";
import { journeyLink } from "./journey-links";
import {nextAccountBatch,planAccountReminders} from "./reminder-planning";
import {storedPlanner} from "./workspace-storage";
import {reminderJourneyId} from "./reminder-reference";
import { quietHoursResume } from "./notification-controls";
import { sendBrowserPush } from "./browser-push";

import {logger} from "./logger";
import { pollTelegram } from "./telegram-polling";
import { getProviderConfiguration,telegramConfigured } from "./provider-config";
import {telegramBookingMessage} from "./message-templates";
import { sendTelegram } from "./telegram";
import { createHash,randomUUID } from "node:crypto";
import { prisma } from "./db";
import { sendBookingEmail } from "./mail";
import { getDeliveryConfiguration } from "./settings";
import { getFeaturePolicy } from "./settings";
import { applyAccountSettings } from "./railwatch-store";
import { scheduledReminders,bookingTimeLabel,todayIST,formatDay,bookingDay,type Planner } from "./travel-planner";
import { syncGoogleCalendars } from "./railwatch-google";
/** Builds durable reminder identities and due times from active journey preferences. */
/** When to send the chart-check reminder: 4 hours before a confirmed departure, for booked RAC or waitlisted tickets only. */
export function chartCheckAt(j:{status:string;ticketStatus?:string;departureConfirmed?:boolean;departure:string;date:string}){if(j.status!=="booked"||!j.ticketStatus||j.ticketStatus==="CNF"||!j.departureConfirmed)return undefined;return new Date(new Date(`${j.date}T${j.departure}:00+05:30`).getTime()-4*3600000);}
export function reminderJobs(planner:Planner,now:Date,emailRecipient?:string,deviceIds:string[]=[]){
  const result:{key:string;kind:string;dueAt:Date;journeyId:string;message:string;deviceId?:string}[]=[];
  const channels=[...deviceIds.map(id=>"PUSH:"+id),...(planner.settings.emailEnabled&&emailRecipient?["EMAIL"]:[]),...(planner.settings.telegramEnabled?["TELEGRAM"]:[])];
  for(const j of planner.journeys){
    // Plan 3.5: one chart-check reminder about 4 hours before departure for RAC or waitlisted tickets.
    const chart=chartCheckAt(j);
    if(chart&&chart.getTime()>now.getTime()-3600000&&!j.archivedAt)for(const channel of channels.filter(c=>c!=="EMAIL")){const kind=channel.startsWith("PUSH:")?"PUSH":channel,deviceId=kind==="PUSH"?channel.slice(5):undefined;
      const identity=JSON.stringify([`${j.id}:chart`,j.date,j.departure,j.ticketStatus,kind,kind==="PUSH"?deviceId:kind==="EMAIL"?emailRecipient:kind==="TELEGRAM"?planner.settings.telegramProviderId:""]);
      result.push({key:createHash("sha256").update(identity).digest("hex"),kind,dueAt:chart,journeyId:j.id,message:`Chart check: your ${j.ticketStatus} ticket from ${j.from} to ${j.to} departs at ${j.departure} IST today. Charts are usually prepared about 4 hours before departure, so check your PNR status now.`,deviceId});}
    if(j.archivedAt||!["needs_booking","cancellation_needed"].includes(j.status)||j.date<todayIST(now))continue;
    // Retain a bounded recovery window; older schedules never auto-send externally.
    for(const time of scheduledReminders(planner,j,now)){const dueAt=new Date(time);if(dueAt.getTime()<now.getTime()-30*86400000)continue;
      const message=j.status==="cancellation_needed"?`Cancel your ticket from ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})} through IRCTC, then confirm cancellation in RailWatch.`:`Book your train from ${j.from} to ${j.to} for ${formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}. Booking opens ${formatDay(bookingDay(j))} at ${bookingTimeLabel(j)}.`;
      for(const channel of [...deviceIds.map(id=>"PUSH:"+id),...(planner.settings.emailEnabled&&emailRecipient?["EMAIL"]:[]),...(planner.settings.telegramEnabled?["TELEGRAM"]:[])]){
        const kind=channel.startsWith("PUSH:")?"PUSH":channel,deviceId=kind==="PUSH"?channel.slice(5):undefined;
        const identity=JSON.stringify([j.status==="cancellation_needed"?`${j.id}:cancel`:j.id,j.from,j.to,j.date,time,kind,kind==="PUSH"?deviceId:kind==="EMAIL"?emailRecipient:kind==="TELEGRAM"?[planner.settings.telegramProviderId,planner.settings.telegramChatId]:""]);
        result.push({key:createHash("sha256").update(identity).digest("hex"),kind,dueAt,journeyId:j.id,message,deviceId});
      }
    }
  }return result;
}
/** Polls Telegram, refreshes workspaces, leases due reminders, and synchronizes calendars. */
export async function processRailWatch(now=new Date()){
  // A pod can stop during its final permitted attempt; do not leave its job stuck.
  await prisma.railJob.updateMany({where:{state:"SENDING",attempts:{gte:5},leaseUntil:{lt:now}},data:{state:"FAILED",lease:null,leaseUntil:null,lastError:"Delivery was interrupted on its final automatic attempt. Review before retrying."}});
  await pollTelegram();
  const policy=await getFeaturePolicy();const config=await getProviderConfiguration();const telegramProviderId=telegramConfigured(config)?config.telegram!.id:undefined;
  const batch=await nextAccountBatch();let planningFailures=0;
  for(const {userId} of batch.accounts){try{await planAccountReminders(userId,policy,telegramProviderId,now,reminderJobs);}catch(error){planningFailures++;logger.error("scheduler.account_failed",{accountId:userId,errorType:error instanceof Error?error.name:"UnknownError"});}}
  await prisma.railOperations.upsert({where:{id:"scheduler"},create:{id:"scheduler",accountCursor:batch.cursor},update:{accountCursor:batch.cursor}});
  const available={dueAt:{lte:now},attempts:{lt:5},OR:[{state:"PENDING"},{state:"FAILED"},{state:"SENDING",leaseUntil:{lt:now}}]};
  const jobs=await prisma.railJob.findMany({where:available,orderBy:{dueAt:"asc"},take:100});let sent=0,failedRun=0;
  for(const job of jobs){const lease=randomUUID();const claim=await prisma.railJob.updateMany({where:{id:job.id,...available},data:{state:"SENDING",lease,leaseUntil:new Date(Math.max(Date.now(),now.getTime())+120000),attempts:{increment:1}}});if(!claim.count)continue;
    try{
      const currentPolicy=await getFeaturePolicy();const currentConfig=await getProviderConfiguration();const workspace=await prisma.railWorkspace.findUnique({where:{userId:job.userId},include:{user:{select:{isActive:true,phoneNumber:true,email:true,emailVerifiedAt:true}}}});const planner=workspace?applyAccountSettings(await storedPlanner(prisma,job.userId,workspace,[reminderJourneyId(job.payload)??""]),currentPolicy,workspace.user.phoneNumber??"",await prisma.railTelegram.findUnique({where:{userId:job.userId}}),telegramConfigured(currentConfig)?currentConfig.telegram!.id:undefined):undefined;
      const actual=currentPolicy.remindersEnabled&&(job.kind!=="WHATSAPP"||currentPolicy.whatsappEnabled)&&(job.kind!=="TELEGRAM"||currentPolicy.telegramEnabled)&&planner&&workspace?.user.isActive?reminderJobs(planner,now,workspace.user.emailVerifiedAt?workspace.user.email:undefined,(await prisma.railPush.findMany({where:{userId:job.userId},select:{id:true}})).map(d=>d.id)).find(j=>j.key===job.key):undefined;
      if(!actual){await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"CANCELLED",lease:null,leaseUntil:null}});continue;}
      if(!job.retryRequestedAt&&!job.deferredUntil&&actual.dueAt.getTime()<now.getTime()-86400000){await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"MISSED",lease:null,leaseUntil:null}});continue;}
      const pause=await prisma.railReminderPause.findUnique({where:{userId_journeyId:{userId:job.userId,journeyId:actual.journeyId}}});
      const quiet=quietHoursResume(planner!.settings.quietHours,now);
      const resume=Math.max(pause?.until.getTime()??0,quiet?.getTime()??0);
      if(resume>now.getTime()){await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"PENDING",attempts:{decrement:1},dueAt:new Date(resume),deferredUntil:new Date(resume),lease:null,leaseUntil:null,lastError:null}});logger.info("reminder.deferred",{jobId:job.id,kind:job.kind,reason:pause&&pause.until>now?"snooze":"quiet_hours"});continue;}
      if(job.kind==="EMAIL"&&!(await getDeliveryConfiguration()).smtpUrl){await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"PENDING",attempts:{decrement:1},dueAt:new Date(now.getTime()+300000),lastError:"Email setup is incomplete.",lease:null,leaseUntil:null}});continue;}
      const journey=planner!.journeys.find(j=>j.id===actual.journeyId)!;
      if(job.kind==="PUSH")await sendBrowserPush(job.userId,actual.deviceId!,actual.message,"railwatch-journey-"+actual.journeyId,journey.status==="needs_booking"?"booking":"none");
      if(job.kind==="EMAIL"){const result=await sendBookingEmail(workspace!.user.email,journey);if(!result.sent)throw new Error("Email setup is incomplete.");}
      const providerId=job.kind==="TELEGRAM"?await sendTelegram(planner!.settings.telegramChatId,telegramBookingMessage(journey),planner!.settings.telegramProviderId,`${process.env.APP_URL??"http://localhost:3000"}${journeyLink(journey.id)}`):undefined;
      await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"SENT",sentAt:now,providerId,lastError:null,deferredUntil:null,lease:null,leaseUntil:null}});sent++;logger.info("reminder.delivered",{jobId:job.id,kind:job.kind});
    }catch(error){failedRun++;logger.error("reminder.delivery_failed",{jobId:job.id,kind:job.kind,attempt:job.attempts,errorType:error instanceof Error?error.name:"UnknownError"});await prisma.railJob.updateMany({where:{id:job.id,lease},data:{state:"FAILED",dueAt:new Date(now.getTime()+Math.min(60,2**(job.attempts+1))*60000),lastError:"Delivery failed. Check the provider configuration.",lease:null,leaseUntil:null}});}
  }
  if(failedRun)await alertAdmins(failedRun,now).catch(error=>logger.error("ops.alert_failed",{errorType:error instanceof Error?error.name:"UnknownError"}));
  const calendars=await syncGoogleCalendars();return {accounts:batch.accounts.length,sent,calendars,...(planningFailures?{planningFailures}:{})};
}

/** Tells administrators in their bell when reminders fail to send (at most once an hour). */
async function alertAdmins(failed:number,now:Date){
  const admins=await prisma.user.findMany({where:{role:"ADMIN",isActive:true},select:{id:true}});
  if(!admins.length)return;
  const hour=now.toISOString().slice(0,13);
  const message=`${failed} ${failed===1?"reminder":"reminders"} failed to send. Open Settings → System health to see which channel and why.`;
  await prisma.railNotification.createMany({data:admins.map(a=>({userId:a.id,key:"ops-delivery-failed-"+hour,dueAt:now,payload:encryptSecret(JSON.stringify({journeyId:"",message}))})),skipDuplicates:true});
  logger.warn("ops.delivery_failures",{failed,admins:admins.length});
}
