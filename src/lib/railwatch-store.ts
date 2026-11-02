import {storedPlanner,workspacePayload,normalizedStorageEnabled} from "./workspace-storage";
import {saveNormalizedPatch} from "./workspace-patch";
import { syncJourneyIndex } from "./journey-index";
import { mergeWorkspace, sameContent, WorkspaceConflict } from "./workspace-merge";
import { getProviderConfiguration,telegramConfigured } from "./provider-config";
import { telegramRecipient } from "./telegram";
import { getFeaturePolicy } from "./settings";
import type { FeaturePolicy } from "./feature-policy";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {expiredTicketFiles} from "./ticket-retention";
import {logger} from "./logger";
import { decryptSecret } from "./crypto";
import { ApiError } from "./http";
import { EMPTY_PLANNER, extendRoutines, reconcileJourneyLifecycle, migratePlanner, plannerSchema, todayIST, type Planner } from "./travel-planner";

/** Validates planner ownership-independent invariants and applies shared booking rules. */
export function validateWorkspace(value: unknown): Planner {
  const planner = migratePlanner(value);
  for (const items of [planner.journeys, planner.rules, planner.holidays]) if (new Set(items.map(x => x.id)).size !== items.length) throw new ApiError(400,"Duplicate record identifiers.");
  if (planner.journeys.some(j => j.from.toLowerCase() === j.to.toLowerCase())) throw new ApiError(400,"Choose different departure and arrival stations.");
  for (const r of planner.rules) if (r.linkedRuleId) { const linked = planner.rules.find(x => x.id === r.linkedRuleId); if (!linked || linked.id === r.id || linked.linkedRuleId !== r.id || linked.from.toLowerCase() !== r.to.toLowerCase() || linked.to.toLowerCase() !== r.from.toLowerCase()) throw new ApiError(400,"Linked routines must have opposite routes and reciprocal links."); }
  const days = planner.settings.bookingWindowDays;
  return plannerSchema.parse({ ...planner, journeys: planner.journeys.map(j => ({...j,windowDays:days,originOffset:0,bookingDateOverride:undefined})), rules:planner.rules.map(r=>({...r,windowDays:days})) });
}
/** Applies administrator feature policy and the current account connection details. */
export function applyAccountSettings(planner:Planner,policy:FeaturePolicy,phoneNumber:string,telegram:{chatId:string|null;enabled:boolean;providerId:string}|null=null,telegramProviderId?:string):Planner {
return {...planner,settings:{...planner.settings,telegramChatId:policy.telegramEnabled&&policy.remindersEnabled?telegramRecipient(telegram,telegramProviderId):"",telegramProviderId:telegramProviderId??"",telegramEnabled:Boolean(policy.telegramEnabled&&policy.remindersEnabled&&telegramRecipient(telegram,telegramProviderId)),weekStartsOn:policy.weekStartsOn,routineHorizonMode:policy.routineHorizonMode,routineMonthsAhead:policy.routineMonthsAhead,routineTicketCount:policy.routineTicketCount,bookingWindowDays:policy.bookingWindowDays,whatsappNumber:phoneNumber,whatsappEnabled:false},journeys:planner.journeys.map(j=>({...j,windowDays:policy.bookingWindowDays,originOffset:0,bookingDateOverride:undefined})),rules:planner.rules.map(r=>({...r,windowDays:policy.bookingWindowDays}))};
}
/** Locks the account row so workspace and attachment changes are serialized. */
async function lock(tx: Prisma.TransactionClient, userId: string) { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`; }
/** Loads the private workspace and reconciles routines, journey lifecycle, and expired ticket files atomically. */
export async function loadWorkspace(userId: string, now = new Date()) {
  const policy=await getFeaturePolicy();const config=await getProviderConfiguration();const telegramProviderId=telegramConfigured(config)?config.telegram!.id:undefined;
  let deletedFiles=0;const result=await prisma.$transaction(async tx => {
    await lock(tx,userId);
    const user=await tx.user.findUniqueOrThrow({where:{id:userId}});const telegram=await tx.railTelegram.findUnique({where:{userId}});
    const initial=applyAccountSettings(EMPTY_PLANNER,policy,user.phoneNumber??"",telegram,telegramProviderId);
    const existing = await tx.railWorkspace.findUnique({where:{userId}});
    if (!existing) { const record = await tx.railWorkspace.create({data:{userId,payload:workspacePayload(initial,normalizedStorageEnabled()?2:1),storageVersion:normalizedStorageEnabled()?2:1}}); await syncJourneyIndex(tx,userId,initial,record.version,now);return {planner:initial,revision:record.version}; }
    const planner=await storedPlanner(tx,userId,existing); const retention=expiredTicketFiles(reconcileJourneyLifecycle(extendRoutines(applyAccountSettings(planner,policy,user.phoneNumber??"",telegram,telegramProviderId),todayIST(now)),todayIST(now)),todayIST(now));const extended=retention.planner;
    if(retention.ids.length){const removed=await tx.railFile.deleteMany({where:{userId,id:{in:retention.ids}}});deletedFiles=removed.count;}
    if (!sameContent({...extended,journeys:[...extended.journeys].sort((a,b)=>a.id.localeCompare(b.id))},{...planner,journeys:[...planner.journeys].sort((a,b)=>a.id.localeCompare(b.id))})) { const record=await tx.railWorkspace.update({where:{userId},data:{payload:workspacePayload(extended,existing.storageVersion===2||normalizedStorageEnabled()?2:1),storageVersion:existing.storageVersion===2||normalizedStorageEnabled()?2:1,version:{increment:1}}}); await syncJourneyIndex(tx,userId,extended,record.version,now);return {planner:extended,revision:record.version}; }
    if(existing.listVersion!==existing.version||existing.listDay!==todayIST(now)||existing.storageVersion===1&&normalizedStorageEnabled()){await syncJourneyIndex(tx,userId,planner,existing.version,now);if(existing.storageVersion===1&&normalizedStorageEnabled())await tx.railWorkspace.update({where:{userId},data:{payload:workspacePayload(planner,2),storageVersion:2}});}
    return {planner,revision:existing.version};
  },{timeout:60000});
  if(deletedFiles)logger.info("tickets.retention_deleted",{files:deletedFiles});
  return result;
}
/** Validates ownership, merges compatible concurrent edits, and persists the encrypted workspace atomically. */
export async function saveWorkspace(userId: string, value: unknown, revision: number, base?: unknown, partial=false) {
  const policy=await getFeaturePolicy();const config=await getProviderConfiguration();const telegramProviderId=telegramConfigured(config)?config.telegram!.id:undefined;
  const input=plannerSchema.parse(value);
  if(partial){await loadWorkspaceMetadata(userId);const mode=await prisma.railWorkspace.findUnique({where:{userId},select:{storageVersion:true}});if(mode?.storageVersion===2)return saveNormalizedPatch(userId,input,revision,base,policy,telegramProviderId);}
  if(input.settings.emailEnabled&&!policy.remindersEnabled)throw new ApiError(403,"Booking reminders are disabled by the administrator.","FEATURE_DISABLED");
  if(input.settings.whatsappEnabled&&(!policy.whatsappEnabled||!policy.remindersEnabled))throw new ApiError(403,"WhatsApp reminders are not available.","FEATURE_DISABLED");
  let deletedFiles=0;const result=await prisma.$transaction(async tx => {
    await lock(tx,userId); const user=await tx.user.findUniqueOrThrow({where:{id:userId}});const telegram=await tx.railTelegram.findUnique({where:{userId}});
    let planner=validateWorkspace(applyAccountSettings(input,policy,user.phoneNumber??"",telegram,telegramProviderId));
    const current=await tx.railWorkspace.findUnique({where:{userId}});
    if (!current) throw new ApiError(409,"Reload your workspace before saving.","VERSION_CONFLICT");
    if (partial || current.version !== revision) {
      if (!base) throw new ApiError(409,"Your plans changed in another session. Reload the latest version before saving.","VERSION_CONFLICT");
      try {
        const original=validateWorkspace(applyAccountSettings(plannerSchema.parse(base),policy,user.phoneNumber??"",telegram,telegramProviderId));
        const latest=validateWorkspace(applyAccountSettings(await storedPlanner(tx,userId,current),policy,user.phoneNumber??"",telegram,telegramProviderId));
        planner=validateWorkspace(mergeWorkspace(original,planner,latest));
      } catch(error) { if(error instanceof WorkspaceConflict) throw new ApiError(409,error.message,"VERSION_CONFLICT"); throw error; }
    }
    planner=reconcileJourneyLifecycle(extendRoutines(planner,todayIST()),todayIST());
    const retention=expiredTicketFiles(planner,todayIST());planner=retention.planner;
    if(retention.ids.length){const removed=await tx.railFile.deleteMany({where:{userId,id:{in:retention.ids}}});deletedFiles=removed.count;}
    const files=planner.journeys.flatMap(j=>j.attachments??[]);
    if (new Set(files.map(f=>f.id)).size !== files.length) throw new ApiError(400,"Each attachment must belong to one journey.");
    const owned=await tx.railFile.findMany({where:{userId,id:{in:files.map(f=>f.id)}},select:{id:true,name:true,type:true,size:true}});
    if(files.some(f=>!owned.some(o=>o.id===f.id&&o.name===f.name&&o.type===f.type&&o.size===f.size)))throw new ApiError(400,"Upload the original ticket files before saving their details.","MISSING_ATTACHMENT");
    // Re-evaluate deferred jobs on the next worker pass when quiet-hour preferences change.
    if(JSON.stringify((await storedPlanner(tx,userId,current,[])).settings.quietHours)!==JSON.stringify(planner.settings.quietHours))await tx.railJob.updateMany({where:{userId,state:"PENDING",deferredUntil:{not:null}},data:{dueAt:new Date()}});
    const record=await tx.railWorkspace.update({where:{userId},data:{payload:workspacePayload(planner,current.storageVersion),version:{increment:1}}});
    await syncJourneyIndex(tx,userId,planner,record.version);
    return {planner:partial?{...planner,journeys:planner.journeys.filter(j=>input.journeys.some(i=>i.id===j.id))}:planner,revision:record.version};
  },{timeout:60000});
  if(deletedFiles)logger.info("tickets.retention_deleted",{files:deletedFiles});
  return result;
}

/** Loads account metadata without decrypting every journey on an already reconciled day. */
export async function loadWorkspaceMetadata(userId:string,now=new Date()){
  const row=await prisma.railWorkspace.findUnique({where:{userId}});
  if(row&&row.listVersion===row.version&&row.listDay===todayIST(now)&&!(row.storageVersion===1&&normalizedStorageEnabled())){
    const stored=JSON.parse(decryptSecret(row.listPayload)!);const policy=await getFeaturePolicy(),config=await getProviderConfiguration();
    const user=await prisma.user.findUniqueOrThrow({where:{id:userId}}),telegram=await prisma.railTelegram.findUnique({where:{userId}});
    const applied=applyAccountSettings(stored,policy,user.phoneNumber??"",telegram,telegramConfigured(config)?config.telegram!.id:undefined);
    if(sameContent(applied,stored))return {planner:applied,revision:row.version,partial:true};
  }
  const loaded=await loadWorkspace(userId,now);return {...loaded,planner:{...loaded.planner,journeys:[]},partial:true};
}
