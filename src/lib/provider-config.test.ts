import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { encryptSecret } from "./crypto";
import { providerSummary,providerUpdateSchema,resolveProviderConfiguration,updateProviderConfiguration,type ProviderConfiguration } from "./provider-config";
const google={clientId:"test.apps.googleusercontent.com",clientSecret:"fake-google-secret",id:"test-provider"};
const whatsapp={accessToken:"fake-whatsapp-token",phoneNumberId:"12345",apiVersion:"v25.0",templateName:"booking_reminder",language:"en"};
beforeEach(()=>{vi.stubEnv("APP_ENCRYPTION_KEY",Buffer.alloc(32,4).toString("base64"));vi.stubEnv("APP_URL","https://example.invalid");});
afterEach(()=>vi.unstubAllEnvs());
describe("provider credential configuration",()=>{
  it("retains secrets on partial replacement, encrypts them, and redacts all responses",()=>{
    const current={google,whatsapp};const result=updateProviderConfiguration(current,{google:{clientId:google.clientId}});
    expect(result.googleChanged).toBe(false);expect(result.payload).toMatch(/^enc:v1:/);expect(result.payload).not.toContain(google.clientSecret);expect(result.payload).not.toContain(whatsapp.accessToken);
    expect(resolveProviderConfiguration(result.payload,{}).whatsapp?.accessToken).toBe(whatsapp.accessToken);
    const summary=JSON.stringify(providerSummary(result.next));expect(summary).not.toContain(google.clientSecret);expect(summary).not.toContain(whatsapp.accessToken);expect(providerSummary(result.next).google.redirectUri).toBe("https://example.invalid/api/railwatch/google/callback");
  });
  it("requires a matching new secret for a new client and changes the connection identity on rotation",()=>{
    expect(()=>updateProviderConfiguration({google},{google:{clientId:"other.apps.googleusercontent.com"}})).toThrow("client secret");
    const next=updateProviderConfiguration({google},{google:{clientId:google.clientId,clientSecret:"rotated-secret"}});expect(next.googleChanged).toBe(true);expect(next.next.google?.id).not.toBe(google.id);
  });
  it("uses environment credentials as a fallback but respects explicit removal",()=>{
    const env={GOOGLE_CLIENT_ID:google.clientId,GOOGLE_CLIENT_SECRET:google.clientSecret,WHATSAPP_ACCESS_TOKEN:whatsapp.accessToken};
    expect(resolveProviderConfiguration(null,env).google?.clientSecret).toBe(google.clientSecret);expect(resolveProviderConfiguration(null,env).whatsapp).toBeNull();
    expect(resolveProviderConfiguration(encryptSecret(JSON.stringify({google:null,whatsapp:null})),env)).toEqual({telegram:null,google:null,whatsapp:null});
    const cleared=updateProviderConfiguration({google,whatsapp},{google:null});expect(cleared.googleChanged).toBe(true);expect(cleared.next.whatsapp).toEqual(whatsapp);
  });
  it("rejects incomplete credentials and unsafe endpoint components",()=>{
    expect(providerUpdateSchema.safeParse({whatsapp}).success).toBe(false);expect(providerUpdateSchema.safeParse({whatsapp:null}).success).toBe(false);
    for(const patch of [{phoneNumberId:"1/messages"},{apiVersion:"v25.0/../"},{templateName:"bad template"},{language:"en<script>"}])expect(providerUpdateSchema.safeParse({whatsapp:{...whatsapp,...patch}}).success).toBe(false);
    const empty:ProviderConfiguration={};expect("whatsapp" in providerSummary(empty)).toBe(false);
  });
});
