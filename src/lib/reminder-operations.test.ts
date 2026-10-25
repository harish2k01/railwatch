import { describe,it,expect } from "vitest";
import { operationAlerts,reminderMetrics } from "./reminder-operations";

describe("reminder operational signals",()=>{
  const now=new Date("2026-10-03T08:00:00Z");
  it("reports stale heartbeat, stuck processing, retry exhaustion and queue lateness",()=>{
    const alerts=operationAlerts({succeededAt:new Date(now.getTime()-600000),startedAt:new Date(now.getTime()-400000),failedAt:new Date(now.getTime()-500000),exhausted:2,missed:1,oldestDueAt:new Date(now.getTime()-360000)},now);
    expect(alerts).toHaveLength(6);
    expect(alerts.join(" ")).toContain("exhausted");
    expect(operationAlerts({succeededAt:now,startedAt:now,failedAt:null,exhausted:0,missed:0,oldestDueAt:null},now)).toEqual([]);
  });
  it("exports numeric metrics without private labels or negative queue ages",()=>{
    const metrics=reminderMetrics({startedAt:now,succeededAt:now,failedAt:null,durationMs:1000,failureCount:3,states:{PENDING:2,MISSED:1},exhausted:0,oldestDueAt:new Date(now.getTime()+1000),queue:{scheduled:2,due:0,overdue:0,nextAt:null,channels:{PUSH:2}},providerFailures:{},alerts:[]},now);
    expect(metrics).toContain("railwatch_scheduler_last_duration_seconds 1");
    expect(metrics).toContain("railwatch_reminder_oldest_due_age_seconds 0");
    expect(metrics).toContain('railwatch_reminder_provider_failures{channel="EMAIL"} 0');
    expect(metrics).not.toContain("userId");
  });
});
