"use client";
import {useEffect,useState} from "react";
import {apiRequest} from "@/lib/client-api";
import type {CalendarView,DashboardView} from "@/lib/planning-views";

/** Loads a selected planning view and ignores responses for obsolete dates or revisions. */
export function usePlanningView<T extends CalendarView|DashboardView>(query:string,revision:number,enabled:boolean){
  const [epoch,setEpoch]=useState(0),[result,setResult]=useState<{key:string;data:T}>(),[error,setError]=useState<{key:string;message:string}>(),[busy,setBusy]=useState(false);
  const key=query+":"+revision+":"+epoch;
  useEffect(()=>{if(!enabled)return;let live=true;void apiRequest<T>("/api/railwatch/views?"+query,{cache:"no-store"}).then(data=>{if(live){setResult({key,data});setError(undefined);}}).catch(e=>{if(live)setError({key,message:e.message});});return()=>{live=false;};},[enabled,key,query]);
  const sameDashboardRefresh=query.startsWith("view=dashboard&minute=")&&result?.key.startsWith("view=dashboard&minute=")&&result.key.endsWith(":"+revision+":"+epoch);
  const data=result?.key===key||sameDashboardRefresh?result?.data:undefined;
  /** Appends another calendar batch only while its account snapshot remains current. */
  async function more(){if(!data||!("nextCursor" in data)||!data.nextCursor||busy)return;setBusy(true);try{const params=new URLSearchParams(query);params.set("cursor",data.nextCursor);const next=await apiRequest<CalendarView>("/api/railwatch/views?"+params,{cache:"no-store"});setResult(old=>old?.key===key&&"journeys" in old.data?{key,data:{...next,journeys:[...old.data.journeys,...next.journeys]} as T}:old);}catch(e){setError({key,message:e instanceof Error?e.message:"Could not load this calendar."});}finally{setBusy(false);}}
  return {data,pending:enabled&&!data,error:error?.key===key?error.message:"",busy,more,refresh:()=>setEpoch(n=>n+1)};
}
