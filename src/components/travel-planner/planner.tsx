"use client";
import { DateInput } from "./date-time-input";
import { ask, ConfirmHost } from "./confirm";
import {TimeOffOverview} from "./time-off-overview";
import {RoutineOverview} from "./routine-overview";
import {BusyPill,TopProgress} from "./loader";
import {SpendView} from "./spend";
import { parseBookingStatus } from "@/lib/ticket-status";
import type {RoutineChangePreview} from "@/lib/routine-overview";
import { settingsNavigationAllowed } from "./settings-guard";
import { DesktopJourneys } from "./desktop-journeys";
import type { JourneyPages, JourneyQuickFilter } from "@/lib/journey-pages";
import type { JourneyRange } from "./journey-date-range";
import {MobileHeaderActions,MobileMore,MobileHome,MobileNavigation,MobileScreen,MobileJourneyRow,MobileWeek,MonthList,useMobileWorkspace} from "./mobile-workspace";
import m from "./mobile-workspace.module.css";
import {usePlanningView} from "./planning-views";
import type {CalendarView,DashboardView} from "@/lib/planning-views";
import { useJourneyPages } from "./journey-pages";

import { useViewMotion } from "./view-motion";
import { CalendarAgenda } from "./calendar-agenda";
import { JourneyDetail } from "./journey-detail";
import { EmptyState } from "./empty-state";
import { BookingDay } from "./booking-day";
import { offlineEnabled, offlineTargets, syncOffline, wipeOffline } from "@/lib/offline-tickets";
import { TicketImport } from "./ticket-import";
import { takeShared } from "@/lib/shared-inbox";
import { parseSharedPnr, sharedPnrSummary } from "@/lib/pnr-text";
import { recognizeTicket } from "@/lib/ticket-ocr";
import { parseHolidayICS } from "@/lib/holiday-ics";
import { SettingsHub } from "./settings-hub";
import { FirstRun } from "./first-run";
import { stationLabel } from "@/lib/journey-display";
import { RailWatchMark } from "@/components/railwatch-mark";

import Link from "next/link";
import { NotificationBell } from "./notification-bell";
import { journeyLink } from "@/lib/journey-links";
import { usePathname,useRouter,useSearchParams } from "next/navigation";
import type { UserProfile } from "@/lib/feature-policy";
import { AdminPanel } from "./admin";
import { Profile } from "./profile";
import { useEffect, useMemo, useRef, useState, type FormEvent , Fragment } from "react";
import { PanelLeftClose, PanelLeftOpen, Wallet, ArrowDownToLine,ArrowRight, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, LayoutGrid, ListFilter, Plus, Repeat2, Search, Settings2, TrainFront, Files, Sun, Moon, House } from "lucide-react";
import { addDays, bookingDay,  calendarFile, daysBetween,EMPTY_PLANNER, findBreaks, formatDay, holidaySchema, isDay, migratePlanner, parseHolidayCSV, plannerSchema, todayIST, weekday, transitionJourney, type Journey, type Planner, type Rule , skipForTimeOff , DEFAULT_CLOCK } from "@/lib/travel-planner";
import { Field, JourneyForm, Modal, RuleForm, STATUS } from "./forms";
import { Select } from "./select";
import { ActionMenu } from "./action-menu";
import s from "./planner.module.css";
import { TicketViewer } from "./ticket-viewer";
import { Dashboard } from "./dashboard";
import { Toast } from "./toast";
import { apiRequest } from "@/lib/client-api";
import type { AccountWorkspace } from "./account-app";

import { decodeBackupFiles, deleteTicketFile, downloadTicketFile, exportTicketBackup, extractTicketFile, getTicketFile, saveTicketFile, validateTicketFile } from "@/lib/ticket-files";
import type { TicketDetails } from "@/lib/ticket-details";

