import {smtpConnectionSchema,smtpConnectionUrl,smtpSummary} from "@/lib/smtp-configuration";
import {getDeliveryConfiguration} from "@/lib/settings";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { getAppSettings,publicPolicy } from "@/lib/settings";
import { ApiError,assertSameOrigin,jsonData,parseJson,routeError } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
const schema=z.object({weekStartsOn:z.union([z.literal(0),z.literal(1)]),routineHorizonMode:z.enum(["months","count"]),routineMonthsAhead:z.number().int().min(1).max(24),routineTicketCount:z.number().int().min(1).max(100),allowSignups:z.boolean(),bookingWindowDays:z.number().int().min(1).max(365),remindersEnabled:z.boolean(),telegramEnabled:z.boolean(),whatsappEnabled:z.boolean(),googleCalendarEnabled:z.boolean(),ticketUploadsEnabled:z.boolean(),calendarExportEnabled:z.boolean(),smtpConnection:smtpConnectionSchema.optional(),smtpUrl:z.string().max(2048).optional().refine(v=>!v||/^smtps?:\/\//.test(v),"Use an SMTP or SMTPS URL."),emailFrom:z.string().max(254).optional()}).strict().partial().refine(value=>Object.keys(value).length>0,"Choose settings to update.");
/** Returns administrator-visible instance settings without SMTP secrets. */
export async function GET(request:Request){try{await requireAdmin();const s=await getAppSettings();const delivery=await getDeliveryConfiguration();return jsonData({smtpConnection:smtpSummary(delivery.smtpUrl),...publicPolicy(s),smtpConfigured:Boolean(s.smtpUrl||process.env.SMTP_URL),emailFrom:s.emailFrom??process.env.EMAIL_FROM??""});}catch(e){return routeError(e,request);}}
/** Persists the submitted instance settings group and records an audit event. */
export async function PATCH(request:Request){try{assertSameOrigin(request);const actor=await requireAdmin();const input=await parseJson(request,schema,4096);const {smtpUrl,smtpConnection,...data}=input;if(smtpUrl!==undefined&&smtpConnection)throw new ApiError(400,"Choose one SMTP connection format.","INVALID_INPUT");const current=await getDeliveryConfiguration();const connection=smtpConnection?smtpConnectionUrl(smtpConnection,current.smtpUrl):smtpUrl;const saved=await prisma.appSettings.update({where:{id:"global"},data:{...data,...(connection===undefined?{}:{smtpUrl:connection?encryptSecret(connection):null})}});await writeAudit({actorId:actor.id,action:"settings.updated",targetType:"AppSettings",targetId:"global",request});return jsonData(publicPolicy(saved));}catch(e){return routeError(e,request);}}
