"use client";
import type { UserProfile } from "@/lib/feature-policy";
import { useEffect,useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client-api";
import type { Planner } from "@/lib/travel-planner";
import { Toast } from "./toast";
import { TravelPlanner } from "./planner";
import s from "./planner.module.css";
export type AccountWorkspace={planner:Planner;revision:number;partial?:boolean};
/** Loads the authenticated account workspace before rendering the planner. */
export function AccountApp({user}:{user:UserProfile}){
  const [dismissed,setDismissed]=useState(false);const [data,setData]=useState<AccountWorkspace>();const [error,setError]=useState("");
  useEffect(()=>{let live=true;apiRequest<AccountWorkspace>("/api/railwatch/workspace?partial=1",{cache:"no-store"}).then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  if(error)return <div className={s.loading}><div><h1>Could not load your workspace</h1>{!dismissed&&<Toast error message={error} dismiss={()=>setDismissed(true)}/>}<button onClick={()=>location.reload()}>Try again</button><Link href="/login">Sign in</Link></div></div>;
  if(!data)return <div className={s.loading}>Loading your plans…</div>;
  return <TravelPlanner account={{...user,...data}}/>;
}
