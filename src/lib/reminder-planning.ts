import type {Prisma} from "@prisma/client";
import type {reminderJobs} from "./railwatch-jobs";
import type {FeaturePolicy} from "./feature-policy";
import {prisma} from "./db";
import {encryptSecret,decryptSecret} from "./crypto";
import {loadWorkspaceMetadata,applyAccountSettings} from "./railwatch-store";
import {storedPlanner} from "./workspace-storage";
import {todayIST,type Journey} from "./travel-planner";
import {planCurrentNotifications} from "./current-notifications";

export const ACCOUNT_BATCH_SIZE=20;
/** Resumes a persistent account sweep without materializing every workspace in memory. */
export async function nextAccountBatch(){
  const state=await prisma.railOperations.findUnique({where:{id:"scheduler"},select:{accountCursor:true}});
  const query=(after?:string|null)=>prisma.railWorkspace.findMany({where:after?{userId:{gt:after}}:{},orderBy:{userId:"asc"},take:ACCOUNT_BATCH_SIZE+1,select:{userId:true}});
  let rows=await query(state?.accountCursor);if(!rows.length&&state?.accountCursor)rows=await query();
  return {accounts:rows.slice(0,ACCOUNT_BATCH_SIZE),cursor:rows.length>ACCOUNT_BATCH_SIZE?rows[ACCOUNT_BATCH_SIZE-1].userId:null};
}
/** Marks current job identities and creates them in bounded SQL batches under the account lock. */
async function persistJobs(tx:Prisma.TransactionClient,userId:string,generation:number,jobs:ReturnType<typeof reminderJobs>,now:Date){
  for(let i=0;i<jobs.length;i+=500){const chunk=jobs.slice(i,i+500),keys=chunk.map(j=>j.key),missed=chunk.filter(j=>j.dueAt.getTime()<now.getTime()-86400000).map(j=>j.key);
    await tx.railJob.updateMany({where:{userId,state:"CANCELLED",key:{in:keys}},data:{state:"PENDING",attempts:0,lastError:null,lease:null,leaseUntil:null,retryRequestedAt:null,deferredUntil:null}});
    await tx.railJob.updateMany({where:{userId,state:{in:["PENDING","FAILED","MISSED","SENDING"]},key:{in:keys}},data:{planGeneration:generation}});
    await tx.railJob.updateMany({where:{userId,state:{in:["PENDING","FAILED"]},retryRequestedAt:null,deferredUntil:null,key:{in:missed}},data:{state:"MISSED",lease:null,leaseUntil:null,lastError:"The scheduled time passed before this reminder could be delivered."}});
    await tx.railJob.createMany({data:chunk.map(({key,kind,dueAt,message,journeyId})=>({userId,key,kind,dueAt,planGeneration:generation,state:missed.includes(key)?"MISSED":"PENDING",payload:encryptSecret(JSON.stringify({message,journeyId,reminderType:message.startsWith("Cancel your ticket")?"cancellation":"booking"}))})),skipDuplicates:true});
  }
}
/** Plans one account from current settings and 200-record journey batches without a giant key list. */
export async function planAccountReminders(userId:string,policy:FeaturePolicy,telegramProviderId:string|undefined,now:Date,jobsFor:typeof reminderJobs){
  await loadWorkspaceMetadata(userId,now);
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const row=await tx.railWorkspace.findUniqueOrThrow({where:{userId}}),owner=await tx.user.findUniqueOrThrow({where:{id:userId}});
    if(!owner.isActive){await tx.railJob.updateMany({where:{userId,state:{in:["PENDING","FAILED","MISSED"]}},data:{state:"CANCELLED",lease:null,leaseUntil:null}});return;}
    const metadata=applyAccountSettings(await storedPlanner(tx,userId,row,[]),policy,owner.phoneNumber??"",await tx.railTelegram.findUnique({where:{userId}}),telegramProviderId);
    const devices=(await tx.railPush.findMany({where:{userId},select:{id:true}})).map(d=>d.id);
    const generation=row.planGeneration+1;
    const plan=async(journeys:Journey[])=>{const actual=policy.remindersEnabled?jobsFor({...metadata,journeys},now,owner.emailVerifiedAt?owner.email:undefined,devices).filter(j=>(j.kind!=="WHATSAPP"||policy.whatsappEnabled)&&(j.kind!=="TELEGRAM"||policy.telegramEnabled)):[];await persistJobs(tx,userId,generation,actual,now);if(policy.remindersEnabled)await planCurrentNotifications(tx,userId,{...metadata,journeys},now);};
    if(row.storageVersion===2){let after:string|undefined;for(;;){const rows=await tx.railJourney.findMany({where:{userId,archived:false,status:{in:["needs_booking","cancellation_needed","booked"]},date:{gte:todayIST(now)},...(after?{id:{gt:after}}:{})},orderBy:{id:"asc"},take:200,select:{id:true,payload:true}});if(!rows.length)break;await plan(rows.map(j=>JSON.parse(decryptSecret(j.payload)!) as Journey));after=rows.at(-1)!.id;if(rows.length<200)break;}}
    else {const full=await storedPlanner(tx,userId,row);for(let i=0;i<full.journeys.length;i+=200)await plan(full.journeys.slice(i,i+200));}
    await tx.railReminderPause.deleteMany({where:{userId,until:{lte:now}}});
    await tx.railJob.updateMany({where:{userId,state:{in:["PENDING","FAILED","MISSED"]},OR:[{planGeneration:null},{planGeneration:{not:generation}}]},data:{state:"CANCELLED",lease:null,leaseUntil:null}});
    await tx.railWorkspace.update({where:{userId},data:{planGeneration:generation}});
  },{timeout:60000});
}
