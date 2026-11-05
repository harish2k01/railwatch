import type { Metadata } from "next";
import { getSessionState } from "@/lib/backend-client";
import { redirect } from "next/navigation";
export const metadata:Metadata={title:"Integrations · RailWatch"};
/** Renders the authenticated integrations workspace page. */
export default async function Page(){if((await getSessionState()).user?.role!=="ADMIN")redirect("/");return null;}
