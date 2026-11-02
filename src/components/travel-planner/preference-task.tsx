import type {ReactNode} from "react";
import type {ReminderSchedule} from "@/lib/travel-planner";
import c from "./preference-task.module.css";

/** Describes saved reminder times without replacing the editable schedule rows. */
export function reminderSummary(schedule:ReminderSchedule,anchor="booking"){if(!schedule.length)return "No reminders";const labels=schedule.slice(0,2).map(row=>`${row.daysBefore?`${row.daysBefore} ${row.daysBefore===1?"day":"days"} before ${anchor}`:`${anchor==="travel"?"Travel":"Opening"} day`} at ${row.time}`);return `${labels.join(" · ")}${schedule.length>2?` · +${schedule.length-2} more`:""} IST`;}

/** Collapses phone settings by task while keeping every form field mounted. */
export function PreferenceTask({title,summary,mobile,expanded=false,saved=true,children}:{title:string;summary:string;mobile:boolean;expanded?:boolean;saved?:boolean;children:ReactNode}){return <details className={c.task} name={mobile?"preference-task":undefined} open={expanded}><summary><strong>{title}</strong><small>{saved?"Saved: ":""}{summary}</small></summary><div>{children}</div></details>;}
