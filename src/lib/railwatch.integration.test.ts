import { readJourneyPages,journeyQuerySchema } from "./journey-pages";
import {readPlanningView,type CalendarView,type DashboardView} from "./planning-views";
import { setJourneySnooze } from "./notification-controls";
import {createAccountToken,consumeAccountToken} from "./account-tokens";
import { dismissInAppReminder,recordInAppReminder } from "./in-app-notifications";
import { beginTelegramLogin,completeTelegramLogin,loginCredentialHash } from "./telegram-login";
import { pollTelegram } from "./telegram-polling";
import { exportJWK,generateKeyPair,SignJWT } from "jose";
import { receiveTelegramUpdate,tokenHash,telegramChatHash,bindTelegramAccount } from "./telegram";
import type { TelegramConfiguration } from "./provider-config";
import { decryptSecret } from "./crypto";
import { randomUUID } from "node:crypto";
import { describe,it,expect,afterEach,vi } from "vitest";
import { prisma } from "./db";
import { loadWorkspace,saveWorkspace } from "./railwatch-store";
import { encryptSecret } from "./crypto";
import { processRailWatch } from "./railwatch-jobs";
import { retryReminder } from "./reminder-operations";
import { runWithHeartbeat } from "@/backend/scheduler";
import { addDays,bookingDay,EMPTY_PLANNER,todayIST,type Journey,type Rule } from "./travel-planner";
vi.mock("./railwatch-google",()=>({syncGoogleCalendars:async()=>0}));
const emailDelivery=vi.hoisted(()=>vi.fn().mockResolvedValue({sent:true}));
vi.mock("./mail",()=>({sendBookingEmail:emailDelivery}));
const pushDelivery=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock("./browser-push",()=>({sendBrowserPush:pushDelivery}));
const users:string[]=[];
async function fixture(){if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))throw new Error("Use an isolated test database.");await prisma.appSettings.upsert({where:{id:"global"},create:{id:"global"},update:{bookingWindowDays:60,remindersEnabled:true,whatsappEnabled:true}});const u=await prisma.user.create({data:{email:`${randomUUID()}@railwatch.invalid`}});users.push(u.id);return {user:u,...await loadWorkspace(u.id)};}
afterEach(async()=>{vi.useRealTimers();if(users.length)await prisma.user.deleteMany({where:{id:{in:users.splice(0)}}});});
describe.skipIf(process.env.RUN_DB_TESTS!=="1")("account-backed RailWatch",{timeout:15000},()=>{
  it("indexes 2,000 encrypted journeys, pages accurately and preserves unloaded records during edits",async()=>{
    const f=await fixture(),other=await fixture(),today=todayIST();
    const journeys:Journey[]=Array.from({length:2000},(_,i)=>({id:`scale-${String(i).padStart(4,"0")}`,from:"MDU",to:"MS",date:addDays(today,90+i%180),departure:"20:00",train:"Express",pnr:"",travelClass:"SL",windowDays:60,originOffset:0,status:i%5===0?"booked":"needs_booking",notes:`needle-${i}`}));
    journeys[1997]={...journeys[1997],status:"completed",date:addDays(today,-20)};journeys[1998]={...journeys[1998],status:"cancelled",date:addDays(today,-20),archivedAt:addDays(today,-10),cancelledAt:addDays(today,-20)};
    const start=Date.now();const saved=await saveWorkspace(f.user.id,{...f.planner,journeys,settings:{...f.planner.settings,bookingSchedule:[],cancellationEnabled:false}},f.revision);const indexMs=Date.now()-start;
    const query=journeyQuerySchema.parse({});const began=Date.now();const first=await readJourneyPages(f.user.id,query);const pageMs=Date.now()-began;
    expect(first.pages.needs_booking.total).toBe(1598);expect(first.pages.booked.total).toBe(400);expect(first.pages.needs_booking.items).toHaveLength(30);expect(first.totals).toMatchObject({board:1998,completed:1,archive:1,ready:0,booked:400});
    const next=await readJourneyPages(f.user.id,{...query,column:"needs_booking",cursor:first.pages.needs_booking.nextCursor!});const ids=[...first.pages.needs_booking.items,...next.pages.needs_booking.items].map(j=>j.id);expect(new Set(ids).size).toBe(60);
    const expected=saved.planner.journeys.filter(j=>j.status==="needs_booking").sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(0,60).map(j=>j.id);expect(ids).toEqual(expected);
    const search=await readJourneyPages(f.user.id,journeyQuerySchema.parse({q:"needle-1901"}));expect(search.pages.needs_booking.total).toBe(1);expect(search.pages.needs_booking.items[0].id).toBe("scale-1901");
    const substring=await readJourneyPages(f.user.id,journeyQuerySchema.parse({q:"MDU"}));expect(substring.pages.booked.total).toBe(400);
    await expect(readJourneyPages(other.user.id,{...query,column:"needs_booking",cursor:first.pages.needs_booking.nextCursor!})).rejects.toThrow("Filters changed");
    const dashboard=await readPlanningView(f.user.id,{view:"dashboard",cursor:""}) as DashboardView;
    expect(dashboard.totals).toMatchObject({booked:400,ready:0,completed:1,upcoming:400,attention:0});expect(dashboard.upcoming).toHaveLength(4);expect(dashboard.bookingSoon).toHaveLength(4);
    const calendarQuery={view:"calendar" as const,from:addDays(today,90),to:addDays(today,131),cursor:""};
    const calendar=await readPlanningView(f.user.id,calendarQuery) as CalendarView;
    const inRange=saved.planner.journeys.filter(j=>!j.archivedAt&&["booked","needs_booking","cancellation_needed"].includes(j.status)&&j.date>=calendarQuery.from&&j.date<=calendarQuery.to);
    const calendarExpected=saved.planner.journeys.filter(j=>!j.archivedAt&&(inRange.some(row=>row.id===j.id)||(j.status==="needs_booking"&&bookingDay(j)>=calendarQuery.from&&bookingDay(j)<=calendarQuery.to)));
    expect(calendar.total).toBe(calendarExpected.length);expect(calendar.journeys).toHaveLength(200);expect(Object.values(calendar.counts).reduce((sum,day)=>sum+day.journeys,0)).toBe(inRange.length);
    const calendarNext=await readPlanningView(f.user.id,{...calendarQuery,cursor:calendar.nextCursor!}) as CalendarView;
    expect(new Set([...calendar.journeys,...calendarNext.journeys].map(j=>j.id)).size).toBe(400);
    await expect(readPlanningView(other.user.id,{...calendarQuery,cursor:calendar.nextCursor!})).rejects.toThrow("range changed");
    await expect(readPlanningView(f.user.id,{...calendarQuery,to:addDays(today,132)})).rejects.toThrow("six weeks");
    const base={...saved.planner,journeys:first.pages.needs_booking.items};const outside=await prisma.railJourney.findUniqueOrThrow({where:{userId_id:{userId:f.user.id,id:"scale-1999"}}});
    const edited={...base,journeys:base.journeys.map((j,i)=>i?j:{...j,notes:"Edited from a loaded page"})};const partial=await saveWorkspace(f.user.id,edited,saved.revision,base,true);
    expect(partial.planner.journeys).toHaveLength(30);expect(await prisma.railJourney.count({where:{userId:f.user.id}})).toBe(2000);expect((await loadWorkspace(f.user.id)).planner.journeys).toHaveLength(2000);
    expect((await prisma.railJourney.findUniqueOrThrow({where:{userId_id:{userId:f.user.id,id:"scale-1999"}}})).payload).toBe(outside.payload);
    await expect(readJourneyPages(f.user.id,{...query,column:"needs_booking",cursor:first.pages.needs_booking.nextCursor!})).rejects.toThrow("journeys changed");
    await expect(readPlanningView(f.user.id,{...calendarQuery,cursor:calendar.nextCursor!})).rejects.toThrow("journeys changed");
    await expect(saveWorkspace(f.user.id,{...base,journeys:base.journeys.map((j,i)=>i?j:{...j,notes:"Conflicting update"})},saved.revision,base,true)).rejects.toThrow("item changed");
    const bytes=Buffer.byteLength(JSON.stringify(first));expect(bytes).toBeLessThan(Buffer.byteLength(JSON.stringify(saved.planner))/5);
    expect(outside.payload.startsWith("enc:v1:")).toBe(true);expect(outside.searchTokens.join(" ")).not.toContain("needle");
    process.stdout.write("Account-scale verification "+JSON.stringify({journeys:2000,indexMs,pageMs,responseBytes:bytes,workspaceBytes:Buffer.byteLength(JSON.stringify(saved.planner))})+"\n");
  },60000);
  it("defers external messages during quiet hours while retaining the in-app inbox",async()=>{
    pushDelivery.mockClear();const now=new Date(`${todayIST()}T04:00:00Z`);vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now);const f=await fixture();
    const journey:Journey={id:"quiet",from:"A",to:"B",date:addDays(todayIST(now),60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}],quietHours:{enabled:true,start:"09:00",end:"10:00"}}},f.revision);
    await prisma.railPush.create({data:{userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}});
    await processRailWatch(now);expect(pushDelivery).not.toHaveBeenCalled();
    expect((await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"IN_APP"}})).state).toBe("SENT");
    const deferred=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"PUSH"}});expect(deferred.attempts).toBe(0);expect(deferred.state).toBe("PENDING");expect(deferred.deferredUntil?.toISOString()).toBe(`${todayIST(now)}T04:30:00.000Z`);
    const latest=await loadWorkspace(f.user.id,now);await saveWorkspace(f.user.id,{...latest.planner,settings:{...latest.planner.settings,quietHours:{enabled:false,start:"09:00",end:"10:00"}}},latest.revision);
    expect((await prisma.railJob.findUniqueOrThrow({where:{id:deferred.id}})).dueAt.getTime()).toBe(now.getTime());
    await processRailWatch(now);expect(pushDelivery).toHaveBeenCalledTimes(1);
  });
  it("snoozes across channels without consuming attempts, then delivers once after 24 hours",async()=>{
    pushDelivery.mockClear();const f=await fixture(),other=await fixture(),now=new Date(`${todayIST()}T04:00:00Z`);
    const journey:Journey={id:"snoozed",from:"A",to:"B",date:addDays(todayIST(now),60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}]}},f.revision);
    await prisma.railPush.create({data:{userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}});
    await expect(setJourneySnooze(other.user.id,journey.id,30,now)).rejects.toThrow("Journey not found");
    await setJourneySnooze(f.user.id,journey.id,1440,now);await processRailWatch(now);
    expect(pushDelivery).not.toHaveBeenCalled();expect(await prisma.railJob.count({where:{userId:f.user.id,state:"SENT"}})).toBe(0);
    await processRailWatch(new Date(now.getTime()+86400000));expect(pushDelivery).toHaveBeenCalledTimes(1);
    expect(await prisma.railJob.count({where:{userId:f.user.id,state:"SENT"}})).toBe(2);
    await processRailWatch(new Date(now.getTime()+86401000));expect(pushDelivery).toHaveBeenCalledTimes(1);
  });
  it("resumes deferred jobs without deleting history and rejects snoozing a booked journey",async()=>{
    const f=await fixture(),now=new Date(`${todayIST()}T04:00:00Z`);
    const journey:Journey={id:"resume",from:"A",to:"B",date:addDays(todayIST(now),60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}]}},f.revision);
    await setJourneySnooze(f.user.id,journey.id,60,now);await processRailWatch(now);
    await setJourneySnooze(f.user.id,journey.id,30,new Date(now.getTime()+5*60000));
    expect((await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id}})).dueAt.getTime()).toBe(now.getTime()+35*60000);
    await setJourneySnooze(f.user.id,journey.id,0,now);await processRailWatch(now);
    expect((await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id}})).state).toBe("SENT");
    const latest=await loadWorkspace(f.user.id);await saveWorkspace(f.user.id,{...latest.planner,journeys:[{...journey,status:"booked"}]},latest.revision);
    await expect(setJourneySnooze(f.user.id,journey.id,30,now)).rejects.toThrow("no longer needs");
    expect(await prisma.railReminderPause.count({where:{userId:f.user.id}})).toBe(0);
  });
  it("persists successful and failed scheduler outcomes across callers",async()=>{
    const before=await prisma.railOperations.findUnique({where:{id:"scheduler"}});
    await expect(runWithHeartbeat(async()=>{throw new Error("private-provider-detail");})).rejects.toThrow("private-provider-detail");
    const failed=await prisma.railOperations.findUniqueOrThrow({where:{id:"scheduler"}});
    expect(failed.failureCount).toBe((before?.failureCount??0)+1);expect(failed.failedAt).not.toBeNull();
    await runWithHeartbeat(async()=>({accounts:0,sent:0,calendars:0}));
    const recovered=await prisma.railOperations.findUniqueOrThrow({where:{id:"scheduler"}});
    expect(recovered.succeededAt!.getTime()).toBeGreaterThanOrEqual(failed.failedAt!.getTime());
    expect(JSON.stringify(recovered)).not.toContain("private-provider-detail");
  });
  it("releases an abandoned final-attempt lease for operator review",async()=>{
    const f=await fixture(),now=new Date(`${todayIST()}T05:00:00Z`);
    const journey:Journey={id:"abandoned",from:"A",to:"B",date:addDays(todayIST(now),60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}]}},f.revision);
    await processRailWatch(now);
    const job=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"IN_APP"}});
    await prisma.railJob.update({where:{id:job.id},data:{state:"SENDING",attempts:5,lease:"abandoned",leaseUntil:new Date(now.getTime()-1000)}});
    await processRailWatch(now);
    const recovered=await prisma.railJob.findUniqueOrThrow({where:{id:job.id}});
    expect(recovered.state).toBe("FAILED");expect(recovered.lease).toBeNull();expect(recovered.attempts).toBe(5);
  });
  it("records outage misses without a delivery burst and serializes explicit retries",async()=>{
    pushDelivery.mockClear();const f=await fixture(),now=new Date(`${todayIST()}T05:00:00Z`);
    const journey:Journey={id:"outage",from:"A",to:"B",date:addDays(todayIST(now),58),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}]}},f.revision);
    await prisma.railPush.create({data:{userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}});
    await processRailWatch(now);
    expect(pushDelivery).not.toHaveBeenCalled();
    const job=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"PUSH"}});
    expect(job.state).toBe("MISSED");
    const retry=await Promise.allSettled([retryReminder(job.id,f.user.id,now),retryReminder(job.id,f.user.id,now)]);
    expect(retry.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    await Promise.all([processRailWatch(now),processRailWatch(now)]);
    expect(pushDelivery).toHaveBeenCalledTimes(1);
    expect(await prisma.auditLog.count({where:{action:"reminder.retry_requested",targetId:job.id}})).toBe(1);
    await prisma.user.update({where:{id:f.user.id},data:{isActive:false}});await processRailWatch(now);
    expect(await prisma.railJob.count({where:{userId:f.user.id,state:"MISSED"}})).toBe(0);
  });
  it("rejects recovery after booking and cancels an already queued retry after preferences change",async()=>{
    pushDelivery.mockClear();const f=await fixture(),now=new Date(`${todayIST()}T05:00:00Z`);
    const journey:Journey={id:"recovery-change",from:"A",to:"B",date:addDays(todayIST(now),58),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,bookingSchedule:[{daysBefore:0,time:"08:00"}]}},f.revision);
    await prisma.railPush.create({data:{userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}});
    await processRailWatch(now);
    const job=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"PUSH"}});
    await retryReminder(job.id,f.user.id,now);
    const latest=await loadWorkspace(f.user.id);await saveWorkspace(f.user.id,{...latest.planner,journeys:[{...journey,status:"booked"}]},latest.revision);
    await processRailWatch(now);
    expect(pushDelivery).not.toHaveBeenCalled();
    expect((await prisma.railJob.findUniqueOrThrow({where:{id:job.id}})).state).toBe("CANCELLED");
    await expect(retryReminder(job.id,f.user.id,now)).rejects.toThrow(/no longer/);
  });
  it("leases cancellation alerts once per device and stops queued follow-ups after cancellation",async()=>{
    pushDelivery.mockClear();const f=await fixture(),now=new Date(`${todayIST()}T05:00:00Z`);
    const journey:Journey={id:"cancel-follow-up",from:"A",to:"B",date:addDays(todayIST(now),3),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"cancellation_needed",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey]},f.revision);
    await prisma.railPush.create({data:{userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}});
    await Promise.all([processRailWatch(now),processRailWatch(now)]);
    expect(pushDelivery).toHaveBeenCalledTimes(1);expect(pushDelivery).toHaveBeenCalledWith(f.user.id,expect.any(String),expect.stringContaining("Cancel your ticket"),"railwatch-journey-cancel-follow-up");
    await prisma.railJob.updateMany({where:{userId:f.user.id,kind:"PUSH"},data:{state:"PENDING"}});
    const latest=await loadWorkspace(f.user.id);await saveWorkspace(f.user.id,{...latest.planner,journeys:[{...journey,status:"cancelled"}]},latest.revision);
    await processRailWatch(now);expect(pushDelivery).toHaveBeenCalledTimes(1);
    expect(await prisma.railJob.count({where:{userId:f.user.id,kind:"PUSH",state:"CANCELLED"}})).toBe(1);
  });
  it("leases each opted-in device once and cancels reminders when a journey is booked",async()=>{
    pushDelivery.mockClear();const f=await fixture(),now=new Date(`${todayIST()}T03:00:00Z`);
    const journey:Journey={id:"push-journey",from:"A",to:"B",date:addDays(todayIST(now),60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
    await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,reminderTimes:["opening"]}},f.revision);
    await prisma.railPush.createMany({data:[1,2].map(n=>({id:`${f.user.id}-${n}`,userId:f.user.id,endpointHash:randomUUID(),subscription:encryptSecret("{}")}))});
    await Promise.all([processRailWatch(now),processRailWatch(now)]);
    expect(pushDelivery).toHaveBeenCalledTimes(2);
    expect(pushDelivery).toHaveBeenCalledWith(f.user.id,expect.any(String),expect.stringContaining("Book your train"),"railwatch-journey-push-journey");
    await prisma.railJob.updateMany({where:{userId:f.user.id,kind:"PUSH"},data:{state:"PENDING"}});
    const latest=await loadWorkspace(f.user.id);await saveWorkspace(f.user.id,{...latest.planner,journeys:[{...journey,status:"booked"}]},latest.revision);
    await processRailWatch(now);expect(pushDelivery).toHaveBeenCalledTimes(2);
    expect(await prisma.railJob.count({where:{userId:f.user.id,kind:"PUSH",state:"CANCELLED"}})).toBe(2);
  });
  it("rejects expired, superseded, reused and email-change verification tokens",async()=>{
    const f=await fixture();
    const first=await createAccountToken(f.user.id,"EMAIL_VERIFICATION",1440,f.user.email);
    const next=await createAccountToken(f.user.id,"EMAIL_VERIFICATION",1440,f.user.email);
    const consume=(token:string)=>prisma.$transaction(async tx=>{const user=await consumeAccountToken(token,"EMAIL_VERIFICATION",tx);await tx.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()}});return user.id;});
    await expect(consume(first.token)).rejects.toThrow(/invalid/);
    await expect(consume(next.token)).resolves.toBe(f.user.id);
    await expect(consume(next.token)).rejects.toThrow(/invalid/);
    const expired=await createAccountToken(f.user.id,"EMAIL_VERIFICATION",-1,f.user.email);
    await expect(consume(expired.token)).rejects.toThrow(/expired/);
    await prisma.user.update({where:{id:f.user.id},data:{email:`${randomUUID()}@railwatch.invalid`,emailVerifiedAt:null}});
    await expect(createAccountToken(f.user.id,"EMAIL_VERIFICATION",1440,f.user.email)).rejects.toThrow(/email changed/);
  });

  it("leases email delivery once and cancels it after ownership is revoked",async()=>{
    const f=await fixture(),today=todayIST(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}});
    const now=new Date(`${today}T08:00:00+05:30`);
    try{
      emailDelivery.mockClear();
      await prisma.appSettings.update({where:{id:"global"},data:{smtpUrl:encryptSecret("smtp://example.invalid:587")}});
      const journey:Journey={id:"email-due",from:"A",to:"B",date:addDays(today,60),departure:"20:00",train:"",pnr:"",travelClass:"SL",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
      await saveWorkspace(f.user.id,{...f.planner,journeys:[journey],settings:{...f.planner.settings,emailEnabled:true,reminderTimes:["opening"]}},f.revision);
      await processRailWatch(now);
      expect(emailDelivery).not.toHaveBeenCalled();
      await prisma.user.update({where:{id:f.user.id},data:{emailVerifiedAt:new Date()}});
      await Promise.all([processRailWatch(now),processRailWatch(now)]);
      expect(emailDelivery).toHaveBeenCalledTimes(1);
      expect(emailDelivery).toHaveBeenCalledWith(f.user.email,expect.objectContaining({id:journey.id}));
      const delivered=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,kind:"EMAIL"}});
      await prisma.railJob.update({where:{id:delivered.id},data:{state:"PENDING",sentAt:null}});
      await prisma.user.update({where:{id:f.user.id},data:{email:`${randomUUID()}@railwatch.invalid`,emailVerifiedAt:null}});
      await processRailWatch(now);
      expect(emailDelivery).toHaveBeenCalledTimes(1);
      expect((await prisma.railJob.findUniqueOrThrow({where:{id:delivered.id}})).state).toBe("CANCELLED");
    }finally{await prisma.appSettings.update({where:{id:"global"},data:{smtpUrl:settings.smtpUrl}});}
  });
  it("persists automatic completion and cancellation archival without a browser and keeps refresh revisions stable",async()=>{
    const f=await fixture(),today=todayIST();
    const base:Journey={id:"finished",from:"A",to:"B",date:addDays(today,-1),departure:"20:00",train:"",pnr:"1234567890",coach:"B2",seat:"17",travelClass:"SL",windowDays:60,originOffset:0,status:"booked",notes:"Keep this ticket"};
    const cancelled:Journey={...base,id:"cancelled",date:addDays(today,30),status:"cancelled",cancelledAt:addDays(today,-7)};
    await prisma.railWorkspace.update({where:{userId:f.user.id},data:{payload:encryptSecret(JSON.stringify({...f.planner,journeys:[base,cancelled]}))}});
    const loaded=await loadWorkspace(f.user.id);
    expect(loaded.planner.journeys).toHaveLength(2);
    expect(loaded.planner.journeys).toMatchObject([{...base,status:"completed"},{...cancelled,archivedAt:today}]);
    expect((await loadWorkspace(f.user.id)).revision).toBe(loaded.revision);
  });
  it("deletes expired originals atomically while keeping account history and other users' files",async()=>{
    const a=await fixture(),b=await fixture(),today=todayIST();
    const attachment={id:randomUUID(),name:"ticket.pdf",type:"application/pdf" as const,size:5,createdAt:new Date().toISOString()};
    const otherId=randomUUID();
    await prisma.railFile.createMany({data:[{...attachment,userId:a.user.id,createdAt:undefined,payload:encryptSecret("JVBERi0=")},{...attachment,id:otherId,userId:b.user.id,createdAt:undefined,payload:encryptSecret("JVBERi0=")} ]});
    const journey:Journey={id:"expired",from:"A",to:"B",date:addDays(today,30),departure:"20:00",train:"",travelClass:"SL",windowDays:60,originOffset:0,status:"cancelled",cancelledAt:addDays(today,-6),pnr:"1234567890",notes:"Keep history",attachments:[attachment]};
    await prisma.railWorkspace.update({where:{userId:a.user.id},data:{payload:encryptSecret(JSON.stringify({...a.planner,journeys:[journey]}))}});
    expect((await loadWorkspace(a.user.id)).planner.journeys[0].attachments).toHaveLength(1);
    const expired=await loadWorkspace(a.user.id,new Date(addDays(today,1)+"T12:00:00+05:30"));
    expect(expired.planner.journeys[0]).toMatchObject({pnr:journey.pnr,notes:journey.notes,attachments:[]});
    expect(await prisma.railFile.findUnique({where:{userId_id:{userId:a.user.id,id:attachment.id}}})).toBeNull();
    expect(await prisma.railFile.findUnique({where:{userId_id:{userId:b.user.id,id:otherId}}})).not.toBeNull();
    expect((await loadWorkspace(a.user.id,new Date(addDays(today,1)+"T12:00:00+05:30"))).revision).toBe(expired.revision);
  });
  it("stores encrypted plans and rejects stale concurrent writes",async()=>{const {user,planner,revision}=await fixture();const edits=await Promise.allSettled([saveWorkspace(user.id,{...planner,settings:{...planner.settings,theme:"dark"}},revision),saveWorkspace(user.id,{...planner,settings:{...planner.settings,bookingWindowDays:45}},revision)]);expect(edits.filter(e=>e.status==="fulfilled")).toHaveLength(1);const row=await prisma.railWorkspace.findUniqueOrThrow({where:{userId:user.id}});expect(row.payload).toMatch(/^enc:v1:/);expect(row.payload).not.toContain("settings");expect(row.version).toBe(2);});
  it("keeps routine refresh revisions stable and safely merges time off with background plans",async()=>{const f=await fixture();const today=todayIST();const rule:Rule={id:"background",name:"Weekly",from:"A",to:"B",train:"",travelClass:"",windowDays:60,originOffset:0,start:today,end:null,weekdays:[0,1,2,3,4,5,6],intervalWeeks:1,departure:"20:00",returnAfterDays:null,returnDeparture:"20:00",returnTrain:"",returnOriginOffset:0,paused:false,excludedDates:[]};await saveWorkspace(f.user.id,{...f.planner,rules:[rule]},f.revision);const extended=await loadWorkspace(f.user.id);expect((await loadWorkspace(f.user.id)).revision).toBe(extended.revision);const holiday={id:"leave",name:"Time Off",date:addDays(today,20),type:"leave" as const};const saved=await saveWorkspace(f.user.id,{...f.planner,holidays:[holiday]},f.revision,f.planner);expect(saved.planner.holidays).toContainEqual(holiday);expect(saved.planner.rules).toHaveLength(1);expect(saved.planner.journeys.length).toBeGreaterThan(0);});
  it("does not accept attachments owned by another account",async()=>{const a=await fixture(),b=await fixture();const date=todayIST();const attachment={id:"ticket",name:"ticket.pdf",type:"application/pdf" as const,size:5,createdAt:new Date().toISOString()};await prisma.railFile.create({data:{id:attachment.id,userId:a.user.id,name:attachment.name,type:attachment.type,size:5,payload:encryptSecret("JVBERi0=")}});const journey:Journey={id:"j",from:"A",to:"B",date,departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"booked",notes:"",attachments:[attachment]};await expect(saveWorkspace(b.user.id,{...EMPTY_PLANNER,journeys:[journey]},b.revision)).rejects.toThrow("Upload the original");expect((await loadWorkspace(b.user.id)).revision).toBe(1);});
  it("extends ongoing routines without a browser and avoids duplicate reminder deliveries",async()=>{const {user,planner,revision}=await fixture();const today=todayIST();const rule:Rule={id:"routine",name:"Daily",from:"A",to:"B",start:today,end:null,weekdays:[0],intervalWeeks:1,recurrence:{frequency:"daily",interval:1,monthlyPattern:"date",dayOfMonth:1,ordinal:1,weekday:0},paused:false,excludedDates:[],departure:"20:00",returnDeparture:"20:00",returnAfterDays:null,returnTrain:"",returnOriginOffset:0,train:"",travelClass:"",originOffset:0,windowDays:60};const journey:Journey={id:"due",from:"C",to:"D",date:addDays(today,60),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""};await saveWorkspace(user.id,{...planner,rules:[rule],journeys:[journey]},revision);const now=new Date(`${today}T08:00:00+05:30`);await Promise.all([processRailWatch(now),processRailWatch(now)]);const loaded=await loadWorkspace(user.id);expect(loaded.planner.journeys.length).toBeGreaterThan(180);const jobs=await prisma.railJob.findMany({where:{userId:user.id,state:"SENT"}});expect(jobs.length).toBeGreaterThan(0);expect(new Set(jobs.map(j=>j.key)).size).toBe(jobs.length);await processRailWatch(now);expect(await prisma.railJob.count({where:{userId:user.id,state:"SENT"}})).toBe(jobs.length);},20000);
  it("reactivates pending reminders when a journey returns to To book",async()=>{const f=await fixture();const today=todayIST();const now=new Date(today+'T08:00:00+05:30');let current=await saveWorkspace(f.user.id,{...f.planner,journeys:[{id:"return-to-book",from:"A",to:"B",date:addDays(today,65),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:""}]},f.revision);await processRailWatch(now);const pending=await prisma.railJob.count({where:{userId:f.user.id,state:"PENDING"}});expect(pending).toBeGreaterThan(0);current.planner.journeys[0].status="booked";current=await saveWorkspace(f.user.id,current.planner,current.revision);await processRailWatch(now);expect(await prisma.railJob.count({where:{userId:f.user.id,state:"CANCELLED"}})).toBe(pending);current.planner.journeys[0].status="needs_booking";await saveWorkspace(f.user.id,current.planner,current.revision);await processRailWatch(now);expect(await prisma.railJob.count({where:{userId:f.user.id,state:"PENDING"}})).toBe(pending);});
  it("applies shared booking rules and account phones, and pauses worker reminders when disabled",async()=>{
    const f=await fixture();const previous=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}});
    try{
      await prisma.user.update({where:{id:f.user.id},data:{phoneNumber:"+919876543210"}});
      await prisma.appSettings.update({where:{id:"global"},data:{bookingWindowDays:45,remindersEnabled:false,whatsappEnabled:false}});
      const current=await loadWorkspace(f.user.id);const today=todayIST();
      const saved=await saveWorkspace(f.user.id,{...current.planner,settings:{...current.planner.settings,bookingWindowDays:300,whatsappNumber:"+441234567890"},journeys:[{id:"paused",from:"A",to:"B",date:addDays(today,45),departure:"20:00",train:"",pnr:"",travelClass:"",windowDays:300,originOffset:0,status:"needs_booking",notes:""}]},current.revision);
      expect(saved.planner.settings.whatsappNumber).toBe("+919876543210");expect(saved.planner.journeys[0].windowDays).toBe(45);
      await processRailWatch(new Date(today+"T08:00:00+05:30"));expect(await prisma.railJob.count({where:{userId:f.user.id,state:"SENT"}})).toBe(0);
      await prisma.appSettings.update({where:{id:"global"},data:{remindersEnabled:true}});
      await processRailWatch(new Date(today+"T08:00:00+05:30"));expect(await prisma.railJob.count({where:{userId:f.user.id,state:"SENT"}})).toBeGreaterThan(0);
    }finally{await prisma.appSettings.update({where:{id:"global"},data:{bookingWindowDays:previous.bookingWindowDays,remindersEnabled:previous.remindersEnabled,whatsappEnabled:previous.whatsappEnabled}});}
  });

});

