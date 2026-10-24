import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameOrigin,jsonData,parseJson,routeError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { reminderHealth,retryReminder } from "@/lib/reminder-operations";
import { decryptSecret } from "@/lib/crypto";

/** Lists recent recoverable reminders and scheduler health without decrypted ticket data. */
export async function GET(request:Request) {
  try {
    await requireAdmin();
    const url=new URL(request.url),cursor=z.string().max(128).nullable().parse(url.searchParams.get("cursor"));
    const jobs=await prisma.railJob.findMany({where:{kind:{not:"IN_APP"},state:{in:["MISSED","FAILED"]}},orderBy:{id:"desc"},take:26,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,kind:true,state:true,dueAt:true,attempts:true,lastError:true,payload:true,user:{select:{name:true}}}});
    return jsonData({health:await reminderHealth(),jobs:jobs.slice(0,25).map(({payload,...job})=>{
      // Only the generated reminder text identifies its route/date, never the raw payload.
      const details=payload?JSON.parse(decryptSecret(payload)!):{};
      return {...job,message:typeof details.message==="string"?details.message.slice(0,512):"Journey reference unavailable."};
    }),nextCursor:jobs.length>25?jobs[24].id:null});
  }catch(error){return routeError(error,request);}
}

/** Queues one audited, rate-limited retry; provider delivery remains in the scheduler. */
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);const actor=await requireAdmin();
    await enforceRateLimit(request,"reminder:retry:"+actor.id,20,60000);
    const input=await parseJson(request,z.object({id:z.string().min(1).max(128)}).strict(),1024);
    return jsonData(await retryReminder(input.id,actor.id));
  }catch(error){return routeError(error,request);}
}
