import {logger} from "./logger";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { encryptSecret } from "./crypto";
import { ApiError } from "./http";
import { getFeaturePolicy } from "./settings";
import { getProviderConfiguration,resolveProviderConfiguration,telegramConfigured } from "./provider-config";
import { receiveTelegramUpdate,telegramRequest,telegramUpdateSchema } from "./telegram";
// Single transient failures are expected; only repeated failures in this process are errors.
let consecutiveFailures=0;
/** Leases outgoing bot polling, processes pairing commands, and durably advances the update cursor. */
export async function pollTelegram(){
 const policy=await getFeaturePolicy(),config=await getProviderConfiguration();let bot=config.telegram;
 if(!policy.telegramEnabled||!policy.remindersEnabled||!bot||!telegramConfigured(config))return 0;
 const now=new Date(),lease=randomUUID();
 const acquired=await prisma.appSettings.updateMany({where:{id:"global",OR:[{telegramPollLease:null},{telegramPollUntil:{lte:now}}]},data:{telegramPollLease:lease,telegramPollUntil:new Date(now.getTime()+90000)}});
 if(!acquired.count)return 0;
 // Read the cursor after obtaining the lease: a previous worker may have just advanced it.
 const fresh=(await getProviderConfiguration()).telegram;
 if(!fresh||fresh.id!==bot.id){await prisma.appSettings.updateMany({where:{id:"global",telegramPollLease:lease},data:{telegramPollLease:null,telegramPollUntil:null}});return 0;}
 bot=fresh;
 let offset=bot.pollOffset??0,count=0,error:string|undefined,activated=Boolean(bot.polling);
 try{
  // Upgrade existing installations from webhooks without dropping pending messages.
  if(!activated){await telegramRequest(bot.botToken,"deleteWebhook",{drop_pending_updates:false});activated=true;}
  const updates=await telegramRequest<unknown[]>(bot.botToken,"getUpdates",{offset,timeout:0,limit:25,allowed_updates:["message"]});
  if(!Array.isArray(updates))throw new Error("Invalid Telegram update response");
  for(const raw of updates){if(Date.now()-now.getTime()>25000)break;const parsed=telegramUpdateSchema.safeParse(raw);if(!parsed.success){if(raw&&typeof raw==="object"&&"update_id" in raw&&Number.isSafeInteger(raw.update_id))offset=Math.max(offset,Number(raw.update_id)+1);continue;}
   let reply;try{reply=await receiveTelegramUpdate(parsed.data,bot);}catch(e){if(!(e instanceof ApiError)||e.status!==429)throw e;reply=null;}
   if(reply)await telegramRequest(bot.botToken,"sendMessage",{chat_id:reply.chat_id,text:reply.text});
   offset=Math.max(offset,parsed.data.update_id+1);count++;
  }
  consecutiveFailures=0;
 }catch(e){consecutiveFailures++;logger[consecutiveFailures>=3?"error":"warn"]("telegram.poll_failed",{errorType:e instanceof Error?e.name:"UnknownError",code:e instanceof ApiError?e.code:undefined,consecutiveFailures});error=e instanceof ApiError?e.message:"Telegram messages could not be checked. RailWatch will retry automatically.";}
 finally{
  await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "AppSettings" WHERE id='global' FOR UPDATE`;const settings=await tx.appSettings.findUniqueOrThrow({where:{id:"global"}});if(settings.telegramPollLease!==lease)return;const current=resolveProviderConfiguration(settings.providerConfig);if(current.telegram?.id===bot.id){current.telegram.pollOffset=offset;current.telegram.polling=activated;current.telegram.pollError=error;current.telegram.lastPolledAt=new Date().toISOString();await tx.appSettings.update({where:{id:"global"},data:{providerConfig:encryptSecret(JSON.stringify(current)),telegramPollLease:null,telegramPollUntil:null}});}else await tx.appSettings.update({where:{id:"global"},data:{telegramPollLease:null,telegramPollUntil:null}});});
 }
 if(count)logger.info("telegram.poll_completed",{messages:count});return count;
}