// Primary destinations (plan 2.1). Routines and Tickets stay as secondary links until the
// Journeys timeline (2.4) absorbs them; Settings is the workspace area for admins.
const NAV = [{ id: "home", label: "Today", short: "Today", icon: House }, { id: "journeys", label: "Journeys", short: "Journeys", icon: LayoutGrid }, { id: "calendar", label: "Calendar", short: "Calendar", icon: CalendarDays }, { id: "routines", label: "Routines", short: "Routines", icon: Repeat2 }, { id: "holidays", label: "Time off", short: "Time off", icon: CalendarDays }, { id: "vault", label: "Tickets", short: "Tickets", icon: Files }, { id: "spend", label: "Spend", short: "Spend", icon: Wallet }, { id: "settings", label: "Settings", short: "Settings", icon: Settings2 }] as const;
const PRIMARY = new Set<string>(["home", "journeys", "calendar", "routines", "holidays", "vault", "spend", "settings"]);
/** Time-of-day greeting in IST, as on the Today board. */
const greeting = (at?: Date) => { const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(at ?? new Date())); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening"; };
type Tab = typeof NAV[number]["id"]|"workspace"|"users"|"integrations"|"operations";
const PATHS:Record<Tab,string>={home:"/",journeys:"/journeys",calendar:"/calendar",routines:"/routines",holidays:"/time-off",vault:"/tickets",spend:"/spend",settings:"/settings",workspace:"/settings/workspace",users:"/settings/workspace/members",integrations:"/settings/workspace/integrations",operations:"/settings/workspace/health"};
type Editor = { type: "tickets"; files?: File[] } | { type: "booking"; journey: Journey } | { type: "journey"; journey?: Journey; date?: string; ticket?: boolean; editing?: boolean } | { type: "rule"; rule?: Partial<Rule> } | { type: "day"; date: string } | { type: "holiday" } | { type: "import" } | null;
/** Parses and migrates the serialized workspace while reporting invalid stored data. */
function read(raw: string | null) { if (!raw || raw === "unavailable") return { planner: EMPTY_PLANNER, invalid: raw === "unavailable" }; try { return { planner: migratePlanner(JSON.parse(raw)), invalid: false }; } catch { return { planner: EMPTY_PLANNER, invalid: true }; } }
/** Downloads generated calendar or backup content through a temporary object URL. */
function download(name: string, value: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
/** Coordinates routed workspace views, optimistic saves, item dialogs, and account-scoped actions. */
export function TravelPlanner({ account }: { account: AccountWorkspace & UserProfile }) {
  const mobile=useMobileWorkspace();
  const router=useRouter(),pathname=usePathname(),params=useSearchParams();const policy=account.policy;
  const tab=(Object.keys(PATHS) as Tab[]).find(key=>PATHS[key]===pathname)??"home";
  const /** Navigates to the selected workspace page. */ setTab=(tab:Tab)=>{const go=()=>router.push(PATHS[tab]);if(settingsNavigationAllowed(go))go();};
  const navItems=NAV;
  const activeNav=tab==="workspace"||tab==="users"||tab==="integrations"||tab==="operations"?"settings":tab;
  const exportCalendar=()=>{void apiRequest<AccountWorkspace>("/api/railwatch/workspace").then(full=>{download("railwatch.ics",calendarFile(full.planner),"text/calendar;charset=utf-8");setNotice("Calendar exported.");}).catch(e=>setError(e.message));};
  /** Says where a journey's reminder settings come from. */
  const reminderLabel=(j:Journey)=>{const own=j.reminderOverride?.mode,rule=planner.rules.find(x=>x.id===j.ruleId)?.reminderOverride?.mode;return own==="off"?"Off":own==="custom"?"Custom for this journey":rule&&rule!=="inherit"?"From the routine":"Your defaults";};
  /** Skip or keep a trip that falls on time off (plan 3.1). */
  const skipTimeOff=(j:Journey)=>void commit(skipForTimeOff({...planner,journeys:planner.journeys.some(x=>x.id===j.id)?planner.journeys:[...planner.journeys,j]},j),"Trip skipped.");
  const keepTimeOff=(j:Journey)=>void update({...j,timeOffKept:true}).then(saved=>{if(saved)setNotice("Trip kept.");});
  // Offline page and push both rely on the service worker; register it on every page, not only where the Install button is shown.
  useEffect(()=>{if("serviceWorker" in navigator&&window.isSecureContext)void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(()=>undefined);},[]);
  const saveLock=useRef(false); const [busyLabel,setBusyLabel]=useState(""); const [displayName,setDisplayName]=useState(account.name);
  const [remote,setRemote]=useState(JSON.stringify(account.planner)); const [revision,setRevision]=useState(account.revision); const [saving,setSaving]=useState(false);
  const [sidebar,setSidebar]=useState<"expanded"|"collapsed">(()=>{try{return typeof window!=="undefined"&&localStorage.getItem("railwatch:sidebar")==="collapsed"?"collapsed":"expanded";}catch{return "expanded";}});
  const toggleSidebar=()=>setSidebar(v=>{const next=v==="expanded"?"collapsed":"expanded";try{localStorage.setItem("railwatch:sidebar",next);}catch{}return next;});
  const raw=remote;
  const listView=tab==="journeys"||tab==="vault";
  const [vaultSearch,setVaultSearch]=useState("");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const /** Refreshes time-dependent state or runs the next scheduled processing cycle. */ tick = () => setNow(new Date()); const timer = setInterval(tick, 30000); const initial = setTimeout(tick, 0); return () => { clearInterval(timer); clearTimeout(initial); }; }, []);
  const today = now ? todayIST(now) : "";
  const loaded = useMemo(() => read(raw), [raw]);


  const [moreOpen, setMoreOpen] = useState(false);
  const moreVisible=mobile&&moreOpen;
  const profileSettings=useRef<{open:(section?:string)=>void}>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [mobileStatus, setMobileStatus] = useState("booked");
  const [calendarView, setViewState] = useState(()=>{try{const v=typeof window==="undefined"?null:localStorage.getItem("railwatch:calendar-view");return v==="month"||v==="agenda"?v:"week";}catch{return "week";}});
  const setCalendarView=(v:string)=>{setViewState(v);try{localStorage.setItem("railwatch:calendar-view",v);}catch{/* per-browser only */}};
  const [icsPreview, setIcsPreview] = useState<Omit<Planner["holidays"][number], "id">[] | null>(null);
  // Plan 2.6: journey status toggles double as the calendar legend.
  const [calendarStatuses, setCalendarStatuses] = useState<Record<string, boolean>>({ booked: true, needs_booking: true, cancellation_needed: true });
  const [editor, setEditor] = useState<Editor>(null);
  // A dialog belongs to the page it was opened on: switching tabs (sidebar, bottom bar, links) closes it.
  const [editorTab, setEditorTab] = useState(tab);
  if (editorTab !== tab) { setEditorTab(tab); if (editor) setEditor(null); }
  const linkedJourney=params.get("journey");
  const openedLink=useRef<string|null>(null);

  useEffect(()=>{
    if(!linkedJourney||linkedJourney===openedLink.current)return;
    if(linkedJourney.length>128)return;
    let live=true;
    void apiRequest<{journey:Journey}>("/api/railwatch/journeys?id="+encodeURIComponent(linkedJourney)).then(({journey})=>{if(!live)return;openedLink.current=linkedJourney;setMoreOpen(false);setRemote(old=>{const p=read(old).planner;return JSON.stringify({...p,journeys:[...p.journeys.filter(j=>j.id!==journey.id),journey]});});setEditor({type:"journey",journey});}).catch(()=>{if(live)setError("This journey is unavailable for your account.");});
    return()=>{live=false;};
  },[linkedJourney]);
  const [viewTicket,setViewTicket]=useState<import("@/lib/travel-planner").TicketAttachment>();const [viewerTab,setViewerTab]=useState(tab);if(viewerTab!==tab){setViewerTab(tab);if(viewTicket)setViewTicket(undefined);}
  const [journeyView, setJourneyView] = useState("board"); const [undo, setUndo] = useState<{ id: string; status: Journey["status"]; next: Journey["status"] } | null>(null);
  const [invalidDismissed,setInvalidDismissed]=useState(false);
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [closedError, setClosedError] = useState("");
  const [search, setSearch] = useState(""); const [routineFilter, setRoutineFilter] = useState(""); const [range, setRange] = useState("upcoming");
  const [sort, setSort] = useState("travel"); const [showFilters, setShowFilters] = useState(false); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  // Canvas Journeys is the timeline; the chosen layout is remembered per browser.
  const [desktopLayout,setLayoutState]=useState<"board"|"list"|"timeline">(()=>{try{const v=typeof window==="undefined"?null:localStorage.getItem("railwatch:journeys-layout");return v==="board"||v==="list"?v:"timeline";}catch{return "timeline";}});
  const setDesktopLayout=(v:"board"|"list"|"timeline")=>{setLayoutState(v);try{localStorage.setItem("railwatch:journeys-layout",v);}catch{/* per-browser only */}};
  const [quick,setQuick]=useState<JourneyQuickFilter>("all");
  const [desktopRange,setDesktopRange]=useState<JourneyRange>(()=>({from:todayIST(new Date()),to:"",period:"all"}));
  const [month, setMonth] = useState(""); const [day, setDay] = useState("");
  const [calendarLayers, setCalendarLayers] = useState({ journeys: true, bookings: true, holidays: true });
  const viewMotion = useViewMotion<HTMLElement>(`${tab}:${journeyView}:${desktopLayout}:${calendarView}:${month}:${day}:${mobileStatus}`);
  const desktopJourneys=!mobile&&tab==="journeys";
  const listQuery=new URLSearchParams({view:tab==="vault"?"tickets":journeyView,status:tab==="vault"?"all":statusFilter,quick:desktopJourneys?quick:"all",weekStartsOn:String(loaded.planner.settings.weekStartsOn),q:tab==="vault"?vaultSearch:search,rule:tab==="vault"?"":routineFilter,from:tab==="vault"?"":desktopJourneys?desktopRange.from:dateFrom,to:tab==="vault"?"":desktopJourneys?desktopRange.to:dateTo,range:tab==="vault"?"all":desktopJourneys?desktopRange.period:range,sort}).toString();
  const pages=useJourneyPages(listQuery,revision,listView);
  const pageItems=useMemo(()=>Object.values(pages.data?.pages??{}).flatMap(p=>p.items),[pages.data]);
  const currentMonth = month || today.slice(0, 7);
  const firstDay = currentMonth ? `${currentMonth}-01` : "";
  const gridStart = firstDay ? addDays(firstDay, -((weekday(firstDay) - loaded.planner.settings.weekStartsOn + 7) % 7)) : "";
  const calendarQuery=new URLSearchParams({view:"calendar",from:gridStart,to:gridStart?addDays(gridStart,41):"",day:today}).toString();
  const dashboard=usePlanningView<DashboardView>("view=dashboard&minute="+Math.floor((now?.getTime()??0)/60000),revision,(tab==="home"||tab==="calendar")&&Boolean(today));
  const calendar=usePlanningView<CalendarView>(calendarQuery,revision,tab==="calendar"&&Boolean(gridStart));
  const selectedDate=editor?.type==="day"?editor.date:mobile&&tab==="calendar"?(day||today):"";
  const selectedDay=usePlanningView<CalendarView>(new URLSearchParams({view:"calendar",from:selectedDate,to:selectedDate}).toString(),revision,Boolean(selectedDate));
  const viewRevision=Math.max(dashboard.data?.revision??0,calendar.data?.revision??0,selectedDay.data?.revision??0);
  useEffect(()=>{if(viewRevision<=revision||saving)return;let live=true;void apiRequest<AccountWorkspace>("/api/railwatch/workspace?partial=1",{cache:"no-store"}).then(value=>{if(live){setRemote(JSON.stringify(value.planner));setRevision(value.revision);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[viewRevision,revision,saving]);
  const workspaceBase=useMemo(()=>{const rows=new Map(loaded.planner.journeys.map(j=>[j.id,j]));const context=tab==="home"? [...(dashboard.data?.attention??[]),...(dashboard.data?.upcoming??[]),...(dashboard.data?.bookingSoon??[])]:tab==="calendar"?[...(calendar.data?.journeys??[]),...(selectedDay.data?.journeys??[])]:pageItems;for(const j of context)if(!saving||!rows.has(j.id))rows.set(j.id,j);return {...loaded.planner,journeys:[...rows.values()]};},[loaded.planner,pageItems,saving,tab,dashboard.data,calendar.data,selectedDay.data]);
  const planner=workspaceBase;
  useEffect(()=>{document.querySelector('meta[name="theme-color"]')?.setAttribute("content",planner.settings.theme==="dark"?"#0b0f17":"#f6f5f2");},[planner.settings.theme,mobile]);
  const sorted = [...planner.journeys].sort((a, b) => (sort === "booking" ? bookingDay(a).localeCompare(bookingDay(b)) : a.date.localeCompare(b.date)) || a.from.localeCompare(b.from));
  const filtered=listView?pageItems.map(j=>planner.journeys.find(row=>row.id===j.id)??j):sorted;

  const breaks = today ? findBreaks(planner, today) : [];
  /** Refreshes this device's offline tickets from booked journeys in the next 72 hours (plan 3.6). */
  const syncOfflineTickets=async()=>{if(!today||!offlineEnabled())return 0;const until=addDays(today,3);try{const page=await apiRequest<JourneyPages>(`/api/railwatch/journeys?view=list&range=all&status=booked&from=${today}&to=${until}`);return await syncOffline(offlineTargets(page.pages.all?.items??[],today,until));}catch{return 0;}};
  useEffect(()=>{if(today&&offlineEnabled())void syncOfflineTickets();// eslint-disable-next-line react-hooks/exhaustive-deps
  },[today,revision]);
  // Canvas: on desktop Journeys, a journey opens in a side panel beside the list (gap J3).
  const journeyDocked=!mobile&&tab==="journeys"&&editor?.type==="journey"&&Boolean(editor.journey)&&!editor.editing;
  // Canvas Settings: on desktop the section content sits beside the section list (gap S1).
  const settingsDocked=!mobile&&tab==="settings";
  const activeDay = day || today;
  const dayEvents = selectedDate ? eventsFor(selectedDate) : {journeys:[],bookings:[],holidays:[]};
  const /** Resolves a routine identifier to its display name. */ ruleName = (j: Journey) => planner.rules.find(r => r.id === j.ruleId)?.name;
    /** Adds journeys the caller fetched outside the loaded page to the save's "before" snapshot, so editing them isn't read as a conflict. */
  function withKnown(base: Planner, known: Journey[]) { const ids = new Set(base.journeys.map(j => j.id)); return { ...base, journeys: [...base.journeys, ...known.filter(j => !ids.has(j.id))] }; }
    /** Saves edits with the current concurrency revision and preserves unsaved work on conflicts. */
  async function commit(next: Planner, message: string, restore = false, known: Journey[] = []) {
    if (saveLock.current) return false;
    if (loaded.invalid && !restore) { setError("Restore a valid backup before editing. Your unreadable saved data has been preserved."); return false; }
    const previous=remote; saveLock.current=true;
    try {
      const data=plannerSchema.parse(next);
      {setSaving(true);setRemote(JSON.stringify(data));const saved=await apiRequest<AccountWorkspace>("/api/railwatch/workspace",{method:"PUT",body:JSON.stringify({planner:data,revision,base:restore?undefined:withKnown(workspaceBase,known),partial:!restore})});setRemote(JSON.stringify({...saved.planner,journeys:[]}));setRevision(saved.revision);}
      setNotice(message);setUndo(null);setError("");return true;
    }catch(e){setRemote(previous);setError(e instanceof Error ? e.message : "Could not save your changes.");return false;}finally{saveLock.current=false;setSaving(false);}
  }
    /** Opens the selected item editor and clears stale feedback. */
  function open(next: Editor) { if(next?.type==="journey"&&next.journey){openedLink.current=next.journey.id;const url=new URL(location.href);url.searchParams.set("journey",next.journey.id);history.replaceState(null,"",url.pathname+url.search);} setError(""); setEditor(next); }
  /** Selects a mobile list without displaying every secondary destination as a tab. */
  function chooseMobileList(id:string){setJourneyView(["completed","archive"].includes(id)?id:"board");setMobileStatus(id);setStatusFilter("all");setRange(["completed","archive","all"].includes(id)?"all":"upcoming");}
    /** Closes the active editor and clears its transient feedback. */
  function close() { if(saving)return; setEditor(null);openedLink.current=null;const url=new URL(location.href);url.searchParams.delete("journey");history.replaceState(null,"",url.pathname+url.search); setError(""); }
    /** Persists the edited journey while retaining the other account travel plans. */
  /** Attaches an IRCTC PDF straight from the journey: stores it, reads its details and marks the trip booked. */
  async function attachTicketFile(j: Journey, file: File) {
    setBusyLabel("Reading your ticket…");
    try {
      if (file.type !== "application/pdf") throw new Error("Choose the IRCTC e-ticket PDF.");
      const meta = validateTicketFile(file);
      let details: TicketDetails = {};
      try { details = (await extractTicketFile(file, setBusyLabel)).details; } catch { /* manual entry stays available */ }
      if (details.date && details.date !== j.date && !await ask(`This ticket is for ${formatDay(details.date)}, not ${formatDay(j.date)}. Attach it anyway?`)) return;
      await saveTicketFile(meta.id, file, meta.name);
      const base = j.status === "needs_booking" ? transitionJourney(j, "booked") : j;
      const fill = (key: keyof TicketDetails) => (details[key] ? { [key]: details[key] } : {});
      const next: Journey = { ...base, ...fill("trainNumber"), ...fill("trainName"), ...fill("travelClass"), ...fill("pnr"), ...fill("coach"), ...fill("seat"), ...fill("berth"), ...fill("ticketStatus"), ...fill("arrival"), ...fill("arrivalDate"), ...(details.fare ? { fare: details.fare } : {}), ...(details.departure ? { departure: details.departure, departureConfirmed: true } : {}), attachments: [...(base.attachments ?? []), meta], readTickets: [...(base.readTickets ?? []), meta.id] };
      if (await update(next)) setEditor({ type: "journey", journey: next });
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t attach this ticket."); }
    finally { setBusyLabel(""); }
  }
  /** Opens the file picker for one journey and attaches the chosen PDF. */
  function pickTicketFor(j: Journey) { const input = document.createElement("input"); input.type = "file"; input.accept = "application/pdf,.pdf"; input.onchange = () => { const f = input.files?.[0]; if (f) void attachTicketFile(j, f); }; input.click(); }
  /** Skips one planned trip (it stays in Cancelled as skipped) or restores a skipped one. */
  /** Shared to RailWatch from another app: ticket PDFs open Attach tickets; PNR result text or a screenshot updates its journey after confirming. */
  async function receiveShared() {
    const shared = await takeShared(); if (!shared) return;
    const pdfs = shared.files.filter(f => f.type === "application/pdf");
    if (pdfs.length) { open({ type: "tickets", files: pdfs }); return; }
    let text = shared.text;
    for (const image of shared.files.filter(f => f.type.startsWith("image/"))) {
      setBusyLabel("Reading the shared screenshot…");
      try { const bitmap = await createImageBitmap(image), canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")!.drawImage(bitmap, 0, 0); text += "\n" + await recognizeTicket(canvas); } catch { /* fall through to "couldn't read" */ }
    }
    setBusyLabel("");
    const pnr = parseSharedPnr(text), summary = sharedPnrSummary(pnr);
    if (!pnr.pnr || !summary) { setError("Couldn’t find a PNR status in what was shared. Share the PNR result page text or a screenshot of it."); return; }
    const found = (await apiRequest<JourneyPages>(`/api/railwatch/journeys?view=list&range=all&q=${pnr.pnr}`)).pages.all?.items.find(j => j.pnr === pnr.pnr);
    if (!found) { setError(`No journey has PNR ${pnr.pnr}. Add the PNR to the journey first.`); return; }
    const first = pnr.passengers.find(p => p.status !== "CAN"), trip = `${found.from} → ${found.to} on ${formatDay(found.date)}`;
    if (summary === "CAN") {
      if (await ask(`The PNR shows every passenger cancelled. Mark ${trip} cancelled?`, { confirmLabel: "Mark cancelled", danger: true })) await commit({ ...planner, journeys: [...planner.journeys.filter(j => j.id !== found.id), transitionJourney(found, "cancelled")] }, "Trip marked cancelled.", false, [found]);
      return;
    }
    const seat = first?.coach ? `${first.coach}${first.berth ? ` / ${first.berth}` : ""}${first.berthType ? ` ${first.berthType}` : ""}` : summary === "WL" ? `WL ${first?.position ?? ""}`.trim() : summary;
    if (!await ask(`Update ${trip}: ${seat}${pnr.chartPrepared ? " · chart prepared" : ""}?`, { confirmLabel: "Update journey" })) return;
    const next: Journey = { ...found, ticketStatus: summary, currentStatus: summary === "WL" && first?.position ? `WL ${first.position}` : summary, ...(first?.coach ? { coach: first.coach } : {}), ...(first?.berth ? { seat: first.berth } : {}), ...(first?.berthType ? { berth: first.berthType } : {}), statusLog: [...(found.statusLog ?? []), { at: new Date().toISOString(), status: summary }].slice(-40) };
    await commit({ ...planner, journeys: [...planner.journeys.filter(j => j.id !== found.id), next] }, "PNR status updated.", false, [found]);
  }
  useEffect(() => { if (new URL(location.href).searchParams.get("shared") !== "1") return; const t = setTimeout(() => { history.replaceState(null, "", location.pathname); void receiveShared(); }, 0); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arriving from the share sheet
  async function skipJourney(j: Journey) { if (!await ask(`Skip ${j.from} → ${j.to} on ${formatDay(j.date)}? You won't be reminded to book it.`)) return; void update(transitionJourney(j, "skipped")).then(saved => { if (saved && editor?.type === "journey") close(); }); }
  function restoreJourney(j: Journey) { void update(transitionJourney(j, "needs_booking")); }
  /** Waitlist tracking: records a new WL/RAC/CNF status (typed or pasted from the PNR SMS) with its history. */
  function updateTicketStatus(j: Journey, text: string) {
    const parsed = parseBookingStatus(text);
    if (!parsed) { setError("Type a status like WL 4, RAC 2 or CNF, or paste the IRCTC PNR SMS."); return false; }
    const log = [...(j.statusLog ?? []), { at: new Date().toISOString(), status: parsed.currentStatus }].slice(-40);
    void update({ ...j, ticketStatus: parsed.ticketStatus, currentStatus: parsed.currentStatus, statusLog: log });
    return true;
  }
  function update(j: Journey) { return commit({ ...planner, journeys: planner.journeys.map(old => old.id === j.id ? j : old) }, "Journey updated."); }
    /** Changes a journey board status and records an undo opportunity. */
  async function move(id: string, column: string) {
    const j = planner.journeys.find(j => j.id === id); if (!j || j.status === column) return;
    const status = column as Journey["status"];
    if (await update(transitionJourney(j, status))) { setUndo({ id, status: j.status, next: status }); setNotice(`Moved to ${STATUS[status].toLowerCase()}.`); }
  }
    /** Reverts the last supported board status change. */
  function undoMove() {
    if (!undo) return; const journey = planner.journeys.find(j => j.id === undo.id);
    if (journey?.status === undo.next) update(transitionJourney(journey, undo.status));
  }
    /** Archives or restores a journey without deleting its record or entered ticket details. */
  function archiveJourney(j: Journey) { update({ ...j, archivedAt: j.archivedAt ? undefined : today, cancelledAt:j.archivedAt && ["cancelled","skipped"].includes(j.status)?today:j.cancelledAt }); }
    /** Exports the account planner and available original ticket files. */
  async function backup() {
    try { download("railwatch-backup.json", loaded.invalid && raw ? raw : await exportTicketBackup((await apiRequest<AccountWorkspace>("/api/railwatch/workspace")).planner), "application/json"); setNotice("Workspace backup downloaded, including available ticket files."); }
    catch (e) { setError(e instanceof Error ? e.message : "Backup failed."); }
  }
    /** Validates and persists routine changes while keeping booked occurrences. */
  // First run saves the outbound routine and then its linked return; the second save needs the first one's revision.
  const latestRevision=useRef(revision);latestRevision.current=revision;
  async function saveFirstRunRoutine(rule:Rule){try{const saved=await apiRequest<AccountWorkspace>("/api/railwatch/routines",{method:"POST",body:JSON.stringify({action:"save",rule,revision:latestRevision.current})});latestRevision.current=saved.revision;setRemote(JSON.stringify(saved.planner));setRevision(saved.revision);setNotice("Routine saved. Future journeys are ready.");return true;}catch(e){setError(e instanceof Error?e.message:"Could not save this routine.");return false;}}
  async function saveRoutine(rule: Rule,reviewRevision:number) { if(await routineAction("save","Routine saved. Future journeys are ready.",undefined,rule,reviewRevision))close(); }
  /** Previews changes against every canonical occurrence without saving the proposed routine. */
  async function previewRoutine(rule:Rule){return apiRequest<RoutineChangePreview>("/api/railwatch/routines",{method:"POST",body:JSON.stringify({action:"preview",rule,revision,baseRule:editor?.type==="rule"&&editor.rule?.id?editor.rule:undefined})});}
  /** Applies canonical routine changes without downloading or rewriting unloaded occurrences. */
  async function routineAction(action:"save"|"pause"|"resume"|"remove",message:string,id?:string,rule?:Rule,reviewRevision?:number){
    if(saveLock.current)return false;saveLock.current=true;setSaving(true);
    try{const saved=await apiRequest<AccountWorkspace>("/api/railwatch/routines",{method:"POST",body:JSON.stringify({action,id,rule,revision:reviewRevision??revision})});setRemote(JSON.stringify(saved.planner));setRevision(saved.revision);setNotice(message);setError("");return true;}catch(e){setError(e instanceof Error?e.message:"Could not update this routine.");return false;}finally{saveLock.current=false;setSaving(false);}
  }
  /** Removes a routine while retaining booked tickets and individual exceptions on the server. */
  async function removeRoutine(rule:Rule){if(await ask(`Remove ${rule.name} and its unbooked generated journeys? Booked tickets and individual exceptions will stay.`))void routineAction("remove","Routine removed. Tickets and exceptions preserved.",rule.id);}
    /** Validates and saves a time-off entry. */
  async function addHoliday(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const start = String(form.get("date")); const end = String(form.get("end") || start);
    const h = holidaySchema.safeParse({ id: crypto.randomUUID(), name: form.get("name"), date: start, type: form.get("type") });
    if (!h.success || !isDay(end) || end < start || daysBetween(start, end) > 366) { setError("Choose a name and valid dates, no more than a year apart."); return; }
    const holidays = [...planner.holidays];
    for (let date = start; date <= end; date = addDays(date, 1)) if (!holidays.some(x => x.date === date && x.name.toLowerCase() === h.data.name.toLowerCase())) holidays.push({ ...h.data, id: crypto.randomUUID(), date });
    if (await commit({ ...planner, holidays }, "Time off added to your calendar.")) close();
  }
  /** Removes only the selected stored day after the existing confirmation. */
  async function removeTimeOff(id: string) {
    const day = planner.holidays.find(item => item.id === id);
    if (day && await ask(`Remove ${day.name} on ${formatDay(day.date)}?`))
      void commit({ ...planner, holidays: planner.holidays.filter(item => item.id !== id) }, "Time off removed.");
  }
  /** Parses a holiday import and adds validated entries to the current account. */
  /** Adds parsed holidays that aren't already present (same date and name). */
  async function importHolidays(text: string, list?: Omit<Planner["holidays"][number], "id">[]) {
    try { const holidays = [...planner.holidays]; const parsed = list ?? parseHolidayCSV(text);
      for (const h of parsed) if (!holidays.some(x => x.date === h.date && x.name.toLowerCase() === h.name.toLowerCase())) holidays.push({ ...h, id: crypto.randomUUID() });
      if (await commit({ ...planner, holidays }, `${holidays.length - planner.holidays.length} holidays imported.`)) close();
    } catch (e) { setError(e instanceof Error ? e.message : "Check the CSV file."); }
  }
    /** Validates a backup, restores its files, and saves the account workspace. */
  async function restore(file?: File) {
    if (!file) return; if (file.size > 80000000) { setError("Choose a backup smaller than 80 MB."); return; }
    const previous: { id: string; blob?: Blob }[] = [];
    try {
      const value = JSON.parse(await file.text()); const next = migratePlanner(value); const files = decodeBackupFiles(value, next);
      if (!await ask("Replace this browser’s plans with this backup?")) return;
      for (const file of files) { previous.push({ id: file.id, blob: await getTicketFile(file.id) }); await saveTicketFile(file.id, file.blob, next.journeys.flatMap(j=>j.attachments??[]).find(f=>f.id===file.id)?.name); }
      if (!await commit(next, "Backup restored, including its ticket files.", true)) throw new Error("Could not save restored plans.");
    } catch (e) {
      await Promise.all(previous.map(f => (f.blob ? saveTicketFile(f.id, f.blob) : deleteTicketFile(f.id)).catch(() => undefined)));
      setError(e instanceof Error ? e.message : "That file is not a valid RailWatch backup.");
    }
  }
    /** Reloads account workspace and policy after administrator changes. */
  async function refreshWorkspace(){const saved=await apiRequest<AccountWorkspace>("/api/railwatch/workspace?partial=1",{cache:"no-store"});setRemote(JSON.stringify(saved.planner));setRevision(saved.revision);router.refresh();}
    /** Returns travel, booking, and time-off events for the selected calendar day. */
  function eventsFor(date: string) {
    const journeys = calendarLayers.journeys ? sorted.filter(j => j.date === date && !j.archivedAt && !["skipped", "cancelled", "completed"].includes(j.status) && calendarStatuses[j.status] !== false) : [];
    const bookings = calendarLayers.bookings ? sorted.filter(j => bookingDay(j) === date && !j.archivedAt && j.status === "needs_booking") : [];
    const holidays = calendarLayers.holidays ? planner.holidays.filter(h => h.date === date) : [];
    return { journeys, bookings, holidays };
  }
    /** Moves the calendar to the previous or next month. */
  function shiftMonth(offset: number) { const d = new Date(`${firstDay}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); setMonth(d.toISOString().slice(0, 7)); }
    /** Selects a calendar date and keeps month navigation in sync. */
  function chooseDay(date: string) { setDay(date); setMonth(date.slice(0, 7)); }
  /** Seven-day view around the selected day with every event listed; uses the loaded month range (plan 2.6). */
  /** "9 – 15 November" for the week that holds the selected day. */
  function weekLabel() { const start = addDays(activeDay, -((weekday(activeDay) - planner.settings.weekStartsOn + 7) % 7)), end = addDays(start, 6); return `${Number(start.slice(-2))} – ${formatDay(end, { day: "numeric", month: "long" })}`; }
  function weekView() {
    const start = addDays(activeDay, -((weekday(activeDay) - planner.settings.weekStartsOn + 7) % 7));
    return <section className={s.weekView} aria-label={`Week of ${formatDay(start, { day: "numeric", month: "long" })}`}>
      <div className={s.weekColumns}>{Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i), events = eventsFor(date); return <div key={date} className={`${s.weekColumn} ${date === today ? s.weekColumnToday : ""}`}>
        <button className={s.weekColumnHead} aria-label={`View ${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}`} onClick={() => { chooseDay(date); open({ type: "day", date }); }}><small>{formatDay(date, { weekday: "short" })}</small><b>{Number(date.slice(-2))}</b></button>
        {events.holidays.map(h => <button key={h.id} className={s.holidayEvent} onClick={() => { chooseDay(date); open({ type: "day", date }); }}>{h.name}</button>)}
        {events.bookings.map(j => <button key={"b" + j.id} className={s.bookingEvent} onClick={() => open({ type: "journey", journey: j })}>Book: {stationLabel(j.from)} → {stationLabel(j.to)}</button>)}
        {events.journeys.map(j => <button key={j.id} className={j.status === "cancellation_needed" ? s.cancelEvent : j.status === "needs_booking" ? s.plannedEvent : s.journeyEvent} onClick={() => open({ type: "journey", journey: j })}>{stationLabel(j.from)} → {stationLabel(j.to)} · {j.status === "needs_booking" ? "Planned" : STATUS[j.status]}</button>)}
      </div>; })}</div>
    </section>;
  }
  if (!now || raw === null) return <div className={s.loading}><TrainFront /><span>Loading your travel space…</span></div>;
  return <MobileHeaderActions.Provider value={mobile?<NotificationBell openJourney={id=>router.push(journeyLink(id))}/>:null}><div className={s.app} data-mobile={mobile?"true":"false"} data-theme={planner.settings.theme} data-sidebar={sidebar}>
    {viewTicket&&<TicketViewer file={viewTicket} close={()=>setViewTicket(undefined)}/>}
    <div className={s.profileOnly}><Profile docked={settingsDocked} settingsRef={profileSettings} account={{...account,name:displayName}} planner={planner} onProfile={async user=>{setDisplayName(user.name);await refreshWorkspace();}} commit={commit} notice={setNotice} fail={setError} backup={()=>void backup()} restore={file=>void restore(file)} exportCalendar={exportCalendar}/></div>{!mobile&&<aside className={s.sidebar} inert={saving}><div className={s.brandRow}><button className={s.brand} onClick={() => setTab("home")} aria-label="RailWatch Today"><span><RailWatchMark size={30} /></span><b>RailWatch</b></button><button type="button" className={`${s.iconButton} ${s.sidebarToggle}`} aria-label={sidebar==="expanded"?"Collapse menu":"Expand menu"} title={sidebar==="expanded"?"Collapse menu":"Expand menu"} aria-expanded={sidebar==="expanded"} aria-controls="planner-navigation" onClick={toggleSidebar}>{sidebar==="expanded"?<PanelLeftClose size={18}/>:<PanelLeftOpen size={18}/>}</button></div><nav id="planner-navigation" aria-label="Planner navigation">{navItems.filter(n=>PRIMARY.has(n.id)).map((n,i) => <Fragment key={n.id}>{i>0&&!PRIMARY.has(n.id)&&PRIMARY.has(navItems[i-1].id)&&<hr className={s.navDivider}/>}<Link href={PATHS[n.id]} key={n.id} aria-label={n.label} title={n.label} aria-current={activeNav === n.id ? "page" : undefined} className={`${activeNav === n.id ? s.navActive : s.navItem} ${PRIMARY.has(n.id) ? "" : s.extraNav}`} onClick={() => setError("")}><n.icon size={18} /><span data-short={n.short}>{n.label}</span>{n.id === "home" && (dashboard.data?.totals.attention ?? 0) > 0 && <b className={s.navCount}>{dashboard.data!.totals.attention}</b>}</Link></Fragment>)}</nav><Profile openSettings={()=>router.push("/settings#settings-profile")} variant="sidebar" theme={{label:planner.settings.theme==="light"?"Switch to dark theme":"Switch to light theme",toggle:() => commit({ ...planner, settings: { ...planner.settings, theme: planner.settings.theme === "light" ? "dark" : "light" } }, "Color theme updated.")}} account={{...account,name:displayName}} planner={planner} onProfile={async user=>{setDisplayName(user.name);await refreshWorkspace();}} commit={commit} notice={setNotice} fail={setError} backup={()=>void backup()} restore={file=>void restore(file)} exportCalendar={exportCalendar}/></aside>}
    <ConfirmHost /><TopProgress active={Boolean(pages.pending||pages.busy||dashboard.pending||calendar.pending||selectedDay.pending)} /><BusyPill label={busyLabel} />
    <div className={s.main}>{mobile&&!moreOpen&&!["home","journeys","vault","calendar"].includes(tab)&&<header className={s.topbar}>{mobile?(["holidays","routines","vault","spend","settings","workspace","users","integrations","operations"].includes(tab)&&!moreOpen?<button className={s.mobileBrand} onClick={()=>setMoreOpen(true)} aria-label="Back to More"><ChevronLeft size={22} aria-hidden="true"/>More</button>:<button className={s.mobileBrand} onClick={()=>{setMoreOpen(false);setTab("home");}} aria-label="RailWatch Home"><RailWatchMark size={24}/>RailWatch</button>):<span />}<div>{!mobile&&<span>{saving ? "Saving…" : formatDay(today, { day: "numeric", month: "short", year: "numeric" })}{!saving && " · IST"}</span>}<button className={s.iconButton} aria-label="Toggle color theme" onClick={() => commit({ ...planner, settings: { ...planner.settings, theme: planner.settings.theme === "light" ? "dark" : "light" } }, "Color theme updated.")}>{planner.settings.theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><NotificationBell openJourney={id=>router.push(journeyLink(id))}/></div></header>}<main ref={viewMotion} className={`${s.content} ${journeyDocked ? s.contentDocked : ""}`} inert={saving}>
      {(!mobile||!["home","journeys","vault","calendar","routines","holidays"].includes(tab))&&!moreVisible&&!(tab==="journeys"&&!mobile)&&!(tab==="calendar"&&!mobile)&&<div className={s.pageHead}><div>{tab==="home"&&today&&<span className={s.pageEyebrow}>{formatDay(today,{weekday:"long",day:"numeric",month:"long"})} · IST</span>}<h1>{({ home: `${greeting(now)}, ${displayName.trim().split(/\s+/)[0]}`, journeys: "Journeys", calendar: "Calendar", routines: "Routines", holidays: "Time off", vault: "Tickets", spend: "Spend", settings: "Settings",workspace:"Settings",users:"Settings",integrations:"Settings",operations:"Settings" })[tab]}</h1><p>{({ home: "", journeys: "Plan journeys, track tickets, and manage your travel.", calendar: "Journeys, booking dates, and time off in one calendar.", routines: "Create repeat journeys on a schedule that works for you.", holidays: "Company holidays and your leave. Routines skip these days when you choose.", vault: "Your original tickets, linked to every journey.", spend: "What your train travel costs, read from your attached tickets.", settings: "",workspace:"Common rules and feature availability for every account.",users:"Manage the accounts that use this RailWatch instance.",integrations:"Configure Telegram and Google Calendar for your users.",operations:"Check scheduled reminders and recover missed deliveries." })[tab]}</p></div><div className={s.pageActions}>{tab==="settings"&&<span aria-live="polite" className={s.savedState}>{saving?"Saving…":"All changes saved"}</span>}{!mobile&&<NotificationBell openJourney={id=>router.push(journeyLink(id))}/>}{!mobile&&!moreVisible&&tab === "holidays" && <button className={s.secondary} onClick={() => open({type:"import"})}><ArrowDownToLine size={15}/>Import CSV or ICS</button>}{!mobile&&!moreVisible&&tab === "vault" && policy.ticketUploadsEnabled && <button className={s.secondary} onClick={() => open({type:"tickets"})}><ArrowDownToLine size={15}/>Attach tickets</button>}{!(mobile&&tab==="spend") && tab !== "settings" && tab !== "workspace" && tab !== "users" && tab !== "integrations" && tab !== "operations" && <button className={s.primary} onClick={() => open(tab === "routines" ? { type: "rule" } : tab === "holidays" ? { type: "holiday" } : { type: "journey" })}><Plus size={17} />{tab === "routines" ? "New routine" : tab === "holidays" ? "Add time off" : "New journey"}</button>}</div></div>}
      {mobile&&saving&&<p role="status">Saving changes…</p>}{(dashboard.pending||calendar.pending)&&<div role="status" aria-label="Loading" className={s.skeleton}><span/><span/><span/></div>}{(dashboard.error||calendar.error)&&closedError!==(dashboard.error||calendar.error)&&<Toast key={dashboard.error||calendar.error} error message={dashboard.error||calendar.error} dismiss={()=>setClosedError(dashboard.error||calendar.error)} action={{label:"Reload",run:()=>{dashboard.refresh();calendar.refresh();}}}/>}{listView&&!mobile&&tab!=="journeys"&&<>{pages.pending&&!pages.error&&<p role="status">Loading journeys…</p>}{pages.error&&closedError!==pages.error&&<Toast key={pages.error} error message={pages.error} dismiss={()=>setClosedError(pages.error)} action={{label:"Reload",run:pages.refresh}}/>}</>}
      {loaded.invalid && !invalidDismissed && <Toast error message="Saved data could not be read. Restore a valid backup in User Settings; your data has been preserved." dismiss={()=>setInvalidDismissed(true)}/>}
      {notice && !error && <Toast key={`${raw}-${notice}`} message={notice} dismiss={() => { setNotice(""); setUndo(null); }} undo={undo ? undoMove : undefined} />}
      {error && <Toast key={error} error message={error} dismiss={() => setError("")} />}

      {mobile&&!moreVisible&&<>
        {listView&&pages.pending&&!pages.error&&<p role="status">Loading journeys…</p>}{listView&&pages.error&&closedError!==pages.error&&<Toast key={pages.error} error message={pages.error} dismiss={()=>setClosedError(pages.error)} action={{label:"Reload",run:pages.refresh}}/>}
        {tab==="home"&&dashboard.data&&<MobileHome attach={pickTicketFor} today={today} skip={skipTimeOff} keep={keepTimeOff} data={dashboard.data} open={journey=>open({type:"journey",journey})} view={setViewTicket} plan={()=>open({type:"journey"})} go={status=>{setTab("journeys");setJourneyView("board");setStatusFilter(status==="needs_booking"?"ready":status);setMobileStatus(status==="needs_booking"?"needs_booking":status);setRange("upcoming");setSearch("");}}/>}
        {tab==="journeys"&&<MobileScreen title="Journeys">
          <div className={m.tools}><label className={s.search}><Search size={16}/><input aria-label="Search journeys" placeholder="Station, date or PNR" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className={s.iconButton} aria-label="Journey filters" aria-expanded={showFilters} onClick={()=>setShowFilters(!showFilters)}><ListFilter size={20}/></button></div>
          <div className={m.segments} aria-label="Journey lists">{[["booked","Booked"],["needs_booking","Planned"],["cancellation_needed","To cancel"]].map(([id,label])=><button key={id} aria-pressed={journeyView==="board"&&mobileStatus===id} onClick={()=>chooseMobileList(id)}>{label}{typeof pages.data?.pages[id]?.total==="number"&&<b className={m.segCount} aria-hidden="true"> {pages.data.pages[id]!.total}</b>}</button>)}<ActionMenu label="More journey lists" actions={[["cancelled","Cancelled"],["completed","History"],["archive","Archive"],["all","All journeys"]].map(([id,label])=>({label,onClick:()=>chooseMobileList(id)}))}/></div>{(["cancelled","completed","archive","all"].includes(mobileStatus))&&<p className={s.help}>{mobileStatus==="completed"?"History":mobileStatus==="archive"?"Archive":mobileStatus==="all"?"All journeys":"Cancelled"}</p>}
                    {showFilters&&<div className={s.form}><Field label="Routine"><Select value={routineFilter} onChange={e=>setRoutineFilter(e.target.value)}><option value="">All routines</option>{planner.rules.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field><Field label="Journey period"><Select value={range} onChange={e=>setRange(e.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past journeys</option><option value="all">All dates</option></Select></Field><Field label="Travel from"><DateInput value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></Field><Field label="Travel through"><DateInput value={dateTo} onChange={e=>setDateTo(e.target.value)} /></Field><Field label="Sort journeys"><Select value={sort} onChange={e=>setSort(e.target.value)}><option value="travel">Travel date</option><option value="booking">Booking date</option></Select></Field><button className={s.secondary} onClick={()=>{setStatusFilter("all");setSearch("");setRoutineFilter("");setDateFrom("");setDateTo("");setRange(journeyView==="board"?"upcoming":"all");}}>Clear filters</button></div>}
          {statusFilter!=="all"&&<button className={s.secondary} onClick={()=>setStatusFilter("all")}>Clear {statusFilter==="ready"?"ready to book":"status"} filter</button>}
          <MonthList items={filtered.filter(j=>journeyView!=="board"||mobileStatus==="all"||(mobileStatus==="cancelled"?["cancelled","skipped"].includes(j.status):j.status===mobileStatus))} date={j=>j.date} render={j=><div key={j.id}><MobileJourneyRow journey={j} open={()=>open({type:"journey",journey:j})}/>{(j.archivedAt||["completed","cancelled","skipped"].includes(j.status))&&<button className={s.textButton} onClick={()=>archiveJourney(j)}>{j.archivedAt?"Restore":"Archive"}</button>}</div>}/>
          {!pages.pending&&!filtered.some(j=>journeyView!=="board"||mobileStatus==="all"||(mobileStatus==="cancelled"?["cancelled","skipped"].includes(j.status):j.status===mobileStatus))&&<p className={m.emptyText}>No journeys in this list.</p>}
          {Object.entries(pages.data?.pages??{}).filter(([key,page])=>page.nextCursor&&(journeyView!=="board"||mobileStatus==="all"||key===mobileStatus)).map(([key])=><button key={key} className={s.secondary} disabled={pages.busy} onClick={()=>void pages.more(key)}>Load more {key==="all"?"journeys":STATUS[key as Journey["status"]].toLowerCase()}</button>)}
        </MobileScreen>}
        {tab==="vault"&&<MobileScreen title="Tickets" action={<button className={s.iconButton} aria-label="Refresh tickets" onClick={pages.refresh}><RefreshCw size={19}/></button>}><label className={s.search}><Search size={16}/><input aria-label="Search tickets" placeholder="Search tickets" value={vaultSearch} onChange={e=>setVaultSearch(e.target.value)}/></label><MonthList items={filtered.flatMap(j=>(j.attachments??[]).filter(file=>file.type==="application/pdf").map(file=>({j,file})))} date={x=>x.j.date} render={({j,file})=><div className={m.ticket} key={file.id}><MobileJourneyRow journey={j} accessibleLabel={`View ticket ${j.from} to ${j.to}`} open={()=>setViewTicket(file)}/><ActionMenu label={`Ticket Actions For ${j.from} to ${j.to}`} actions={[{label:"Journey details",onClick:()=>open({type:"journey",journey:j})},{label:"Download ticket",onClick:()=>void downloadTicketFile(file).catch(e=>setError(e.message))}]}/></div>}/>{!pages.pending&&!filtered.length&&<p className={m.emptyText}>Upload a PDF in a booked journey to keep your ticket here.</p>}{pages.data?.pages.all?.nextCursor&&<button className={s.secondary} disabled={pages.busy} onClick={()=>void pages.more("all")}>Load more tickets</button>}</MobileScreen>}
        {tab==="calendar"&&<MobileScreen title={activeDay?formatDay(activeDay,{month:"long"}):"Calendar"} action={<div className={m.tools}><button className={s.iconButton} aria-label="Previous week" onClick={()=>chooseDay(addDays(activeDay,-7))}><ChevronLeft size={20}/></button>{activeDay!==today&&<button className={s.secondary} onClick={()=>chooseDay(today)}>Today</button>}<button className={s.iconButton} aria-label="Next week" onClick={()=>chooseDay(addDays(activeDay,7))}><ChevronRight size={20}/></button><DateInput className={m.dateJump} aria-label="Choose date" title="Choose date" value={activeDay} onChange={e=>{if(isDay(e.target.value))chooseDay(e.target.value);}}/></div>}><MobileWeek date={activeDay} choose={chooseDay} count={date=>(calendarLayers.journeys?calendar.data?.counts[date]?.journeys??0:0)+(calendarLayers.bookings?calendar.data?.counts[date]?.bookings??0:0)+(calendarLayers.holidays?planner.holidays.filter(h=>h.date===date).length:0)}/><div className={m.chips} role="group" aria-label="Show on the calendar">{Object.entries(calendarLayers).map(([key,enabled])=><button type="button" key={key} aria-pressed={enabled} onClick={()=>setCalendarLayers({...calendarLayers,[key]:!enabled})}>{key==="bookings"?"Booking dates":key==="holidays"?"Time off":"Journeys"}</button>)}</div><section aria-label="Day agenda" className={m.agenda}><h2>{activeDay===today?"Today · ":""}{formatDay(activeDay,{weekday:"short",day:"numeric",month:"short"})}</h2>{selectedDay.pending&&<p role="status">Loading events…</p>}{selectedDay.error&&<><p role="alert">{selectedDay.error}</p><button className={s.reloadButton} aria-label="Refresh events" onClick={selectedDay.refresh}><RefreshCw size={18}/></button></>}<div className={m.list}>{dayEvents.journeys.map(j=><MobileJourneyRow key={j.id} journey={j} open={()=>open({type:"journey",journey:j})} label={j.status==="needs_booking"?"Planned":STATUS[j.status]}/>)}{dayEvents.bookings.map(j=><MobileJourneyRow key={"b"+j.id} journey={j} booking open={()=>open({type:"journey",journey:j})}/>)}</div>{dayEvents.holidays.map(h=><div className={m.ev} data-kind="off" key={h.id}><span>{h.name}</span><small>{h.type==="company"?"Holiday":"Leave"}</small></div>)}{!selectedDay.pending&&!dayEvents.journeys.length&&!dayEvents.bookings.length&&!dayEvents.holidays.length&&<p className={m.emptyText}>Nothing planned for this day.</p>}{selectedDay.data?.nextCursor&&<button className={s.secondary} disabled={selectedDay.busy} onClick={()=>void selectedDay.more()}>Load more day events</button>}</section></MobileScreen>}
      </>}
      {mobile&&!moreVisible&&tab==="routines"&&<RoutineOverview mobile planner={planner} today={today} edit={rule=>open({type:"rule",rule})} toggle={async rule=>{if(rule.paused||await ask("Pause this routine? Future unbooked journeys will be removed. Booked tickets and individual changes stay."))void routineAction(rule.paused?"resume":"pause",rule.paused?"Routine resumed.":"Routine paused.",rule.id);}} remove={removeRoutine}/>}
      {mobile&&!moreVisible&&tab==="holidays"&&<MobileScreen title="Time off" action={<div className={m.tools}><button className={s.secondary} onClick={()=>open({type:"import"})}>Import</button><button className={s.iconButton} aria-label="Add time off" onClick={()=>open({type:"holiday"})}><Plus size={22}/></button></div>}><TimeOffOverview holidays={planner.holidays} today={today} remove={removeTimeOff} breaks={breaks} plan={date=>open({type:"journey",date})} journeys={planner.journeys} open={journey=>open({type:"journey",journey})} skip={skipTimeOff} keep={keepTimeOff}/></MobileScreen>}
      {mobile&&moreOpen&&<MobileMore name={displayName} admin={account.role==="ADMIN"} hints={{timeOff:(()=>{const h=planner.holidays.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];return h?`${h.name} · ${formatDay(h.date,{day:"numeric",month:"short"})}`:undefined;})(),routines:planner.rules.length?`${planner.rules.filter(r=>!r.paused).length} active`:undefined,reminders:[planner.settings.emailEnabled&&"Email",planner.settings.telegramEnabled&&"Telegram",planner.settings.whatsappEnabled&&"WhatsApp"].filter(Boolean).join(", ")||undefined}} missingTickets={planner.journeys.filter(j=>!j.archivedAt&&j.status==="booked"&&j.date>=today&&!j.attachments?.length).length} close={()=>setMoreOpen(false)} openSettings={()=>profileSettings.current?.open()} theme={{label:planner.settings.theme==="light"?"Switch to dark theme":"Switch to light theme",toggle:() => commit({ ...planner, settings: { ...planner.settings, theme: planner.settings.theme === "light" ? "dark" : "light" } }, "Color theme updated.")}} signOut={async()=>{try{await apiRequest("/api/auth/logout",{method:"POST"});await wipeOffline();router.replace("/login");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Sign out failed.");}}}/>}
      {dashboard.data&&<FirstRun planner={planner} empty={!planner.rules.length&&!planner.holidays.length&&!dashboard.data.totals.upcoming} saveRoutine={saveFirstRunRoutine} importHolidays={()=>open({type:"import"})} addTimeOff={()=>open({type:"holiday"})} reminders={()=>router.push("/settings#settings-reminders")} email={account.email} enableEmail={policy.remindersEnabled?()=>commit({...planner,settings:{...planner.settings,emailEnabled:true}},"Email reminders are on."):undefined}/>}
      {!mobile&&tab === "home" && dashboard.data && <Dashboard updateStatus={updateTicketStatus} attachTicket={pickTicketFor} remind={j=>{const cur=j.reminderOverride,clock=cur?.clock??planner.settings.reminderClock??DEFAULT_CLOCK,times=cur?.mode==="custom"?cur.times:[...planner.settings.reminderTimes];const on=cur?.mode==="custom"&&times.includes("opening");void update({...j,reminderOverride:{...(cur??{}),mode:"custom",clock,times:on?times.filter(x=>x!=="opening"):[...new Set([...times,"opening" as const])]}}).then(saved=>{if(saved)setNotice(on?"Opening reminder removed.":"You’ll be reminded when booking opens.");});}} openBookingDay={j=>open({type:"booking",journey:j})} importTickets={policy.ticketUploadsEnabled?()=>open({type:"tickets"}):undefined} planner={planner} today={today} data={dashboard.data} skipTimeOff={skipTimeOff} keepTimeOff={keepTimeOff} setStatus={(j,status)=>void update(transitionJourney(j,status)).then(saved=>{if(saved){setNotice(`Moved to ${STATUS[status].toLowerCase()}.`);dashboard.refresh?.();}})} openJourney={journey => open({ type: "journey", journey })} createJourney={() => open({ type: "journey" })} chooseDate={date => { chooseDay(date); setTab("calendar"); }} go={(target, status) => { setTab(target); if (target === "journeys") { setQuick("all");setDesktopRange({from:status==="completed"?"":today,to:"",period:"all"}); setStatusFilter(status === "needs_booking" ? "ready" : status === "completed" ? "all" : status || "all"); setMobileStatus(status === "needs_booking" ? "needs_booking" : status === "cancellation_needed" ? "cancellation_needed" : "booked"); setJourneyView(status === "completed" ? "completed" : "board"); setRange(status === "completed" ? "all" : "upcoming"); setSearch(""); setRoutineFilter(""); setDateFrom(""); setDateTo(""); } }} />}
      {!mobile&&tab === "journeys" && <DesktopJourneys selectedId={journeyDocked&&editor?.type==="journey"?editor.journey?.id:undefined} bell={<NotificationBell openJourney={id=>router.push(journeyLink(id))}/>} today={today} now={now} rows={filtered} rules={planner.rules} data={pages.data} pending={pages.pending} error={pages.error} busy={pages.busy} section={journeyView} layout={desktopLayout} search={search} routine={routineFilter} status={statusFilter} sort={sort} quick={quick} range={desktopRange} sectionChange={value=>{setJourneyView(value);setStatusFilter("all");setQuick("all");setDesktopRange(value==="board"?{from:today,to:"",period:"all"}:{from:"",to:"",period:"all"});}} layoutChange={setDesktopLayout} searchChange={setSearch} routineChange={setRoutineFilter} statusChange={setStatusFilter} sortChange={setSort} quickChange={value=>{setQuick(value);setStatusFilter("all");}} rangeChange={setDesktopRange} refresh={pages.refresh} more={pages.more} open={journey=>open({type:"journey",journey})} create={()=>open({type:"journey"})} archive={archiveJourney} move={move} skip={skipJourney} restore={restoreJourney} attachTickets={policy.ticketUploadsEnabled?()=>open({type:"tickets"}):undefined}/>}
      {!mobile&&tab === "calendar" && calendar.data && <><div className={s.calendarToolbar}><div className={s.calendarPeriod}><h1>{calendarView==="week"?weekLabel():formatDay(firstDay, { month: "long", year: "numeric" })}</h1><button className={s.iconButton} aria-label={calendarView==="week"?"Previous week":"Previous month"} onClick={() => calendarView==="week"?chooseDay(addDays(activeDay,-7)):shiftMonth(-1)}><ChevronLeft size={18} /></button><button className={s.iconButton} aria-label={calendarView==="week"?"Next week":"Next month"} onClick={() => calendarView==="week"?chooseDay(addDays(activeDay,7)):shiftMonth(1)}><ChevronRight size={18} /></button><button className={s.secondary} onClick={() => { setMonth(today.slice(0, 7)); setDay(today); }}>Today</button></div><div className={`${s.viewTabs} ${s.calendarViews}`} role="group" aria-label="Calendar view"><button aria-pressed={calendarView==="month"} onClick={()=>setCalendarView("month")}>Month</button><button aria-pressed={calendarView==="week"} onClick={()=>setCalendarView("week")}>Week</button><button aria-pressed={calendarView==="agenda"} onClick={()=>setCalendarView("agenda")}>Agenda</button></div><NotificationBell openJourney={id=>router.push(journeyLink(id))}/></div><div className={s.calendarToggles} role="group" aria-label="Show on calendar">{([["booked","Booked"],["needs_booking","Planned"],["bookings","Booking opens"],["cancellation_needed","To cancel"],["holidays","Time off"]] as const).map(([key,label])=>{const layer=key==="bookings"||key==="holidays";const on=layer?calendarLayers[key]:calendarLayers.journeys&&calendarStatuses[key]!==false;return <button key={key} type="button" className={s.legendToggle} aria-pressed={on} onClick={()=>{if(layer)setCalendarLayers({...calendarLayers,[key]:!on});else{const next={...calendarStatuses,[key]:!on};setCalendarStatuses(next);setCalendarLayers({...calendarLayers,journeys:Object.values(next).some(v=>v!==false)});}}}><i data-swatch={key} aria-hidden="true"/>{label}</button>;})}</div>
      <div className={s.calendarLayout}><div className={s.calendarMain}>{calendarView === "week" ? weekView() : calendarView === "month" ? <section className={s.calendar}><div className={s.calendarWeek}>{Array.from({length:7},(_,i)=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][(i+planner.settings.weekStartsOn)%7]).map(d => <span key={d}>{d}</span>)}</div><div className={s.calendarGrid}>{Array.from({ length: 42 }, (_, i) => { const date = addDays(gridStart, i); const events = eventsFor(date); const total = (calendarLayers.journeys?calendar.data?.counts[date]?.journeys??0:0) + (calendarLayers.bookings?calendar.data?.counts[date]?.bookings??0:0) + events.holidays.length; const shown = Math.min(events.journeys.length, 1) + Math.min(events.bookings.length, 1) + Math.min(events.holidays.length, 1); return <div key={date} className={`${s.calendarCell} ${date.slice(0, 7) !== currentMonth ? s.otherMonth : ""} ${date === activeDay ? s.selectedDay : ""}`}><button className={`${s.dateButton} ${date === today ? s.todayDate : ""}`} aria-label={total?`View ${date}, ${total} events`:`Plan journey on ${date}`} onClick={() => {chooseDay(date);open(total?{type:"day",date}:{type:"journey",date});}}>{Number(date.slice(-2))}</button><div className={s.cellEvents}>{events.holidays.slice(0, 1).map(h => <button className={s.holidayEvent} key={h.id} onClick={() => {chooseDay(date);open({type:"day",date});}}>{h.name}</button>)}{events.bookings.slice(0, 1).map(j => <button className={s.bookingEvent} key={j.id} onClick={() => open({ type: "journey", journey: j })}>Book: {stationLabel(j.from)} → {stationLabel(j.to)}</button>)}{events.journeys.slice(0, 1).map(j => <button className={j.status==="cancellation_needed"?s.cancelEvent:j.status==="needs_booking"?s.plannedEvent:s.journeyEvent} key={j.id} onClick={() => open({ type: "journey", journey: j })}>{stationLabel(j.from)} → {stationLabel(j.to)} · {j.status==="needs_booking"?"Planned":STATUS[j.status]}{j.departureConfirmed?` · ${j.departure}`:""}</button>)}{total > shown && <button className={s.moreEvents} onClick={() => {chooseDay(date);open({type:"day",date});}}>+{total - shown} more</button>}</div>{total > 0 && <span className={s.mobileEvents}>{calendarLayers.journeys&&Boolean(calendar.data?.counts[date]?.journeys)&&<i className={calendar.data?.counts[date]?.cancellations?s.amber:s.green} />}{calendarLayers.bookings&&Boolean(calendar.data?.counts[date]?.bookings)&&<i className={s.blue} />}{events.holidays.length > 0 && <i className={s.purple} />}</span>}</div>; })}</div></section> : <CalendarAgenda month={currentMonth} eventsFor={eventsFor} counts={calendar.data.counts} layers={calendarLayers} openDay={date=>open({type:"day",date})} open={journey=>open({type:"journey",journey})}/>} {calendar.data.nextCursor&&<button className={s.secondary} disabled={calendar.busy} onClick={()=>void calendar.more()}>Load more calendar events</button>}</div><aside className={s.calendarSide} aria-label="Calendar notes">{(dashboard.data?.conflicts?.length??0)>0&&<section className={s.calendarDecision} aria-labelledby="calendar-decision"><h2 id="calendar-decision">Needs a decision</h2>{dashboard.data!.conflicts.map(j=><div key={j.id} className={s.calendarDecisionRow}><span><b>{formatDay(j.date,{weekday:"short",day:"numeric",month:"short"})} · {stationLabel(j.from)} → {stationLabel(j.to)}</b><small>{STATUS[j.status]} on your time off</small></span><button className={s.primary} onClick={()=>skipTimeOff(j)}>Skip this trip</button><button className={s.secondary} onClick={()=>keepTimeOff(j)}>Keep</button></div>)}</section>}<section className={s.calendarSync} aria-labelledby="calendar-sync"><h2 id="calendar-sync">Calendar sync</h2><div className={s.calendarSyncRow}><span>Google Calendar</span><button className={s.linkButton} onClick={()=>router.push("/settings#settings-connections")}>Manage</button></div><div className={s.calendarSyncRow}><span>ICS export</span><button className={s.linkButton} onClick={exportCalendar}>Download</button></div></section></aside></div></>}
      {!mobile&&!moreVisible&&tab === "routines" && <RoutineOverview planner={planner} today={today} edit={rule=>open({type:"rule",rule})} toggle={async rule=>{if(rule.paused||await ask("Pause this routine? Future unbooked journeys will be removed. Booked tickets and individual changes stay."))void routineAction(rule.paused?"resume":"pause",rule.paused?"Routine resumed.":"Routine paused.",rule.id);}} remove={removeRoutine}/>}
      {!mobile&&!moreVisible&&tab === "holidays" && <TimeOffOverview holidays={planner.holidays} today={today} remove={removeTimeOff} breaks={breaks} plan={date=>open({type:"journey",date})} journeys={planner.journeys} open={journey=>open({type:"journey",journey})} skip={skipTimeOff} keep={keepTimeOff}/>}
      {!mobile&&tab === "vault" && <><div className={s.vaultToolbar}><label className={s.search}><Search size={16}/><input aria-label="Search tickets" placeholder="Search tickets…" value={vaultSearch} onChange={e=>setVaultSearch(e.target.value)}/></label><button className={s.reloadButton} aria-label="Refresh tickets" title="Reload tickets" disabled={pages.busy} onClick={pages.refresh}><RefreshCw size={18}/></button></div><div className={s.vaultGrid}>{filtered.flatMap(j => (j.attachments ?? []).filter(file=>file.type==="application/pdf").map(file => <article className={s.vaultCard} key={file.id}><button className={s.vaultOpen} onClick={()=>setViewTicket(file)} aria-label={`View ticket ${j.from} to ${j.to}`}><span className={s.vaultDate}>{formatDay(j.date,{day:"numeric",month:"long",year:"numeric"})}</span><span className={s.vaultRoute} title={`${j.from} → ${j.to}`}>{stationLabel(j.from)}<ArrowRight size={16}/>{stationLabel(j.to)}</span></button><div className={s.cardActions}><button className={s.secondary} onClick={()=>setViewTicket(file)}>View ticket</button><ActionMenu label={`Ticket Actions For ${j.from} to ${j.to}`} actions={[{label:"Download ticket",onClick:()=>void downloadTicketFile(file).catch(e=>setError(e.message))}]}/></div></article>))}{!pages.pending&&!filtered.some(j=>j.attachments?.some(file=>file.type==="application/pdf")) && <div className={s.vaultEmpty}>{vaultSearch.trim()?<EmptyState art="search" title="No Matching Tickets">Nothing matches “{vaultSearch.trim()}”. Try a station code, a date or a PNR.</EmptyState>:<EmptyState art="tickets" title="A Home For Your Tickets">Attach the IRCTC PDF to a booked journey, or turn on Email tickets in Settings. PDFs follow your retention setting (7 days by default after completion or cancellation); journey details stay.</EmptyState>}</div>}</div>{pages.data?.pages.all?.nextCursor&&<button className={s.secondary} disabled={pages.busy} onClick={()=>void pages.more("all")}>Load more tickets</button>}</>}
      {!moreVisible&&tab==="spend"&&<SpendView planner={planner} today={today} attachTickets={policy.ticketUploadsEnabled?()=>open({type:"tickets"}):undefined}/>}
      {!moreVisible&&tab==="settings"&&<div><SettingsHub planner={planner} saving={saving} saveSettings={next=>void commit({...planner,settings:next},"Settings saved.")} syncOffline={syncOfflineTickets} admin={account.role==="ADMIN"} personal={section=><Profile inline={section} account={{...account,name:displayName}} planner={planner} onProfile={async user=>{setDisplayName(user.name);await refreshWorkspace();}} commit={commit} notice={setNotice} fail={setError} backup={()=>void backup()} restore={file=>void restore(file)} exportCalendar={exportCalendar}/>} backup={()=>void backup()} restore={file=>void restore(file)} exportCalendar={exportCalendar}/></div>}
      {!moreVisible&&(tab === "workspace" || tab === "users" || tab === "integrations" || tab === "operations") && account.role!=="ADMIN" && <p className={s.help} role="status">Workspace settings are managed by your administrator. <Link href="/settings">Go to your settings</Link></p>}
      {!moreVisible&&(tab === "workspace" || tab === "users" || tab === "integrations" || tab === "operations") && account.role==="ADMIN" && <AdminPanel view={tab==="operations"?"operations":tab==="users"?"users":tab==="integrations"?"integrations":"settings"} currentUserId={account.id} notice={setNotice} refresh={refreshWorkspace}/>}
    </main></div>
    {mobile&&<MobileNavigation disabled={saving} newJourney={()=>{setMoreOpen(false);open({type:"journey"});}} tab={tab} more={moreOpen} openMore={()=>{const go=()=>setMoreOpen(!moreVisible);if(settingsNavigationAllowed(go))go();}} navigate={()=>setMoreOpen(false)}/>}
    {editor && <Modal docked={journeyDocked} title={editor.type === "tickets" ? "Attach tickets" : editor.type === "booking" ? "Booking day" : editor.type === "journey" ? editor.ticket ? "Record booked ticket" : editor.journey ? editor.editing ? "Edit journey" : "Journey" : "New journey" : editor.type === "rule" ? editor.rule?.id ? "Edit routine" : "New routine" : editor.type === "day" ? formatDay(editor.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : editor.type === "holiday" ? "Add time off" : "Import company holidays"} subtitle={editor.type === "booking" || editor.type === "tickets" ? undefined : editor.type === "journey" && editor.journey && editor.editing ? `${editor.journey.from} → ${editor.journey.to} · ${formatDay(editor.journey.date)}` : undefined} close={close} wide={editor.type === "tickets" || editor.type === "booking" || (editor.type === "journey" && Boolean(editor.journey) && Boolean(editor.editing))} guard={editor.type !== "day" && editor.type !== "booking" && editor.type !== "tickets" && (editor.type !== "journey" || !editor.journey || Boolean(editor.editing))}>
      {editor.type === "tickets" && <TicketImport planner={planner} commit={commit} fail={setError} done={close} initial={editor.files}/>}
      {editor.type === "booking" && <BookingDay journey={editor.journey} routine={ruleName(editor.journey)} fail={setError} booked={(status, ticket) => { const j = editor.journey, next = { ...transitionJourney(j, "booked"), ticketStatus: status, attachments: ticket ? [...(j.attachments ?? []), ticket] : j.attachments } as Journey; void update(next).then(saved => { if (saved) { setNotice(status === "CNF" ? "Marked booked." : `Marked booked (${status}).`); open({ type: "journey", journey: next }); } }); }} retryTatkal={() => { const j = { ...editor.journey, bookingType: "tatkal" as const, tatkalClass: editor.journey.tatkalClass ?? "ac", trainOriginDate: editor.journey.trainOriginDate ?? editor.journey.date }; void update(j).then(saved => { if (saved) { setNotice("Switched to Tatkal."); open({ type: "booking", journey: j }); } }); }} skip={async () => { if (await ask("Skip this trip?")) void commit(skipForTimeOff({ ...planner, journeys: planner.journeys.some(x => x.id === editor.journey.id) ? planner.journeys : [...planner.journeys, editor.journey] }, editor.journey), "Trip skipped.", false, [editor.journey]).then(saved => { if (saved) close(); }); }} />}
      <div inert={saving}>
      {editor.type === "journey" && editor.journey && !editor.editing ? <JourneyDetail pnrSaved={journey=>{setEditor(current=>current?.type==="journey"&&current.journey?.id===journey.id?{...current,journey}:current);void refreshWorkspace().catch(e=>setError(e.message));pages.refresh();dashboard.refresh();}} bookingDay={editor.journey.status === "needs_booking" ? () => open({ type: "booking", journey: editor.journey! }) : undefined} journey={editor.journey} today={today} routine={ruleName(editor.journey)} reminders={reminderLabel(editor.journey)} uploadsEnabled={policy.ticketUploadsEnabled} edit={()=>setEditor({...editor,editing:true})} attach={()=>setEditor({...editor,editing:true,ticket:true})} attachFile={file=>void attachTicketFile(editor.journey!,file)} skip={editor.journey.status==="needs_booking"?()=>skipJourney(editor.journey!):undefined} restore={editor.journey.status==="skipped"?()=>{restoreJourney(editor.journey!);close();}:undefined} view={setViewTicket} cancel={async ()=>{const j=editor.journey;if(j&&await ask("Have you cancelled this ticket through IRCTC?"))void update(transitionJourney(j,"cancelled")).then(saved=>{if(saved)close();});}}/> : editor.type === "journey" && <JourneyForm remindersEnabled={policy.remindersEnabled} uploadsEnabled={policy.ticketUploadsEnabled} journey={editor.journey} date={editor.date} ticket={editor.ticket} planner={planner} today={today} fail={setError} save={async (j, extra = []) => { const ids = new Set([j.id, ...extra.map(x => x.id)]); const saved = await commit({ ...planner, journeys: [...planner.journeys.filter(old => !ids.has(old.id)), j, ...extra] }, extra.length ? "Journeys saved." : "Journey saved."); if (saved) close(); return saved; }} />}
      {editor.type === "rule" && <RuleForm saving={saving} remindersEnabled={policy.remindersEnabled} rule={editor.rule} planner={planner} today={today} fail={setError} preview={previewRoutine} save={saveRoutine} />}
      {editor.type === "day" && <div className={s.form}>{selectedDay.pending&&<p role="status">Loading events…</p>}{selectedDay.error&&<><p role="alert">{selectedDay.error}</p><button className={s.reloadButton} aria-label="Refresh events" onClick={selectedDay.refresh}><RefreshCw size={18}/></button></>}{dayEvents.holidays.map(h=><p key={h.id}>{h.name}</p>)}{dayEvents.bookings.map(j=><button key={"b"+j.id} className={s.secondary} onClick={()=>open({type:"journey",journey:j})}>Booking: {stationLabel(j.from)} → {stationLabel(j.to)}</button>)}{dayEvents.journeys.map(j=><button key={j.id} className={s.secondary} onClick={()=>open({type:"journey",journey:j})}>{stationLabel(j.from)} → {stationLabel(j.to)} · {STATUS[j.status]}</button>)}{selectedDay.data?.nextCursor&&<button className={s.secondary} disabled={selectedDay.busy} onClick={()=>void selectedDay.more()}>Load more day events</button>}<button className={s.primary} onClick={()=>open({type:"journey",date:editor.date})}>Plan travel</button></div>}
      {editor.type === "holiday" && <form className={s.form} onSubmit={addHoliday}><Field label="Name"><input name="name" maxLength={100} placeholder="Holiday or personal plan" required /></Field><Field label="Type"><Select name="type"><option value="company">Company holiday</option><option value="leave">Personal leave / holiday</option></Select></Field><div className={s.formGrid}><Field label="Date"><DateInput name="date" defaultValue={today} required /></Field><Field label="Through (Optional)"><DateInput name="end" /></Field></div><button className={s.primary}>Add time off</button></form>}
      {editor.type === "import" && <form className={s.form} onSubmit={e => { e.preventDefault(); importHolidays(String(new FormData(e.currentTarget).get("csv"))); }}><p className={s.help}>Import a calendar (.ics) from Google or Outlook, or a CSV with columns: date,name,type. Types: company or leave. Dates use YYYY-MM-DD.</p><pre className={s.csvExample}>date,name,type{"\n"}2027-01-01,New Year,company</pre><Field label="Choose CSV or calendar (.ics) file"><input type="file" accept=".csv,text/csv,.ics,text/calendar" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 1000000) { setError("Choose a file smaller than 1 MB."); return; } try { const text = await f.text(); if (/\.ics$/i.test(f.name) || /BEGIN:VCALENDAR/i.test(text)) { try { setIcsPreview(parseHolidayICS(text)); } catch (err) { setError(err instanceof Error ? err.message : "Could not read the calendar file."); } } else importHolidays(text); } catch { setError("Could not read the file."); } }} /></Field>{icsPreview && <div className={s.icsPreview} role="region" aria-label="Calendar import preview"><b>{icsPreview.length} {icsPreview.length === 1 ? "day" : "days"} found</b><ul>{icsPreview.slice(0, 8).map(h => <li key={h.date + h.name}>{formatDay(h.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {h.name}</li>)}{icsPreview.length > 8 && <li>and {icsPreview.length - 8} more</li>}</ul><div className={s.icsActions}><Select aria-label="Import as" value={icsPreview[0]?.type ?? "company"} onChange={e => setIcsPreview(icsPreview.map(h => ({ ...h, type: e.target.value as "company" | "leave" })))}><option value="company">Company holidays</option><option value="leave">Personal leave</option></Select><button type="button" className={s.primary} onClick={() => { const list = icsPreview; setIcsPreview(null); void importHolidays("", list); }}>Import {icsPreview.length} {icsPreview.length === 1 ? "day" : "days"}</button></div></div>}<Field label="Or paste CSV"><textarea name="csv" rows={6} placeholder="date,name,type" required /></Field><button className={s.primary}>Import holidays</button></form>}
    </div></Modal>}
  </div></MobileHeaderActions.Provider>;
}
