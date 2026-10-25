import {reminderJourneyId} from "./reminder-reference";
import {storedPlanner} from "./workspace-storage";
import { prisma } from "./db";
import { ApiError } from "./http";
import { applyAccountSettings } from "./railwatch-store";
import { getFeaturePolicy } from "./settings";
import { getProviderConfiguration, telegramConfigured } from "./provider-config";
import { reminderJobs } from "./railwatch-jobs";
import { logger } from "./logger";

/** Classifies actionable scheduler and queue problems without exposing account data. */
export function operationAlerts(input:{succeededAt:Date|null;startedAt:Date|null;failedAt:Date|null;exhausted:number;missed:number;oldestDueAt:Date|null},now=new Date()) {
  const alerts:string[]=[];
  if(!input.succeededAt||now.getTime()-input.succeededAt.getTime()>180000)alerts.push("The scheduler has not completed successfully in the last three minutes.");
  if(input.failedAt&&(!input.succeededAt||input.failedAt>input.succeededAt))alerts.push("The last scheduler run failed.");
  if(input.startedAt&&(!input.succeededAt||input.startedAt>input.succeededAt)&&now.getTime()-input.startedAt.getTime()>300000)alerts.push("A scheduler run has been active for more than five minutes.");
  if(input.exhausted)alerts.push(`${input.exhausted} reminders have exhausted automatic retries.`);
  if(input.missed)alerts.push(`${input.missed} reminders missed their delivery window.`);
  if(input.oldestDueAt&&now.getTime()-input.oldestDueAt.getTime()>300000)alerts.push("The oldest queued reminder is more than five minutes overdue.");
  return alerts;
}

/** Reads durable heartbeat and bounded queue aggregates for administrators and monitoring. */
export async function reminderHealth(now=new Date()) {
  const external={kind:{not:"IN_APP"}};
  const eligible={...external,state:{in:["PENDING","FAILED"]},attempts:{lt:5}};
  const [heartbeat,counts,oldest,failures,scheduled,due,overdue,next,channels]=await Promise.all([
    prisma.railOperations.findUnique({where:{id:"scheduler"}}),
    prisma.railJob.groupBy({by:["state"],where:external,_count:true}),
    prisma.railJob.aggregate({where:{...eligible,dueAt:{lte:now}},_min:{dueAt:true}}),
    prisma.railJob.groupBy({by:["kind"],where:{...external,state:"FAILED"},_count:true}),
    prisma.railJob.count({where:{...eligible,dueAt:{gt:now}}}),
    prisma.railJob.count({where:{...eligible,dueAt:{lte:now}}}),
    prisma.railJob.count({where:{...eligible,dueAt:{lt:new Date(now.getTime()-300000)}}}),
    prisma.railJob.aggregate({where:{...eligible,dueAt:{gt:now}},_min:{dueAt:true}}),
    prisma.railJob.groupBy({by:["kind"],where:{...eligible,dueAt:{gt:now}},_count:true}),
  ]);
  const states=Object.fromEntries(counts.map(row=>[row.state,row._count]));
  const exhausted=await prisma.railJob.count({where:{...external,state:"FAILED",attempts:{gte:5}}});
  const timing={startedAt:heartbeat?.startedAt??null,succeededAt:heartbeat?.succeededAt??null,failedAt:heartbeat?.failedAt??null};
  return {...timing,durationMs:heartbeat?.durationMs??null,failureCount:heartbeat?.failureCount??0,states,exhausted,oldestDueAt:oldest._min.dueAt,queue:{scheduled,due,overdue,nextAt:next._min.dueAt,channels:Object.fromEntries(channels.map(row=>[row.kind,row._count]))},providerFailures:Object.fromEntries(failures.map(row=>[row.kind,row._count])),alerts:operationAlerts({...timing,exhausted,missed:states.MISSED??0,oldestDueAt:oldest._min.dueAt},now)};
}

