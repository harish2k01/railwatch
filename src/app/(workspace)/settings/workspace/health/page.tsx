import type { Metadata } from "next";
import { getSessionState } from "@/lib/backend-client";
import { redirect } from "next/navigation";
export const metadata:Metadata={title:"Delivery health · RailWatch"};
/** Restricts the delivery health and recovery workspace to administrators. */
export default async function Page(){if((await getSessionState()).user?.role!=="ADMIN")redirect("/");return null;}