describe.skipIf(process.env.RUN_DB_TESTS!=="1")("Telegram account connections",()=>{
 it("accepts private one-time links, rejects expired/replayed/group links, and stops reminders",async()=>{
  const f=await fixture(),other=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}});
  const bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"test-bot",webhookSecret:"test-secret",webhookReady:true};
  const token="a".repeat(43),chatId=123456789;const update={update_id:1,message:{text:"/start "+token,chat:{id:chatId,type:"private"},from:{id:chatId,is_bot:false,username:"traveler"}}};
  try{
   await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});
   await prisma.railTelegram.create({data:{userId:f.user.id,providerId:bot.id,linkTokenHash:tokenHash(token),linkExpiresAt:new Date(Date.now()+60000)}});
   expect(await receiveTelegramUpdate({...update,message:{...update.message,chat:{id:chatId,type:"group"}}},bot)).toBeNull();
   expect(await receiveTelegramUpdate({...update,message:{...update.message,from:{id:chatId+1}}},bot)).toBeNull();
   expect(await receiveTelegramUpdate(update,bot)).toMatchObject({method:"sendMessage",chat_id:String(chatId)});
   const stored=await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}});expect(stored.chatId).toMatch(/^enc:v1:/);expect(decryptSecret(stored.chatId)).toBe(String(chatId));expect(stored.linkTokenHash).toBeNull();expect(await receiveTelegramUpdate(update,bot)).toMatchObject({method:"sendMessage"});
   const loaded=await loadWorkspace(f.user.id);expect(loaded.planner.settings.telegramEnabled).toBe(true);expect((await loadWorkspace(other.user.id)).planner.settings.telegramChatId).toBe("");
   const forged=await loadWorkspace(other.user.id);const saved=await saveWorkspace(other.user.id,{...forged.planner,settings:{...forged.planner.settings,telegramEnabled:true,telegramChatId:String(chatId),telegramProviderId:bot.id}},forged.revision);expect(saved.planner.settings.telegramEnabled).toBe(false);expect(saved.planner.settings.telegramChatId).toBe("");
   await prisma.railTelegram.create({data:{userId:other.user.id,providerId:bot.id,linkTokenHash:tokenHash("b".repeat(43)),linkExpiresAt:new Date(Date.now()-1000)}});expect(await receiveTelegramUpdate({...update,message:{...update.message,text:"/start "+"b".repeat(43)}},bot)).toMatchObject({method:"sendMessage"});
   await prisma.railTelegram.update({where:{userId:other.user.id},data:{linkExpiresAt:new Date(Date.now()+60000)}});expect(await receiveTelegramUpdate({...update,message:{...update.message,text:"/start "+"b".repeat(43)}},bot)).toMatchObject({method:"sendMessage"});
   expect(await receiveTelegramUpdate({...update,message:{...update.message,text:"/stop"}},bot)).toMatchObject({method:"sendMessage"});expect((await loadWorkspace(f.user.id)).planner.settings.telegramEnabled).toBe(false);
   expect(await receiveTelegramUpdate(update,{...bot,id:"rotated"})).toBeNull();
   await prisma.railTelegram.update({where:{userId:f.user.id},data:{enabled:true}});await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:false}});expect((await loadWorkspace(f.user.id)).planner.settings.telegramEnabled).toBe(false);
  }finally{await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled}});}
 });
 it("delivers scheduled Telegram messages once and cancels future reminders after disconnect",async()=>{
  const f=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}});const bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"delivery-bot",webhookSecret:"test-secret",webhookReady:true};const fetch=vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>({ok:true,result:new URL(url).pathname.endsWith("/getUpdates")?[]:{message_id:42}})}));vi.stubGlobal("fetch",fetch);
  try{await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});await prisma.railTelegram.create({data:{userId:f.user.id,providerId:bot.id,enabled:true,chatId:encryptSecret("123456789"),chatHash:telegramChatHash(bot.id,"123456789")}});const today=todayIST(),now=new Date(today+"T08:00:00+05:30"),current=await loadWorkspace(f.user.id);await saveWorkspace(f.user.id,{...current.planner,journeys:[{id:"telegram-delivery",from:"A",to:"B",date:addDays(today,60),departure:"20:00",train:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",pnr:"",notes:""}]},current.revision);await processRailWatch(now);const sent=fetch.mock.calls.filter(c=>new URL(c[0]).pathname.endsWith("/sendMessage")).length;expect(sent).toBeGreaterThan(0);expect(fetch.mock.calls.every(call=>new URL(call[0]).hostname === "api.telegram.org")).toBe(true);await processRailWatch(now);expect(fetch.mock.calls.filter(c=>new URL(c[0]).pathname.endsWith("/sendMessage"))).toHaveLength(sent);await prisma.railTelegram.delete({where:{userId:f.user.id}});expect((await loadWorkspace(f.user.id)).planner.settings.telegramEnabled).toBe(false);
  }finally{vi.unstubAllGlobals();await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled}});}
 });
});

