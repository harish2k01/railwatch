import { safeJourneyDestination } from "@/lib/journey-links";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { getSessionState } from "@/lib/backend-client";

export const dynamic = "force-dynamic";

/** Renders the account authentication screen using backend session state. */
export default async function Home({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const { user: currentUser, firstSignup, allowSignups } = await getSessionState();
  if (currentUser && !currentUser.mustResetPassword) redirect((await searchParams).next?safeJourneyDestination((await searchParams).next):"/");
  if (currentUser?.mustResetPassword) return <AuthScreen mode="resetPassword" allowSignups={allowSignups} />;
  if (firstSignup) return <AuthScreen mode="firstSignup" allowSignups />;
  return <AuthScreen mode="login" allowSignups={allowSignups} />;
}
