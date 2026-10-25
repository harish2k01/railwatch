import {storedPlanner} from "./workspace-storage";
import { reminderJourneyId } from "./reminder-reference";
import { addDays,todayIST,type Planner } from "./travel-planner";
import { prisma } from "./db";
import { ApiError } from "./http";

/** Resolves the end of an opted-in IST quiet window, including windows crossing midnight. */
export function quietHoursResume(quiet:Planner["settings"]["quietHours"],now=new Date()) {
  if(!quiet?.enabled||quiet.start===quiet.end)return null;
  const minute=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  const overnight=quiet.start>quiet.end;
  const inside=overnight?minute>=quiet.start||minute<quiet.end:minute>=quiet.start&&minute<quiet.end;
  if(!inside)return null;
  const day=overnight&&minute>=quiet.start?addDays(todayIST(now),1):todayIST(now);
  return new Date(`${day}T${quiet.end}:00+05:30`);
}

/** Pauses or resumes only an owned, actionable journey without marking reminders read. */
export async function setJourneySnooze(userId:string,journeyId:string,minutes:number,now=new Date()) {
  if(![0,30,60,1440].includes(minutes))throw new ApiError(400,"Choose a supported snooze duration.","INVALID_INPUT");
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const workspace=await tx.railWorkspace.findUnique({where:{userId}});
    const journey=workspace?(await storedPlanner(tx,userId,workspace,[journeyId])).journeys.find(j=>j.id===journeyId):undefined;
    if(!journey)throw new ApiError(404,"Journey not found.","NOT_FOUND");
    if(minutes===0){
      await tx.railReminderPause.deleteMany({where:{userId,journeyId}});
      // Jobs retain their original identity and are checked again before delivery.
      const jobs=await tx.railJob.findMany({where:{userId,state:{in:["PENDING","FAILED"]},deferredUntil:{not:null}},select:{id:true,payload:true}});
      await tx.railJob.updateMany({where:{userId,id:{in:jobs.filter(j=>reminderJourneyId(j.payload)===journeyId).map(j=>j.id)}},data:{dueAt:now}});
      return {until:null};
    }
    if(journey.archivedAt||!["needs_booking","cancellation_needed"].includes(journey.status)||journey.date<todayIST(now))throw new ApiError(409,"This journey no longer needs reminders.","JOURNEY_NOT_ACTIONABLE");
    const until=new Date(now.getTime()+minutes*60000);
    await tx.railReminderPause.upsert({where:{userId_journeyId:{userId,journeyId}},create:{userId,journeyId,until},update:{until}});
    const deferred=await tx.railJob.findMany({where:{userId,state:{in:["PENDING","FAILED"]},deferredUntil:{not:null}},select:{id:true,payload:true}});
    // Shortening a snooze must bring existing deferred jobs forward too.
    await tx.railJob.updateMany({where:{userId,id:{in:deferred.filter(j=>reminderJourneyId(j.payload)===journeyId).map(j=>j.id)}},data:{dueAt:until,deferredUntil:until}});
    return {until};
  });
}
