import { describe,it,expect } from "vitest";
import { validateWorkspace } from "./railwatch-store";
import { googleEvents } from "./railwatch-google";
import { reminderJobs } from "./railwatch-jobs";
import { EMPTY_PLANNER,type Journey } from "./travel-planner";
const j:Journey={id:"j",from:"A",to:"B",date:"2026-12-01",windowDays:60,originOffset:0,departure:"20:00",train:"",pnr:"1234567890",travelClass:"",status:"needs_booking",notes:""};
describe("account planner policies",()=>{
  it("rejects duplicate ids, invalid routes, and WhatsApp without a recipient",()=>{
    expect(()=>validateWorkspace({...EMPTY_PLANNER,journeys:[j,j]})).toThrow("Duplicate");
    expect(()=>validateWorkspace({...EMPTY_PLANNER,journeys:[{...j,to:"a"}]})).toThrow("different");
    expect(()=>validateWorkspace({...EMPTY_PLANNER,settings:{...EMPTY_PLANNER.settings,whatsappEnabled:true}})).toThrow("international");
  });
  it("enforces shared booking days on tickets and plans",()=>{expect(validateWorkspace({...EMPTY_PLANNER,settings:{...EMPTY_PLANNER.settings,bookingWindowDays:30},journeys:[j]}).journeys[0].windowDays).toBe(30);});
  it("queues immutable reminder identities and respects overrides/archive/status",()=>{
    const now=new Date("2026-10-01T15:00:00Z");const planner={...EMPTY_PLANNER,journeys:[j]};
    expect(reminderJobs(planner,now,undefined,["phone"])).toHaveLength(3);
    expect(new Set(reminderJobs({...planner,settings:{...planner.settings,whatsappEnabled:true,whatsappNumber:"+919876543210"}},now,undefined,["phone"]).map(j=>j.key)).size).toBe(6);
    for(const patch of [{status:"booked" as const},{archivedAt:"2026-10-01"},{reminderOverride:{mode:"off" as const,times:[],clock:planner.settings.reminderClock}}])expect(reminderJobs({...planner,journeys:[{...j,...patch}]},now)).toEqual([]);
    expect(reminderJobs(planner,new Date("2026-10-04T00:00:00Z"),undefined,["phone"])).toHaveLength(3);
    expect(reminderJobs(planner,new Date("2026-11-03T00:00:00Z"))).toEqual([]);
  });
  it("exports Google events with stable ids, effective alarms and no PNR",()=>{
    const planner={...EMPTY_PLANNER,journeys:[j]};const events=googleEvents(planner);expect(events).toHaveLength(2);expect(events[0].start).toEqual({date:j.date});expect(events[1].reminders.overrides).toHaveLength(3);expect(JSON.stringify(events)).not.toContain(j.pnr);
    expect(googleEvents({...planner,journeys:[{...j,notes:"Changed"}]}).map(e=>e.id)).toEqual(events.map(e=>e.id));
    expect(googleEvents({...planner,journeys:[{...j,status:"booked"}]})).toHaveLength(1);
    expect(googleEvents({...planner,journeys:[{...j,status:"completed"}]})).toEqual([]);
  });
});
