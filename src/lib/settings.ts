import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
/** Ensures the singleton instance settings record exists and returns it. */
export async function getAppSettings(){await prisma.appSettings.createMany({data:[{id:"global"}],skipDuplicates:true});return prisma.appSettings.findUniqueOrThrow({where:{id:"global"}});}
/** Resolves backend SMTP delivery settings without exposing them to the browser. */
export async function getDeliveryConfiguration(){const settings=await getAppSettings();return {...settings,smtpUrl:decryptSecret(settings.smtpUrl)??process.env.SMTP_URL,emailFrom:settings.emailFrom??process.env.EMAIL_FROM??"RailWatch <noreply@example.com>"};}

import type { FeaturePolicy } from "./feature-policy";
/** Projects instance settings into the non-secret feature policy. */
export function publicPolicy(s:Omit<FeaturePolicy,"weekStartsOn"|"routineHorizonMode">&{weekStartsOn:number;routineHorizonMode:string}):FeaturePolicy{return {weekStartsOn:s.weekStartsOn===1?1:0,routineHorizonMode:s.routineHorizonMode==="count"?"count":"months",routineMonthsAhead:s.routineMonthsAhead,routineTicketCount:s.routineTicketCount,allowSignups:s.allowSignups,bookingWindowDays:s.bookingWindowDays,remindersEnabled:s.remindersEnabled,telegramEnabled:s.telegramEnabled,whatsappEnabled:false,googleCalendarEnabled:s.googleCalendarEnabled,ticketUploadsEnabled:s.ticketUploadsEnabled,calendarExportEnabled:s.calendarExportEnabled};}
/** Loads shared instance limits and enabled features. */
export async function getFeaturePolicy(){return publicPolicy(await getAppSettings());}
