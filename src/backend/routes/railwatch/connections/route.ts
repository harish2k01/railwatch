import {getProviderConfiguration,googleConfigured,telegramConfigured,telegramLoginConfigured} from "@/lib/provider-config";
import {getDeliveryConfiguration,getFeaturePolicy} from "@/lib/settings";
import {decryptSecret} from "@/lib/crypto";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {ApiError,assertSameOrigin,jsonData,parseJson,routeError} from "@/lib/http";
import {whatsappReady} from "@/lib/railwatch-providers";
import {googleReady} from "@/lib/railwatch-google";

/** Returns account connection readiness without exposing delivery records or provider secrets. */
export async function GET(request:Request){try{
  const user=await requireUser(),policy=await getFeaturePolicy(),config=await getProviderConfiguration();
  const [telegram,google,delivery]=await Promise.all([
    prisma.railTelegram.findUnique({where:{userId:user.id},select:{providerId:true,enabled:true,username:true,chatId:true,linkTokenHash:true,linkExpiresAt:true}}),
    prisma.railGoogle.findUnique({where:{userId:user.id},select:{enabled:true,syncedAt:true,lastError:true,calendarId:true}}),
    getDeliveryConfiguration(),
  ]);
  const current=telegram?.providerId===config.telegram?.id;
  return jsonData({emailReady:Boolean(delivery.smtpUrl),emailVerified:user.emailVerified,
    telegramPairingPending:Boolean(current&&telegram?.linkTokenHash&&telegram.linkExpiresAt&&telegram.linkExpiresAt>new Date()),
    telegramLoginReady:policy.telegramEnabled&&telegramLoginConfigured(config),telegramBotUsername:config.telegram?.botUsername??"",
    telegramReady:policy.telegramEnabled&&telegramConfigured(config),telegram:current&&telegram?.chatId?{enabled:telegram.enabled,username:telegram.username}:null,
    policy,whatsappReady:policy.whatsappEnabled&&await whatsappReady(),googleReady:policy.googleCalendarEnabled&&await googleReady(),google});
}catch(error){return routeError(error,request);}}

/** Updates only the authenticated account's current Google Calendar connection. */
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await requireUser();
  const input=await parseJson(request,z.object({googleEnabled:z.boolean()}).strict());
  if(!(await getFeaturePolicy()).googleCalendarEnabled)throw new ApiError(403,"Google Calendar is disabled by the administrator.","FEATURE_DISABLED");
  if(input.googleEnabled){const config=await getProviderConfiguration();const connection=await prisma.railGoogle.findUnique({where:{userId:user.id}});
    if(!googleConfigured(config)||!connection||JSON.parse(decryptSecret(connection.tokens)!).providerId!==config.google?.id)throw new ApiError(400,"Reconnect Google Calendar before resuming sync.","GOOGLE_RECONNECT_REQUIRED");
  }
  await prisma.railGoogle.updateMany({where:{userId:user.id},data:{enabled:input.googleEnabled}});
  return jsonData({saved:true});
}catch(error){return routeError(error,request);}}