describe.skipIf(process.env.RUN_DB_TESTS!=="1")("in-app notification lifecycle",()=>{
 it("serializes duplicate reminders, dismisses the journey, and allows only a later reminder",async()=>{const f=await fixture(),due=new Date("2026-10-02T01:30:00Z");async function job(key:string){return prisma.railJob.create({data:{userId:f.user.id,key,kind:"IN_APP",state:"SENDING",lease:key,dueAt:due,payload:encryptSecret(JSON.stringify({journeyId:"same",message:"Book"}))}});}const a=await job("first"),b=await job("duplicate");const results=await Promise.all([a,b].map(j=>recordInAppReminder({id:j.id,userId:f.user.id,lease:j.lease!,journeyId:"same",dueAt:due},due)));expect(results.filter(Boolean)).toHaveLength(1);expect(await prisma.railJob.count({where:{userId:f.user.id,kind:"IN_APP",state:"SENT",readAt:null}})).toBe(1);const notification=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id,state:"SENT"}});const dismissed=new Date("2026-10-02T02:00:00Z");await dismissInAppReminder(f.user.id,notification.id,dismissed);const backlog=await job("backlog");expect(await recordInAppReminder({id:backlog.id,userId:f.user.id,lease:backlog.lease!,journeyId:"same",dueAt:due},dismissed)).toBe(false);const later=await job("later");expect(await recordInAppReminder({id:later.id,userId:f.user.id,lease:later.lease!,journeyId:"same",dueAt:new Date("2026-10-02T02:30:00Z")},new Date("2026-10-02T02:30:00Z"))).toBe(true);const other=await fixture();await dismissInAppReminder(other.user.id,later.id);expect(await prisma.railJob.count({where:{userId:f.user.id,state:"SENT",readAt:null}})).toBe(1);});
 it("dismisses all historical duplicates for the same journey",async()=>{const f=await fixture();await prisma.railJob.createMany({data:["old1","old2","old3"].map(key=>({userId:f.user.id,key,kind:"IN_APP",state:"SENT",dueAt:new Date(),payload:encryptSecret(JSON.stringify({journeyId:"legacy"}))}))});const first=await prisma.railJob.findFirstOrThrow({where:{userId:f.user.id}});await dismissInAppReminder(f.user.id,first.id);expect(await prisma.railJob.count({where:{userId:f.user.id,kind:"IN_APP",state:"SENT",readAt:null}})).toBe(0);});
});

