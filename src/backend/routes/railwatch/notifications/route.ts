import {reminderJourneyId} from "@/lib/in-app-notifications";
import {storedPlanner} from "@/lib/workspace-storage";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { todayIST } from "@/lib/travel-planner";
import { dismissInAppReminder } from "@/lib/in-app-notifications";
import { setJourneySnooze } from "@/lib/notification-controls";
import { assertSameOrigin,jsonData,parseJson,routeError,ApiError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";

/** Returns a bounded page of this account's delivery outcomes without provider secrets. */
export async function GET(request:Request){try{
  const user=await requireUser();
  const params=new URL(request.url).searchParams;const cursor=params.get("cursor"),journeyId=params.get("journeyId");
  if(journeyId&&journeyId.length>128)throw new ApiError(400,"Invalid journey.","INVALID_INPUT");
  const scope=journeyId?await prisma.railWorkspace.findUnique({where:{userId:user.id}}):null;
  if(journeyId&&(!scope||!(await storedPlanner(prisma,user.id,scope,[journeyId])).journeys.some(j=>j.id===journeyId)))throw new ApiError(404,"Journey not found.","NOT_FOUND");
  const limit=journeyId?100:25;
  if(cursor&&cursor.length>128)throw new ApiError(400,"Invalid history cursor.","INVALID_INPUT");
  // A cursor must belong to this account; identifiers never authorize access.
  if(cursor&&!await prisma.railJob.findFirst({where:{id:cursor,userId:user.id},select:{id:true}}))throw new ApiError(400,"Refresh notification history.","INVALID_CURSOR");
  const rows=await prisma.railJob.findMany({where:{userId:user.id,...(!journeyId?{state:{in:["SENT","SUPPRESSED","CANCELLED","FAILED","MISSED"]}}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const now=new Date();
  const [workspace,pauses]=await Promise.all([prisma.railWorkspace.findUnique({where:{userId:user.id}}),prisma.railReminderPause.findMany({where:{userId:user.id,until:{gt:now}}})]);
  const journeys=workspace?(await storedPlanner(prisma,user.id,workspace,[...pauses.map(p=>p.journeyId),...rows.map(j=>reminderJourneyId(j.payload)).filter((id):id is string=>Boolean(id))])).journeys:[];
  const items=rows.slice(0,limit).filter(job=>!journeyId||reminderJourneyId(job.payload)===journeyId).map(job=>{
    const details=JSON.parse(decryptSecret(job.payload)??"{}");
    const journey=journeys.find(j=>j.id===details.journeyId);
    return {id:job.id,kind:job.kind,state:job.state,dueAt:job.dueAt,sentAt:job.sentAt,readAt:job.readAt,attempts:job.attempts,lastError:job.lastError,message:String(details.message??"Reminder"),journeyId:typeof details.journeyId==="string"?details.journeyId:null,
      canSnooze:Boolean(journey&&!journey.archivedAt&&["needs_booking","cancellation_needed"].includes(journey.status)&&journey.date>=todayIST(now)),
      canRead:!job.readAt&&(job.state==="FAILED"||job.state==="MISSED"||job.kind==="IN_APP"&&job.state==="SENT"),
      pausedUntil:pauses.find(p=>p.journeyId===details.journeyId)?.until??null};
  });
  const pausedJourneys=pauses.filter(p=>!journeyId||p.journeyId===journeyId).flatMap(p=>{const j=journeys.find(j=>j.id===p.journeyId);return j?[{journeyId:j.id,from:j.from,to:j.to,date:j.date,until:p.until}]:[];});
  return jsonData({items,pausedJourneys,nextCursor:rows.length>limit?rows[limit-1].id:null});
}catch(error){return routeError(error,request);}}

/** Acknowledges an owned notification or pauses/resumes an owned journey's reminders. */
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await requireUser();
  await enforceRateLimit(request,"notification-controls",30,60000,user.id);
  const input=await parseJson(request,z.discriminatedUnion("action",[
    z.object({action:z.literal("read"),id:z.string().min(1).max(128)}).strict(),
    z.object({action:z.literal("snooze"),journeyId:z.string().min(1).max(128),minutes:z.union([z.literal(30),z.literal(60),z.literal(1440)])}).strict(),
    z.object({action:z.literal("resume"),journeyId:z.string().min(1).max(128)}).strict(),
  ]));
  if(input.action==="read"){await dismissInAppReminder(user.id,input.id);return jsonData({saved:true});}
  return jsonData(await setJourneySnooze(user.id,input.journeyId,input.action==="resume"?0:input.minutes));
}catch(error){return routeError(error,request);}}
