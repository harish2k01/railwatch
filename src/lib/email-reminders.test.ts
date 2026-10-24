import {describe,it,expect} from "vitest";
import {reminderJobs} from "./railwatch-jobs";
import {EMPTY_PLANNER,type Journey} from "./travel-planner";
const journey:Journey={id:"j",from:"MDU",to:"MS",date:"2026-12-01",departure:"20:00",train:"",pnr:"",travelClass:"SL",windowDays:60,originOffset:0,status:"needs_booking",notes:""};
const planner={...EMPTY_PLANNER,journeys:[journey],settings:{...EMPTY_PLANNER.settings,emailEnabled:true}};
const now=new Date("2026-10-02T02:30:00Z");
describe("verified email reminder eligibility",()=>{
  it("requires an opt-in and a verified account recipient",()=>{expect(reminderJobs(planner,now).some(j=>j.kind==="EMAIL")).toBe(false);expect(reminderJobs({...planner,settings:{...planner.settings,emailEnabled:false}},now,"owner@example.invalid").some(j=>j.kind==="EMAIL")).toBe(false);expect(reminderJobs(planner,now,"owner@example.invalid").filter(j=>j.kind==="EMAIL")).toHaveLength(3);});
  it("invalidates durable identities when the recipient changes without changing device identities",()=>{const a=reminderJobs(planner,now,"a@example.invalid",["phone"]),b=reminderJobs(planner,now,"b@example.invalid",["phone"]);expect(a.filter(j=>j.kind==="EMAIL").map(j=>j.key)).not.toEqual(b.filter(j=>j.kind==="EMAIL").map(j=>j.key));expect(a.filter(j=>j.kind==="PUSH")).toEqual(b.filter(j=>j.kind==="PUSH"));});
  it("stops jobs when the journey is booked or archived",()=>{for(const j of [{...journey,status:"booked" as const},{...journey,archivedAt:"2026-10-02"}])expect(reminderJobs({...planner,journeys:[j]},now,"owner@example.invalid")).toEqual([]);});
});
