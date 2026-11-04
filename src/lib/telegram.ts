import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./http";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { getProviderConfiguration, resolveProviderConfiguration, telegramConfigured, type TelegramConfiguration } from "./provider-config";
import { enforceRateLimit } from "./rate-limit";
export const /** Hashes one-time Telegram credentials before storage. */ tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const /** Hashes a Telegram chat identifier without persisting its raw value. */ telegramChatHash=(providerId:string,chatId:string)=>tokenHash(`${providerId}:${chatId}`);
/** Makes a bounded Telegram Bot API request without logging bot tokens or raw messages. */
export async function telegramRequest<T>(token:string,method:"getMe"|"deleteWebhook"|"getUpdates"|"sendMessage",body:object={}):Promise<T>{
 const send=()=>fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 // Retry one network failure for reads; a lost sendMessage response may already have delivered the message.
 let response:Response;try{response=await send();}catch{if(method==="sendMessage")throw new ApiError(502,"Telegram could not be reached. Try again.","TELEGRAM_UNAVAILABLE");try{response=await send();}catch{throw new ApiError(502,"Telegram could not be reached. Try again.","TELEGRAM_UNAVAILABLE");}}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.ok){
  const status=Number(data?.error_code??response.status);
  throw new ApiError(502,status===409?"Another application is reading this bot’s messages. Use a dedicated bot for RailWatch.":status===401?"Telegram rejected the bot token. Update it from BotFather.":status===429?"Telegram is temporarily limiting requests. RailWatch will retry automatically.":"Telegram rejected the request. Try again shortly.",`TELEGRAM_${status}`);
 }
 return data.result as T;
}
/** Sends a booking reminder to an already-linked account chat. */
export async function sendTelegram(chatId:string,message:string,providerId:string,url?:string){const config=await getProviderConfiguration();if(!telegramConfigured(config)||config.telegram?.id!==providerId)throw new ApiError(409,"Reconnect Telegram before sending reminders.");const result=await telegramRequest<{message_id:number}>(config.telegram.botToken,"sendMessage",{chat_id:chatId,text:message,...(url&&/^https:\/\//.test(url)?{reply_markup:{inline_keyboard:[[{text:"Open RailWatch",url}]]}}:{}),link_preview_options:{is_disabled:true}});if(!Number.isSafeInteger(result.message_id))throw new ApiError(502,"Telegram did not confirm the message.");return String(result.message_id);}
export const telegramUpdateSchema=z.object({update_id:z.number().int().nonnegative(),message:z.object({text:z.string().max(4096).optional(),chat:z.object({id:z.number().int().safe(),type:z.string()}),from:z.object({id:z.number().int().safe(),is_bot:z.boolean().optional(),username:z.string().max(100).optional()}).optional()}).optional()});
/** Validates private bot messages and consumes unexpired account pairing tokens. */
export async function receiveTelegramUpdate(update:z.infer<typeof telegramUpdateSchema>,config:TelegramConfiguration){
 const message=update.message;if(!message||message.chat.type!=="private"||!message.from||message.from.is_bot||message.from.id!==message.chat.id)return null;
 const chatId=String(message.chat.id),chatHash=telegramChatHash(config.id,chatId),match=message.text?.match(/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{43})$/),pair=message.text?.match(/^\/connect(?:@[A-Za-z0-9_]+)?\s+([A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4})\s*$/);
 if(message.text==="/start"||message.text==="/help"||message.text==="/connect")return {method:"sendMessage",chat_id:chatId,text:"🚆 Welcome to RailWatch!\n\nYour journeys. Right on time.\n\nGet reminders before booking opens for your planned train journeys.\n\nConnect your account:\n1. Sign in to RailWatch.\n2. Open User Settings → Connections → Pair With Code.\n3. Send /connect followed by your one-time code here.\n\nSend /stop to pause reminders. Book and cancel your tickets through IRCTC."};
 if(!match&&!pair&&message.text!=="/stop")return null;
 if(pair)await enforceRateLimit(new Request("https://railwatch.invalid"),"telegram:pair",5,60000,chatHash);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "AppSettings" WHERE id='global' FOR UPDATE`;
  const settings=await tx.appSettings.findUniqueOrThrow({where:{id:"global"}}),current=resolveProviderConfiguration(settings.providerConfig).telegram;
  if(!settings.telegramEnabled||!settings.remindersEnabled||current?.id!==config.id||!current.webhookReady)return null;
  if(message.text==="/stop"){const result=await tx.railTelegram.updateMany({where:{providerId:config.id,chatHash},data:{enabled:false,linkTokenHash:null,linkExpiresAt:null}});return result.count?{method:"sendMessage",chat_id:chatId,text:"Telegram booking reminders are paused. You can reconnect or enable them in RailWatch User Settings."}:null;}
  const connection=await tx.railTelegram.findFirst({where:{providerId:config.id,linkTokenHash:tokenHash(pair?pair[1].replaceAll("-","").toUpperCase():match![1]),linkExpiresAt:{gt:new Date()},user:{isActive:true}}});if(!connection)return {method:"sendMessage",chat_id:chatId,text:"This connection code is invalid or expired. Generate a new code in RailWatch User Settings → Connections."};
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${connection.userId} FOR UPDATE`;
  const occupied=await tx.railTelegram.findUnique({where:{chatHash}});if(occupied&&occupied.userId!==connection.userId)return {method:"sendMessage",chat_id:chatId,text:"This Telegram account is linked to another RailWatch account. Disconnect it there before switching accounts."};
  const claimed=await tx.railTelegram.updateMany({where:{userId:connection.userId,linkTokenHash:connection.linkTokenHash,linkExpiresAt:{gt:new Date()}},data:{chatId:encryptSecret(chatId),chatHash,username:message.from!.username??null,enabled:true,linkTokenHash:null,linkExpiresAt:null,authStateHash:null,authPayload:null,authExpiresAt:null}});
  return claimed.count?{method:"sendMessage",chat_id:chatId,text:"Telegram is connected to RailWatch. Booking reminders are enabled using your personal reminder preferences. Send /stop to pause them."}:null;
 });
}
/** Links the verified Telegram chat to the account and invalidates competing ownership. */
export async function bindTelegramAccount(userId:string,chatId:string,username:string|null,bot:TelegramConfiguration,credentialHash:string){
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "AppSettings" WHERE id='global' FOR UPDATE`;
  const settings=await tx.appSettings.findUniqueOrThrow({where:{id:"global"}}),current=resolveProviderConfiguration(settings.providerConfig).telegram;
  if(!settings.telegramEnabled||!settings.remindersEnabled||!current?.webhookReady||current.id!==bot.id||tokenHash(`${current.clientId}:${current.clientSecret}`)!==credentialHash)throw new ApiError(409,"Telegram setup changed. Connect again.");
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:userId}});if(!user?.isActive)throw new ApiError(403,"Account unavailable.");
  const chatHash=telegramChatHash(bot.id,chatId),occupied=await tx.railTelegram.findUnique({where:{chatHash}});
  if(occupied&&occupied.userId!==userId)throw new ApiError(409,"This Telegram account is connected to another RailWatch account.");
  const data={providerId:bot.id,chatId:encryptSecret(chatId),chatHash,username,enabled:true,linkTokenHash:null,linkExpiresAt:null,authStateHash:null,authPayload:null,authExpiresAt:null};
  const existing=await tx.railTelegram.findUnique({where:{userId}});if(!existing||existing.providerId!==bot.id||existing.authStateHash||existing.linkTokenHash)throw new ApiError(409,"Connection cancelled or replaced. Try again.");
  await tx.railTelegram.update({where:{userId},data});
 });
}
/** Resolves the active account recipient for the currently configured bot. */
export function telegramRecipient(connection:{chatId:string|null;enabled:boolean;providerId:string}|null,providerId?:string){return connection?.enabled&&connection.providerId===providerId?decryptSecret(connection.chatId)??"":"";}
