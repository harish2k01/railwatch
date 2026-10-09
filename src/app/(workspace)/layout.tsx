import { headers } from "next/headers";
import { safeJourneyDestination } from "@/lib/journey-links";
import { redirect } from "next/navigation";
import { Manrope } from "next/font/google";
import { getSessionState } from "@/lib/backend-client";

import { AccountApp } from "@/components/travel-planner/account-app";
const font=Manrope({subsets:["latin"],variable:"--font-railwatch",display:"swap"});
export const dynamic="force-dynamic";
/** Loads the authenticated account context shared by workspace pages. */
export default async function Layout({children}:{children:React.ReactNode}){const {user,policy}=await getSessionState();if(!user||user.mustResetPassword){const destination=(await headers()).get("x-railwatch-journey-path");redirect(destination?"/login?next="+encodeURIComponent(safeJourneyDestination(destination)):"/login");}return <div className={font.variable}><AccountApp user={{id:user.id,name:user.name??user.email,email:user.email,phoneNumber:user.phoneNumber,role:user.role,policy}}/>{children}</div>;}
