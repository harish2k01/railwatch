import {expect,it} from "vitest";
import {EMPTY_PLANNER,journeySchema,reconcileJourneyLifecycle,todayIST} from "./travel-planner";
it("completes booked journeys after the IST travel day without changing cancellation requests or ticket details",()=>{
 const booked=journeySchema.parse({train:"",travelClass:"SL",windowDays:60,originOffset:0,departure:"22:00",notes:"",id:"booked",status:"booked",date:"2026-10-02",from:"A",to:"B",coach:"B2",seat:"45",pnr:"1234567890"});
 const cancellation={...booked,id:"cancel",status:"cancellation_needed" as const};
 const planner={...EMPTY_PLANNER,journeys:[booked,cancellation]};
 expect(reconcileJourneyLifecycle(planner,todayIST(new Date("2026-10-02T18:29:59Z")))).toBe(planner);
 const next=reconcileJourneyLifecycle(planner,todayIST(new Date("2026-10-02T18:30:00Z")));
 expect(next.journeys).toEqual([{...booked,status:"completed",completedAt:"2026-10-03"},cancellation]);
 expect(reconcileJourneyLifecycle(next,"2026-10-03")).toBe(next);
});
it("retains cancellations for seven days and archives them without losing ticket information",()=>{
 const ticket=journeySchema.parse({train:"",travelClass:"SL",windowDays:60,originOffset:0,departure:"22:00",pnr:"",notes:"",id:"cancelled",status:"cancelled",date:"2026-12-01",from:"A",to:"B",coach:"S2",seat:"17"});
 const first=reconcileJourneyLifecycle({...EMPTY_PLANNER,journeys:[ticket]},"2026-10-02");
 expect(first.journeys[0]).toEqual({...ticket,cancelledAt:"2026-10-02",archivedAt:undefined});
 expect(reconcileJourneyLifecycle(first,"2026-10-08")).toBe(first);
 const archived=reconcileJourneyLifecycle(first,"2026-10-09");
 expect(archived.journeys[0]).toEqual({...ticket,cancelledAt:"2026-10-02",archivedAt:"2026-10-09"});
 expect(reconcileJourneyLifecycle(archived,"2026-10-10")).toBe(archived);
});


it("uses the account archive period without deleting journey history",()=>{const journey=journeySchema.parse({train:"",travelClass:"SL",windowDays:60,originOffset:0,departure:"22:00",notes:"",id:"cancelled",status:"cancelled",date:"2026-12-01",cancelledAt:"2026-10-01",from:"A",to:"B",pnr:""});const planner={...EMPTY_PLANNER,settings:{...EMPTY_PLANNER.settings,cancelledArchiveDays:30},journeys:[journey]};expect(reconcileJourneyLifecycle(planner,"2026-10-08").journeys[0].archivedAt).toBeUndefined();expect(reconcileJourneyLifecycle(planner,"2026-10-31").journeys[0].archivedAt).toBe("2026-10-31");});
