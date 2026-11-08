import { journeyLink } from "./journey-links";
import { bookingTimeLabel,bookingDay,formatDay,type Journey } from "./travel-planner";
import {emailTemplate,type EmailOptions} from "./message-templates";
import { logger } from "./logger";
import nodemailer from "nodemailer";
import { getDeliveryConfiguration } from "@/lib/settings";

/** Returns the canonical browser URL used in account setup links. */
function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Sends an email through the saved SMTP connection with bounded timeouts and safe outcome logging. */
async function send(to: string, subject: string, text: string, action?:{label:string;url:string}, options:EmailOptions&{title?:string}={}) {
  const config = await getDeliveryConfiguration();
  if (!config.smtpUrl) return { sent: false as const, reason: "Email delivery is not configured." };
  const transporter = nodemailer.createTransport({
    url: config.smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try{const result = await transporter.sendMail({ from: config.emailFrom, to, subject, ...emailTemplate(options.title??subject,text,action,{appUrl:appUrl(),...options}) });
  if (!result.accepted?.some(address => String(address).toLowerCase() === to.toLowerCase())) throw new Error("SMTP did not accept the recipient.");
  logger.info("smtp.sent",{accepted:result.accepted?.length??0});return { sent: true as const };
  }catch(error){const e=error as {code?:string;command?:string;responseCode?:number};logger.error("smtp.failed",{code:e.code,command:e.command,responseCode:e.responseCode,reason:smtpFailureReason(error)});throw error;}finally{transporter.close();}
}

/** Sends an expiring invitation link to the created account. */
export function sendInvitationEmail(email: string, token: string) {
  const url = `${appUrl()}/set-password?token=${encodeURIComponent(token)}&type=invitation`;
  return send(email, "Set up your RailWatch account", "An administrator created a RailWatch account for you. Choose a password to start planning journeys and get reminded before booking opens.\n\nThis one-time link expires in 24 hours.",{label:"Set Up Account",url},{kicker:"Welcome",tone:"account",title:"You’re Invited to RailWatch",preheader:"Set your password to start using RailWatch."});
}

/** Sends a one-use password-reset link without disclosing account credentials. */
export function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl()}/set-password?token=${encodeURIComponent(token)}&type=reset`;
  return send(email, "Reset your RailWatch password", "A password reset was requested for your account. Choose a new password with the button below.\n\nThe link expires in 30 minutes and works once. If you didn’t ask for this, ignore this email; your password stays the same.",{label:"Reset Password",url},{kicker:"Security",tone:"account",title:"Reset Your Password",preheader:"Choose a new RailWatch password. The link expires in 30 minutes."});
}

/** Tests delivery to the signed-in administrator through the saved SMTP settings. */
export function sendTestEmail(email:string){return send(email,"RailWatch email test","Your email connection is working. RailWatch can now send invitations, password resets and booking reminders.",{label:"Open RailWatch",url:appUrl()},{kicker:"Email Test",tone:"info",title:"Email Is Working",preheader:"Your RailWatch email settings are working."});}

/** Maps SMTP protocol failures to actionable messages without exposing credentials or recipient addresses. */
export function smtpFailureReason(error:unknown){const e=error as {code?:string;command?:string;responseCode?:number};if(e.code==="EENVELOPE"&&e.command==="MAIL FROM")return "SMTP rejected the sender address. Set Sender to an address or verified alias allowed by your SMTP account.";if(e.code==="EAUTH")return "SMTP authentication failed. Check the username and password.";if(e.code==="ETIMEDOUT")return "SMTP timed out. Check the host, port, and network access.";if(e.code==="ESOCKET")return "Could not connect to SMTP. Check the host, port, and TLS settings.";return "SMTP did not accept the test email. Check the saved connection, sender address, and recipient.";}

/** Sends an expiring ownership confirmation link for the current account email. */
export function sendVerificationEmail(email:string,token:string){
  const url=`${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return send(email,"Verify your RailWatch email","Confirm this address so RailWatch can email your booking and cancellation reminders.\n\nThis one-time link expires in 24 hours. Ignore it if you didn’t ask for it.",{label:"Verify Email",url},{kicker:"Account",tone:"account",title:"Confirm Your Email",preheader:"Confirm your email to get booking reminders."});
}
/** Delivers a branded booking reminder; callers must recheck verified recipient eligibility. */
export function sendBookingEmail(email:string,journey:Journey){
  const travel=formatDay(journey.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"}),link={label:"Open Journey",url:`${appUrl()}${journeyLink(journey.id)}`};
  if(journey.status==="cancellation_needed")return send(email,`Cancel ${journey.from} → ${journey.to} · ${formatDay(journey.date,{day:"numeric",month:"short"})}`,`${journey.from} → ${journey.to}\n\nTravel: ${travel}\n\nCancel this ticket through IRCTC, then confirm the cancellation in RailWatch so reminders stop.`,link,{kicker:"Cancellation Reminder",tone:"cancel",title:"Cancel This Ticket",preheader:`Cancel ${journey.from} → ${journey.to} for ${travel} through IRCTC.`,trip:{from:journey.from,to:journey.to,date:travel,facts:[["Status","Waiting for cancellation"]]}});
  const opens=`${formatDay(bookingDay(journey),{weekday:"short",day:"numeric",month:"short"})} · ${bookingTimeLabel(journey)}`;
  return send(email,`Book ${journey.from} → ${journey.to} · opens ${formatDay(bookingDay(journey),{day:"numeric",month:"short"})}`,`${journey.from} → ${journey.to}\n\nTravel: ${travel}\nBooking opens: ${opens}\n\nBook through IRCTC when booking opens, then mark this journey booked in RailWatch (or attach the ticket) so reminders stop.`,link,{kicker:journey.bookingType==="tatkal"?"Tatkal Reminder":"Booking Reminder",tone:"booking",title:"Booking Opens Soon",preheader:`Booking for ${journey.from} → ${journey.to} opens ${opens}.`,trip:{from:journey.from,to:journey.to,date:travel,facts:[["Booking opens",opens],["Quota",journey.bookingType==="tatkal"?"Tatkal":"Normal"]]}});
}
