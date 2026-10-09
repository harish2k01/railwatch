import { journeyLink } from "./journey-links";
import { bookingTimeLabel,bookingDay,formatDay,type Journey } from "./travel-planner";
import {emailTemplate} from "./message-templates";
import { logger } from "./logger";
import nodemailer from "nodemailer";
import { getDeliveryConfiguration } from "@/lib/settings";

/** Returns the canonical browser URL used in account setup links. */
function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Sends an email through the saved SMTP connection with bounded timeouts and safe outcome logging. */
async function send(to: string, subject: string, text: string, action?:{label:string;url:string}) {
  const config = await getDeliveryConfiguration();
  if (!config.smtpUrl) return { sent: false as const, reason: "Email delivery is not configured." };
  const transporter = nodemailer.createTransport({
    url: config.smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try{const result = await transporter.sendMail({ from: config.emailFrom, to, subject, ...emailTemplate(subject,text,action) });
  if (!result.accepted?.some(address => String(address).toLowerCase() === to.toLowerCase())) throw new Error("SMTP did not accept the recipient.");
  logger.info("smtp.sent",{accepted:result.accepted?.length??0});return { sent: true as const };
  }catch(error){const e=error as {code?:string;command?:string;responseCode?:number};logger.error("smtp.failed",{code:e.code,command:e.command,responseCode:e.responseCode,reason:smtpFailureReason(error)});throw error;}finally{transporter.close();}
}

/** Sends an expiring invitation link to the created account. */
export function sendInvitationEmail(email: string, token: string) {
  const url = `${appUrl()}/set-password?token=${encodeURIComponent(token)}&type=invitation`;
  return send(email, "Set up your RailWatch account", [
    "An administrator created a RailWatch account for you.",
    "",
    `Set your password using this one-time link: ${url}`,
    "",
    "The link expires in 24 hours.",
  ].join("\n"),{label:"Set Up Account",url});
}

/** Sends a one-use password-reset link without disclosing account credentials. */
export function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl()}/set-password?token=${encodeURIComponent(token)}&type=reset`;
  return send(email, "Reset your RailWatch password", [
    "A password reset was requested for your account.",
    "",
    `Choose a new password using this one-time link: ${url}`,
    "",
    "The link expires in 30 minutes. Ignore this message if you did not request it.",
  ].join("\n"),{label:"Reset Password",url});
}

/** Tests delivery to the signed-in administrator through the saved SMTP settings. */
export function sendTestEmail(email:string){return send(email,"RailWatch email test","Your email connection is working.\n\nRailWatch can now deliver invitations and password resets.",{label:"Open RailWatch",url:appUrl()});}

/** Maps SMTP protocol failures to actionable messages without exposing credentials or recipient addresses. */
export function smtpFailureReason(error:unknown){const e=error as {code?:string;command?:string;responseCode?:number};if(e.code==="EENVELOPE"&&e.command==="MAIL FROM")return "SMTP rejected the sender address. Set Sender to an address or verified alias allowed by your SMTP account.";if(e.code==="EAUTH")return "SMTP authentication failed. Check the username and password.";if(e.code==="ETIMEDOUT")return "SMTP timed out. Check the host, port, and network access.";if(e.code==="ESOCKET")return "Could not connect to SMTP. Check the host, port, and TLS settings.";return "SMTP did not accept the test email. Check the saved connection, sender address, and recipient.";}

/** Sends an expiring ownership confirmation link for the current account email. */
export function sendVerificationEmail(email:string,token:string){
  const url=`${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return send(email,"Verify your RailWatch email","Confirm that this email address belongs to you to receive booking reminders.\n\nThis one-time link expires in 24 hours. Ignore it if you did not request it.",{label:"Verify Email",url});
}
/** Delivers a branded booking reminder; callers must recheck verified recipient eligibility. */
export function sendBookingEmail(email:string,journey:Journey){
  if(journey.status==="cancellation_needed")return send(email,"RailWatch · Cancellation reminder",`${journey.from} → ${journey.to}\n\nTravel: ${formatDay(journey.date,{day:"numeric",month:"long",year:"numeric"})}\n\nCancel through IRCTC, then confirm cancellation in RailWatch.`,{label:"Open Journey",url:`${appUrl()}${journeyLink(journey.id)}`});
  return send(email,"RailWatch · Booking reminder",`${journey.from} → ${journey.to}\n\nTravel: ${formatDay(journey.date,{day:"numeric",month:"long",year:"numeric"})}\nBooking Date: ${formatDay(bookingDay(journey),{day:"numeric",month:"long",year:"numeric"})}\nOpens at ${bookingTimeLabel(journey)}\n\nBook through IRCTC, then mark this journey as booked in RailWatch.`,{label:"Open Journey",url:`${appUrl()}${journeyLink(journey.id)}`});
}
