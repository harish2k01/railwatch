import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {ApiError,assertSameOrigin,jsonData,parseJson,routeError} from "@/lib/http";
import {loadWorkspace,saveWorkspace} from "@/lib/railwatch-store";
import {ruleSchema,saveLinkedRule,saveRule,todayIST} from "@/lib/travel-planner";
import {previewRoutineChange} from "@/lib/routine-overview";
/** Previews or applies owned routine changes against canonical occurrences and the reviewed revision. */
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await requireUser();
  const input=await parseJson(request,z.object({revision:z.number().int().min(1),action:z.enum(["preview","save","pause","resume","remove"]),id:z.string().optional(),rule:ruleSchema.optional(),baseRule:ruleSchema.optional()}));
  const current=await loadWorkspace(user.id);
  if(current.revision!==input.revision)throw new ApiError(409,"Your plans changed in another session. Refresh before saving.","VERSION_CONFLICT");
  const today=todayIST(),existing=current.planner.rules.find(r=>r.id===input.id);
  if(input.action==="preview"){
    const original=current.planner.rules.find(rule=>rule.id===input.rule?.id);
    if((original||input.baseRule)&&(!original||!input.baseRule||JSON.stringify(ruleSchema.parse(original))!==JSON.stringify(input.baseRule)))throw new ApiError(409,"This routine changed in another session. Reopen the latest routine before reviewing.","VERSION_CONFLICT");
  }
  let next=current.planner;
  if(input.action==="save"||input.action==="preview"){if(!input.rule)throw new ApiError(400,"Choose a valid routine.","INVALID_ROUTINE");try{next=saveLinkedRule(next,input.rule,today);}catch(e){throw new ApiError(400,e instanceof Error?e.message:"Choose a valid routine.","INVALID_ROUTINE");}if(input.action==="preview")return jsonData({revision:current.revision,...previewRoutineChange(current.planner,next,input.rule.id,today)});}
  else {if(!existing)throw new ApiError(404,"Routine not found.","NOT_FOUND");if(input.action==="remove")next={...next,rules:next.rules.filter(r=>r.id!==existing.id).map(r=>r.linkedRuleId===existing.id?{...r,linkedRuleId:undefined}:r),journeys:next.journeys.filter(j=>j.ruleId!==existing.id||j.status!=="needs_booking"||j.manualOverride||j.date<today)};else next=saveRule(next,{...existing,paused:input.action==="pause"},today);}
  const saved=await saveWorkspace(user.id,next,current.revision,current.planner);
  return jsonData({...saved,planner:{...saved.planner,journeys:[]},partial:true});
}catch(e){return routeError(e,request);}}
