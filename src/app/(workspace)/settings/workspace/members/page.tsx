import type { Metadata } from "next";
import { getSessionState } from "@/lib/backend-client";
import { redirect } from "next/navigation";
export const metadata:Metadata={title:"User Management · RailWatch"};
/** Renders the authenticated users workspace page. */
export default async function Page(){if((await getSessionState()).user?.role!=="ADMIN")redirect("/");return null;}
