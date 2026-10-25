import {z} from "zod";
import {ApiError} from "./http";

export const smtpConnectionSchema=z.object({host:z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/),port:z.number().int().min(1).max(65535),security:z.enum(["starttls","tls"]),username:z.string().max(512),password:z.string().max(1024).optional()}).strict();
export type SmtpConnection=z.infer<typeof smtpConnectionSchema>;
/** Projects an SMTP URL into editable connection details without returning its password. */
export function smtpSummary(raw:string|undefined|null){
  if(!raw)return null;
  try{const url=new URL(raw);if(!["smtp:","smtps:"].includes(url.protocol))return null;return {host:url.hostname,port:Number(url.port||(url.protocol==="smtps:"?465:587)),security:url.protocol==="smtps:"?"tls" as const:"starttls" as const,username:decodeURIComponent(url.username)};}catch{return null;}
}
/** Retains a saved password only for the same server, transport, and authenticated identity. */
export function smtpConnectionUrl(input:SmtpConnection,previous?:string|null){
  const prior=smtpSummary(previous);let password=input.password;
  if(!password&&input.username){
    if(!prior||prior.host.toLowerCase()!==input.host.toLowerCase()||prior.port!==input.port||prior.security!==input.security||prior.username!==input.username)throw new ApiError(400,"Enter the SMTP password when changing the server or account.","SMTP_PASSWORD_REQUIRED");
    password=decodeURIComponent(new URL(previous!).password);
    if(!password)throw new ApiError(400,"Enter the SMTP password.","SMTP_PASSWORD_REQUIRED");
  }
  const url=new URL(`${input.security==="tls"?"smtps":"smtp"}://${input.host}:${input.port}`);
  url.username=input.username;url.password=input.username?password??"":"";
  if(input.security==="starttls")url.searchParams.set("requireTLS","true");
  return url.toString();
}