describe.skipIf(process.env.RUN_DB_TESTS!=="1")("Telegram authorization and code pairing",()=>{
 it("pairs a single-use code, rejects expired and occupied chats, and guides plain Start",async()=>{const f=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}}),bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"pair-bot",webhookSecret:"secret",webhookReady:true};try{await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});const code="ABCDEF123456",update={update_id:1,message:{text:"/connect ABCD-EF12-3456",chat:{id:456789,type:"private"},from:{id:456789}}};await prisma.railTelegram.create({data:{userId:f.user.id,providerId:bot.id,linkTokenHash:tokenHash(code),linkExpiresAt:new Date(Date.now()+60000)}});expect(await receiveTelegramUpdate({...update,message:{...update.message,text:"/start"}},bot)).toMatchObject({text:expect.stringContaining("Pair With Code")});expect(await receiveTelegramUpdate(update,bot)).toMatchObject({text:expect.stringContaining("connected")});expect((await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}})).linkTokenHash).toBeNull();expect(await receiveTelegramUpdate(update,bot)).toMatchObject({text:expect.stringContaining("invalid or expired")});}finally{await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled}});}});
 it("expires authorization attempts, rejects foreign state, and protects occupied or replaced bindings",async()=>{const f=await fixture(),other=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}}),bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"login-bot",webhookSecret:"secret",webhookReady:true,clientId:"123456789",clientSecret:"secret"};try{await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});const url=new URL(await beginTelegramLogin(f.user.id,bot)),state=url.searchParams.get("state")!;const row=await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}});expect(row.authPayload).toMatch(/^enc:v1:/);expect(row.authStateHash).toBe(tokenHash(state));await expect(completeTelegramLogin(other.user.id,state,"code")).rejects.toThrow();await prisma.railTelegram.update({where:{userId:f.user.id},data:{authExpiresAt:new Date(Date.now()-1)}});await expect(completeTelegramLogin(f.user.id,state,"code")).rejects.toThrow();await prisma.railTelegram.update({where:{userId:f.user.id},data:{authStateHash:null,authPayload:null,authExpiresAt:null}});await bindTelegramAccount(f.user.id,"12345",null,bot,loginCredentialHash(bot));await prisma.railTelegram.create({data:{userId:other.user.id,providerId:bot.id}});await expect(bindTelegramAccount(other.user.id,"12345",null,bot,loginCredentialHash(bot))).rejects.toThrow("another RailWatch");await prisma.railTelegram.update({where:{userId:f.user.id},data:{linkTokenHash:tokenHash("replacement")}});await expect(bindTelegramAccount(f.user.id,"56789",null,bot,loginCredentialHash(bot))).rejects.toThrow("replaced");}finally{await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled}});}});
});