/** Audits a single administrator retry after rechecking current ownership and eligibility. */
export async function retryReminder(id:string,actorId:string,now=new Date()) {
  const policy=await getFeaturePolicy(),config=await getProviderConfiguration();
  return prisma.$transaction(async tx=>{
    const job=await tx.railJob.findUnique({where:{id}});
    if(!job)throw new ApiError(404,"Reminder not found.","NOT_FOUND");
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${job.userId} FOR UPDATE`;
    const workspace=await tx.railWorkspace.findUnique({where:{userId:job.userId},include:{user:true}});
    if(!workspace?.user.isActive||!policy.remindersEnabled||!['MISSED','FAILED'].includes(job.state))throw new ApiError(409,"This reminder can no longer be retried.","REMINDER_NOT_RETRYABLE");
    const planner=applyAccountSettings(await storedPlanner(tx,job.userId,workspace,[reminderJourneyId(job.payload)??""]),policy,workspace.user.phoneNumber??"",await tx.railTelegram.findUnique({where:{userId:job.userId}}),telegramConfigured(config)?config.telegram!.id:undefined);
    const devices=await tx.railPush.findMany({where:{userId:job.userId},select:{id:true}});
    const actual=reminderJobs(planner,now,workspace.user.emailVerifiedAt?workspace.user.email:undefined,devices.map(d=>d.id)).find(j=>j.key===job.key);
    if(!actual||(job.kind==='WHATSAPP'&&!policy.whatsappEnabled)||(job.kind==='TELEGRAM'&&!policy.telegramEnabled))throw new ApiError(409,"The journey or delivery preferences changed. This reminder is no longer needed.","REMINDER_NO_LONGER_NEEDED");
    const saved=await tx.railJob.updateMany({where:{id,state:job.state,updatedAt:job.updatedAt},data:{state:"PENDING",attempts:0,dueAt:now,retryRequestedAt:now,lastError:null,lease:null,leaseUntil:null}});
    if(!saved.count)throw new ApiError(409,"The reminder changed. Refresh before retrying.","REMINDER_CONFLICT");
    await tx.auditLog.create({data:{actorId,action:"reminder.retry_requested",targetType:"RailJob",targetId:id,metadata:{kind:job.kind,previousState:job.state}}});
    logger.info("reminder.retry_requested",{jobId:id,kind:job.kind});
    return {message:"Retry queued. The scheduler will check eligibility again before sending."};
  });
}

/** Exposes aggregate Prometheus metrics without labels containing user or ticket information. */
export function reminderMetrics(health:Awaited<ReturnType<typeof reminderHealth>>,now=new Date()) {
  const values:Record<string,number>={
    railwatch_scheduler_last_success_timestamp_seconds:health.succeededAt?health.succeededAt.getTime()/1000:0,
    railwatch_scheduler_last_duration_seconds:(health.durationMs??0)/1000,
    railwatch_scheduler_failures_total:health.failureCount,
    railwatch_reminders_missed:health.states.MISSED??0,
    railwatch_reminders_exhausted:health.exhausted,
    railwatch_reminders_pending:health.states.PENDING??0,
    railwatch_reminders_failed:health.states.FAILED??0,
    railwatch_reminders_scheduled:health.queue.scheduled,
    railwatch_reminders_due:health.queue.due,
    railwatch_reminders_overdue:health.queue.overdue,
    railwatch_reminder_oldest_due_age_seconds:health.oldestDueAt?Math.max(0,(now.getTime()-health.oldestDueAt.getTime())/1000):0,
  };
  return Object.entries(values).map(([name,value])=>`# TYPE ${name} ${name.endsWith('_total')?'counter':'gauge'}\n${name} ${value}`).join('\n')+'\n# TYPE railwatch_reminder_provider_failures gauge\n'+
    ["EMAIL","PUSH","TELEGRAM","WHATSAPP"].map(kind=>`railwatch_reminder_provider_failures{channel="${kind}"} ${health.providerFailures[kind]??0}`).join('\n')+'\n';
}
