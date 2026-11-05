import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { ApiError } from "./http";
import { loadWorkspaceMetadata, saveWorkspace } from "./railwatch-store";
import { transitionJourney, type Journey } from "./travel-planner";

/** Marks a planned journey booked from a notification action (plan 3.7); only for row-based storage, where a one-journey patch is safe. */
export async function markJourneyBooked(userId:string,journeyId:string){
  const mode=await prisma.railWorkspace.findUnique({where:{userId},select:{storageVersion:true}});
  if(mode?.storageVersion!==2)throw new ApiError(409,"Open RailWatch to mark this journey booked.","OPEN_APP");
  const row=await prisma.railJourney.findUnique({where:{userId_id:{userId,id:journeyId}},select:{payload:true}});
  if(!row)throw new ApiError(404,"Journey not found.","NOT_FOUND");
  const journey=JSON.parse(decryptSecret(row.payload)!) as Journey;
  if(journey.status!=="needs_booking")return {changed:false,status:journey.status};
  const meta=await loadWorkspaceMetadata(userId);
  await saveWorkspace(userId,{...meta.planner,journeys:[transitionJourney(journey,"booked")]},meta.revision,{...meta.planner,journeys:[journey]},true);
  return {changed:true,status:"booked"};
}