describe.skipIf(process.env.RUN_DB_TESTS!=="1")("outbound Telegram polling",()=>{
 it("upgrades webhooks, claims a pairing code, advances its cursor, and honors polling leases",async()=>{
  const f=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}}),bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"outgoing-bot",webhookSecret:"unused",webhookReady:true};const update={update_id:100,message:{text:"/connect ABCD-EF12-3456",chat:{id:56789,type:"private"},from:{id:56789}}};
  const fetch=vi.fn().mockImplementation(async(url:string,init:{body:string})=>({ok:true,json:async()=>({ok:true,result:new URL(url).pathname.endsWith("/getUpdates")?(JSON.parse(init.body).offset===0?[update]:[]):true})}));vi.stubGlobal("fetch",fetch);
  try{await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,telegramPollLease:null,telegramPollUntil:null,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});await prisma.railTelegram.create({data:{userId:f.user.id,providerId:bot.id,linkTokenHash:tokenHash("ABCDEF123456"),linkExpiresAt:new Date(Date.now()+60000)}});expect(await pollTelegram()).toBe(1);expect((await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}})).enabled).toBe(true);expect(await pollTelegram()).toBe(0);expect(fetch.mock.calls.filter(c=>new URL(c[0]).pathname.endsWith("/deleteWebhook"))).toHaveLength(1);expect(fetch.mock.calls.filter(c=>new URL(c[0]).pathname.endsWith("/sendMessage"))).toHaveLength(1);const reads=fetch.mock.calls.filter(c=>new URL(c[0]).pathname.endsWith("/getUpdates"));expect(JSON.parse(reads[1][1].body).offset).toBe(101);await prisma.appSettings.update({where:{id:"global"},data:{telegramPollLease:"other-worker",telegramPollUntil:new Date(Date.now()+60000)}});const before=fetch.mock.calls.length;expect(await pollTelegram()).toBe(0);expect(fetch.mock.calls.length).toBe(before);await prisma.appSettings.update({where:{id:"global"},data:{telegramPollLease:null,telegramPollUntil:null,telegramEnabled:false}});expect(await pollTelegram()).toBe(0);expect(fetch.mock.calls.length).toBe(before);}finally{vi.unstubAllGlobals();await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled,telegramPollLease:null,telegramPollUntil:null}});}
 });
});

