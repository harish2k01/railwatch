import { expect, it } from "vitest";
import { bookingDay, bookingInstant, EMPTY_PLANNER, journeySchema, migratePlanner, scheduledReminders, type Journey } from "./travel-planner";
import { reminderJobs } from "./railwatch-jobs";
import { telegramBookingMessage } from "./message-templates";

const journey: Journey = {id:"j",from:"AAA",to:"BBB",date:"2026-12-03",windowDays:60,originOffset:0,departure:"20:00",status:"needs_booking",train:"",travelClass:"",pnr:"",notes:""};
it("uses the train origin date and quota-specific Tatkal opening, preserving it through workspace migration",()=>{
 const j={...journey,bookingType:"tatkal" as const,tatkalClass:"non_ac" as const,trainOriginDate:"2026-12-02"};
 expect(bookingDay(j)).toBe("2026-12-01");expect(bookingInstant(j).toISOString()).toBe("2026-12-01T05:30:00.000Z");
 expect(bookingInstant({...j,tatkalClass:"ac"}).toISOString()).toBe("2026-12-01T04:30:00.000Z");
 expect(migratePlanner({...EMPTY_PLANNER,journeys:[j]}).journeys[0].trainOriginDate).toBe("2026-12-02");
});
it("uses independent AC/non-AC defaults and custom schedules beyond the three historical choices",()=>{
 const planner=structuredClone(EMPTY_PLANNER);
 const ac={...journey,bookingType:"tatkal" as const,tatkalClass:"ac" as const};
 expect(scheduledReminders(planner,ac)).toContain("2026-12-02T09:55:00+05:30");
 expect(scheduledReminders(planner,{...ac,tatkalClass:"non_ac"})).toContain("2026-12-02T10:55:00+05:30");
 planner.settings.bookingSchedule=[{daysBefore:7,time:"18:30"},{daysBefore:2,time:"20:10"},{daysBefore:0,time:"07:59"}];
 expect(scheduledReminders(planner,journey)).toEqual(["2026-09-27T18:30:00+05:30","2026-10-02T20:10:00+05:30","2026-10-04T07:59:00+05:30"]);
 expect(scheduledReminders(planner,{...journey,reminderOverride:{mode:"custom",times:[],clock:planner.settings.reminderClock,schedule:[]}})).toEqual([]);
});
it("queues cancellation follow-ups per channel/device, stops after confirmation, and uses cancellation wording",()=>{
 const planner=structuredClone(EMPTY_PLANNER),now=new Date("2026-12-01T03:00:00Z");
 const j={...journey,status:"cancellation_needed" as const};planner.journeys=[j];planner.settings.telegramEnabled=true;
 const jobs=reminderJobs(planner,now,undefined,["phone"]);
 expect(jobs.map(j=>j.kind).sort()).toEqual(["PUSH","TELEGRAM"]);expect(jobs[0].message).toContain("Cancel your ticket");
 expect(telegramBookingMessage(j)).toContain("Cancellation Reminder");expect(telegramBookingMessage({...journey,bookingType:"tatkal",tatkalClass:"ac"})).toContain("10:00 AM IST");
 planner.journeys=[{...j,status:"cancelled"}];expect(reminderJobs(planner,now)).toEqual([]);
 planner.journeys=[{...j,cancellationReminder:{enabled:false,time:"09:00"}}];expect(reminderJobs(planner,now)).toEqual([]);
 planner.settings.cancellationSchedule=[{daysBefore:1,time:"07:00"}];
 expect(scheduledReminders(planner,{...j,cancellationReminder:{enabled:true,time:"10:15"}},now)).toEqual(["2026-12-01T10:15:00+05:30"]);
 planner.journeys=[j];expect(reminderJobs(planner,new Date("2026-12-04T03:00:00Z"))).toEqual([]);
});
it("rejects invalid custom clocks and oversized schedules",()=>{
 expect(journeySchema.safeParse({...journey,reminderOverride:{mode:"custom",times:[],clock:EMPTY_PLANNER.settings.reminderClock,schedule:[{daysBefore:0,time:"25:00"}]}}).success).toBe(false);
});
it("does not create a browser inbox when no delivery channel is enabled",()=>{const planner=structuredClone(EMPTY_PLANNER);planner.journeys=[journey];expect(reminderJobs(planner,new Date("2026-10-02T02:30:00Z"))).toEqual([]);});
