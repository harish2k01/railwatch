import {requireUser} from "@/lib/auth";
import {jsonData,routeError} from "@/lib/http";
import {planningQuerySchema,readPlanningView} from "@/lib/planning-views";
/** Reads owned dashboard summaries or bounded visible-range calendar records. */
export async function GET(request:Request){try{return jsonData(await readPlanningView((await requireUser()).id,planningQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))));}catch(e){return routeError(e,request);}}
