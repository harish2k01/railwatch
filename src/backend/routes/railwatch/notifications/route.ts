import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {setJourneySnooze} from "@/lib/notification-controls";
import {assertSameOrigin,jsonData,parseJson,routeError} from "@/lib/http";
import {enforceRateLimit} from "@/lib/rate-limit";

/** Preserves owned snooze/resume controls without serving a notification feed. */
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await requireUser();
  await enforceRateLimit(request,"notification-controls",30,60000,user.id);
  const input=await parseJson(request,z.discriminatedUnion("action",[
    z.object({action:z.literal("snooze"),journeyId:z.string().min(1).max(128),minutes:z.union([z.literal(30),z.literal(60),z.literal(1440)])}).strict(),
    z.object({action:z.literal("resume"),journeyId:z.string().min(1).max(128)}).strict(),
  ]));
  return jsonData(await setJourneySnooze(user.id,input.journeyId,input.action==="resume"?0:input.minutes));
}catch(error){return routeError(error,request);}}
