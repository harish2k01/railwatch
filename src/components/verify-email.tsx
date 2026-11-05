"use client";
import Link from "next/link";
import {useState} from "react";
import {apiRequest} from "@/lib/client-api";
import {Toast} from "./travel-planner/toast";
/** Confirms email ownership only after the recipient explicitly presses the confirmation button. */
export function VerifyEmail({token}:{token?:string}){
  const [busy,setBusy]=useState(false),[verified,setVerified]=useState(false),[error,setError]=useState("");
  return <main className="mx-auto mt-24 grid max-w-md gap-6 rounded-xl border p-8"><h1 className="text-2xl font-bold">Verify your RailWatch email</h1><p>{verified?"Your email is verified. You can now enable email booking reminders in User Settings → Connections.":"Confirm this email address to receive booking reminders. This link expires in 24 hours."}</p>{!verified&&<button disabled={busy||!token} className="rounded-lg bg-purple-600 p-3 text-white disabled:opacity-50" onClick={async()=>{setBusy(true);setError("");try{await apiRequest("/api/auth/verify-email",{method:"POST",body:JSON.stringify({token})});setVerified(true);history.replaceState(null,"","/verify-email");}catch(e){setError(e instanceof Error?e.message:"Could not verify email.");}finally{setBusy(false);}}}>{busy?"Verifying…":"Verify email"}</button>}{!token&&!verified&&<p>Request a new verification link from User Settings → Profile.</p>}<Link href="/">Return to RailWatch</Link>{error&&<Toast error message={error} dismiss={()=>setError("")}/>}</main>;
}
