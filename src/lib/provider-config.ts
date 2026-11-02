import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import { getAppSettings } from "./settings";
import { ApiError } from "./http";

export type GoogleConfiguration = { clientId: string; clientSecret: string; id: string };
export type WhatsAppConfiguration = { accessToken: string; phoneNumberId: string; apiVersion: string; templateName: string; cancellationTemplateName?:string; language: string };
export type TelegramConfiguration = {botToken:string;botUsername:string;id:string;webhookSecret:string;webhookReady:boolean;clientId?:string;clientSecret?:string;polling?:boolean;pollOffset?:number;pollError?:string;lastPolledAt?:string};
export type ProviderConfiguration = { telegram?:TelegramConfiguration|null; google?: GoogleConfiguration | null; whatsapp?: WhatsAppConfiguration | null };
const secret = z.string().trim().min(1).max(4096).refine(value=>!/[\x00-\x1f\x7f]/.test(value),"Remove line breaks from the credential.").optional();
export const providerUpdateSchema = z.object({
  telegram:z.object({clientId:z.string().trim().regex(/^\d{5,15}$/).optional(),clientSecret:secret,clearLogin:z.boolean().optional(),botToken:z.string().trim().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,100}$/).optional(),botUsername:z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/).refine(v=>v.toLowerCase().endsWith("bot"),"Use the bot username ending in bot, without @.")}).strict().nullable().optional(),
  google: z.object({clientId:z.string().trim().min(1).max(512).regex(/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/),clientSecret:secret}).strict().nullable().optional(),
}).strict().refine(v=>v.telegram!==undefined||v.google!==undefined,"Choose a provider to update.");

/** Loads encrypted provider settings with supported environment and legacy configuration fallbacks. */
export function resolveProviderConfiguration(payload: string | null, env: Record<string,string|undefined> = process.env): ProviderConfiguration {
  const saved:ProviderConfiguration=payload?JSON.parse(decryptSecret(payload)!):{};
  return {
    telegram:saved.telegram??null,
    google:saved.google!==undefined?saved.google:env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET?{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,id:"environment"}:null,
    whatsapp:saved.whatsapp??null,
  };
}
/** Returns the current decrypted provider configuration for backend use only. */
export async function getProviderConfiguration(){return resolveProviderConfiguration((await getAppSettings()).providerConfig);}
/** Checks whether the instance has the required Google OAuth credentials. */
export function googleConfigured(c:ProviderConfiguration){return Boolean(c.google?.clientId&&c.google.clientSecret&&process.env.APP_URL);}
/** Checks whether the configured bot is ready for outgoing Telegram requests. */
export function telegramConfigured(c:ProviderConfiguration){return Boolean(c.telegram?.botToken&&c.telegram.webhookReady&&c.telegram.botUsername);}
/** Checks whether Telegram authorization credentials are complete. */
export function telegramLoginConfigured(c:ProviderConfiguration){return Boolean(telegramConfigured(c)&&c.telegram?.clientId&&c.telegram.clientSecret);}
/** Builds the canonical browser return URL for Telegram authorization. */
export function telegramLoginRedirect(){return new URL("/api/railwatch/telegram/callback",process.env.APP_URL??"http://localhost").href;}
/** Returns provider availability and non-secret display metadata to administrators. */
export function providerSummary(c:ProviderConfiguration){return {telegram:{loginConfigured:telegramLoginConfigured(c),clientId:c.telegram?.clientId??"",clientSecretStored:Boolean(c.telegram?.clientSecret),loginRedirectUri:telegramLoginRedirect(),botUsername:c.telegram?.botUsername??"",tokenStored:Boolean(c.telegram?.botToken),configured:telegramConfigured(c),deliveryMode:"polling",pollingActive:Boolean(c.telegram?.polling),pollError:c.telegram?.pollError??null,lastPolledAt:c.telegram?.lastPolledAt??null},google:{clientId:c.google?.clientId??"",configured:googleConfigured(c),secretStored:Boolean(c.google?.clientSecret),redirectUri:process.env.APP_URL?new URL("/api/railwatch/google/callback",process.env.APP_URL).href:""}};}
/** Validates provider updates, retains unchanged secrets, and invalidates obsolete account connections. */
export function updateProviderConfiguration(current:ProviderConfiguration,input:z.infer<typeof providerUpdateSchema>){
  const next={...current};
  if(input.telegram!==undefined){if(input.telegram===null)next.telegram=null;else{const botToken=input.telegram.botToken??current.telegram?.botToken;if(!botToken)throw new ApiError(400,"Enter the Telegram bot token.");const changed=botToken!==current.telegram?.botToken||input.telegram.botUsername!==current.telegram?.botUsername;const clientId=input.telegram.clearLogin?undefined:input.telegram.clientId??(changed?undefined:current.telegram?.clientId);const clientSecret=input.telegram.clearLogin?undefined:input.telegram.clientSecret??(changed?undefined:current.telegram?.clientSecret);if(clientId&&(!clientSecret||clientId!==current.telegram?.clientId&&!input.telegram.clientSecret))throw new ApiError(400,"Enter the Telegram login client secret for this client ID.");if(clientId&&clientId!==botToken.split(":")[0])throw new ApiError(400,"The Telegram login client ID must match this bot ID.");next.telegram={...(changed?{}:current.telegram),clientId,clientSecret,botToken,botUsername:input.telegram.botUsername,id:changed?randomUUID():current.telegram!.id,webhookSecret:changed?randomBytes(32).toString("base64url"):current.telegram!.webhookSecret,webhookReady:changed?false:current.telegram!.webhookReady};}}

  if(input.google!==undefined){if(input.google===null)next.google=null;else{if(input.google.clientId!==current.google?.clientId&&!input.google.clientSecret)throw new ApiError(400,"Enter the client secret for this Google client.");const clientSecret=input.google.clientSecret??current.google?.clientSecret;if(!clientSecret)throw new ApiError(400,"Enter the Google client secret.");const changed=input.google.clientId!==current.google?.clientId||clientSecret!==current.google?.clientSecret;next.google={clientId:input.google.clientId,clientSecret,id:changed?randomUUID():current.google!.id};}}
  return {next,payload:encryptSecret(JSON.stringify(next)),telegramChanged:next.telegram?.id!==current.telegram?.id,googleChanged:next.google?.id!==current.google?.id};
}