describe.skipIf(process.env.RUN_DB_TESTS!=="1")("Telegram token exchange",()=>{
 it("links a signed identity to its initiating user and consumes state once",async()=>{
  const f=await fixture(),settings=await prisma.appSettings.findUniqueOrThrow({where:{id:"global"}}),bot:TelegramConfiguration={botToken:"123456789:"+"a".repeat(35),botUsername:"RailWatchBot",id:"exchange-bot",webhookSecret:"unused",webhookReady:true,clientId:"123456789",clientSecret:"login-secret"};const {publicKey,privateKey}=await generateKeyPair("RS256"),jwk={...await exportJWK(publicKey),kid:"exchange",alg:"RS256"};
  try{await prisma.appSettings.update({where:{id:"global"},data:{telegramEnabled:true,remindersEnabled:true,providerConfig:encryptSecret(JSON.stringify({telegram:bot}))}});const url=new URL(await beginTelegramLogin(f.user.id,bot)),state=url.searchParams.get("state")!,saved=await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}}),pending=JSON.parse(decryptSecret(saved.authPayload)!);const token=await new SignJWT({sub:"1234123412341234123",id:98765,nonce:pending.nonce}).setProtectedHeader({alg:"RS256",kid:"exchange"}).setIssuer("https://oauth.telegram.org").setAudience(bot.clientId!).setIssuedAt().setExpirationTime('5m').sign(privateKey);
   const fetch=vi.fn().mockImplementation(async(url:string,init?:{headers:Record<string,string>;body:URLSearchParams})=>{const requestUrl=new URL(url);if(requestUrl.hostname!=="oauth.telegram.org")throw new Error("Unexpected provider");if(requestUrl.pathname==="/.well-known/jwks.json")return Response.json({keys:[jwk]});expect(requestUrl.pathname).toBe("/token");expect(init!.body.get("code_verifier")).toBe(pending.verifier);expect(init!.headers.Authorization).toBe("Basic "+Buffer.from(`${bot.clientId}:${bot.clientSecret}`).toString("base64"));return Response.json({id_token:token});});vi.stubGlobal("fetch",fetch);
   const attempts=await Promise.allSettled([completeTelegramLogin(f.user.id,state,"code"),completeTelegramLogin(f.user.id,state,"code")]);expect(attempts.filter(x=>x.status==="fulfilled")).toHaveLength(1);const linked=await prisma.railTelegram.findUniqueOrThrow({where:{userId:f.user.id}});expect(decryptSecret(linked.chatId)).toBe("98765");expect(linked.enabled).toBe(true);expect(linked.authPayload).toBeNull();expect(linked.authStateHash).toBeNull();await expect(completeTelegramLogin(f.user.id,state,"code")).rejects.toThrow();
  }finally{vi.unstubAllGlobals();await prisma.appSettings.update({where:{id:"global"},data:{providerConfig:settings.providerConfig,telegramEnabled:settings.telegramEnabled,remindersEnabled:settings.remindersEnabled}});}
 });
});
