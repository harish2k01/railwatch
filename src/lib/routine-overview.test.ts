import {describe,expect,it} from "vitest";
import {EMPTY_PLANNER,saveLinkedRule,type Journey,type Rule} from "./travel-planner";
import {groupRoutines,nextRoutineDate,previewRoutineChange} from "./routine-overview";

const rule:Rule={id:"a",name:"Commute · Onward",from:"A",to:"B",start:"2026-10-01",end:null,weekdays:[2],intervalWeeks:1,paused:false,excludedDates:[],departure:"19:42",returnDeparture:"20:00",returnAfterDays:null,returnTrain:"",returnOriginOffset:0,train:"",travelClass:"",originOffset:0,windowDays:60};
const journey:Journey={id:"old",ruleId:"a",from:"A",to:"B",date:"2026-10-27",departure:"19:42",train:"",pnr:"",travelClass:"",windowDays:60,originOffset:0,status:"needs_booking",notes:"Keep this note"};

describe("routine overview",()=>{
  it("groups reciprocal directions once and retains each independent schedule and pause state",()=>{
    const forward={...rule,linkedRuleId:"b"},back={...rule,id:"b",name:"Commute · Return",from:"B",to:"A",weekdays:[4],linkedRuleId:"a",paused:true};
    const groups=groupRoutines([forward,back,{...rule,id:"c",name:"Weekend"}]);
    expect(groups.map(group=>[group.title,group.rules.map(item=>item.id)])).toEqual([["Commute",["a","b"]],["Weekend",["c"]]]);
    expect(groups[0].rules[1].paused).toBe(true);expect(groups[0].rules[1].weekdays).toEqual([4]);
    expect(groupRoutines([back,forward])[0].rules.map(item=>item.id)).toEqual(["a","b"]);
    expect(groupRoutines([{...rule,linkedRuleId:"missing"}])[0].rules).toHaveLength(1);
    expect(groupRoutines([{...rule,linkedRuleId:"b"},{...back,linkedRuleId:undefined}])).toHaveLength(2);
  });
  it("derives a scheduled date without inventing a confirmed journey or ignoring exclusions",()=>{
    expect(nextRoutineDate(rule,"2026-10-25",EMPTY_PLANNER.settings)).toBe("2026-10-27");
    expect(nextRoutineDate({...rule,excludedDates:["2026-10-27"]},"2026-10-25",EMPTY_PLANNER.settings)).toBe("2026-11-03");
    expect(nextRoutineDate({...rule,paused:true},"2026-10-25",EMPTY_PLANNER.settings)).toBeNull();
    expect(nextRoutineDate({...rule,end:"2026-10-20"},"2026-10-25",EMPTY_PLANNER.settings)).toBeNull();
  });
  it("previews additions and removals while protecting booked, cancelled, historical and manual records",()=>{
    const existing=[journey,{...journey,id:"booked",status:"booked" as const,pnr:"1234567890"},{...journey,id:"cancelled",status:"cancelled" as const},{...journey,id:"manual",manualOverride:true},{...journey,id:"past",date:"2026-10-10"},{...journey,id:"archived",archivedAt:"2026-10-24"}];
    const before={...EMPTY_PLANNER,rules:[rule],journeys:existing};
    const after=saveLinkedRule(before,{...rule,weekdays:[4],end:"2026-11-05"},"2026-10-25");
    const preview=previewRoutineChange(before,after,rule.id,"2026-10-25");
    expect(preview).toMatchObject({added:2,removed:1,updated:0,unchanged:5,protected:5,firstDates:["2026-10-29","2026-11-05"]});
    for(const kept of existing.slice(1))expect(after.journeys).toContainEqual(kept);
    expect(before.journeys).toEqual(existing);expect(before.rules[0].weekdays).toEqual([2]);
  });
  it("counts real field edits but ignores object-key order and unrelated routines",()=>{
    const before={...EMPTY_PLANNER,journeys:[journey,{...journey,id:"other",ruleId:"b"}]};
    const reordered=Object.fromEntries(Object.entries(journey).reverse()) as Journey;
    expect(previewRoutineChange(before,{...before,journeys:[reordered]},"a")).toMatchObject({added:0,removed:0,updated:0,unchanged:1});
    expect(previewRoutineChange(before,{...before,journeys:[{...journey,from:"C"}]},"a")).toMatchObject({updated:1,unchanged:0});
  });
});
