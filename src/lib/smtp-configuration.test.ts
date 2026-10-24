import {describe,it,expect} from "vitest";
import {smtpConnectionSchema,smtpConnectionUrl,smtpSummary} from "./smtp-configuration";
describe("SMTP connection editing",()=>{
  const input={host:"smtp.example.com",port:587,security:"starttls" as const,username:"owner@example.com"};
  it("returns editable fields without secrets and preserves encoded credentials for the same identity",()=>{const raw=smtpConnectionUrl({...input,password:"p@ss:/?#"});expect(smtpSummary(raw)).toEqual(input);expect(JSON.stringify(smtpSummary(raw))).not.toContain("password");expect(decodeURIComponent(new URL(smtpConnectionUrl(input,raw)).password)).toBe("p@ss:/?#");expect(new URL(raw).searchParams.get("requireTLS")).toBe("true");});
  it("requires an explicit password for changes to the account, host, port, or security",()=>{const raw=smtpConnectionUrl({...input,password:"secret"});for(const change of [{host:"other.example.com"},{port:465},{security:"tls" as const},{username:"other@example.com"}])expect(()=>smtpConnectionUrl({...input,...change},raw)).toThrow("Enter the SMTP password");});
  it("rejects URL injection in a host and invalid ports",()=>{expect(smtpConnectionSchema.safeParse({...input,host:"host/path@evil"}).success).toBe(false);expect(smtpConnectionSchema.safeParse({...input,port:0}).success).toBe(false);expect(smtpSummary("invalid")).toBeNull();});
});
