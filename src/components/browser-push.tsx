"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/client-api";
import { ActionMenu } from "./travel-planner/action-menu";
import s from "./travel-planner/planner.module.css";

const subscribeCapability = () => () => {};
const capableSnapshot = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Enables device-specific push only after an explicit user permission gesture. */
export function BrowserPush({ notice, fail }: { notice: (message: string) => void; fail: (message: string) => void }) {
  const supported = useSyncExternalStore(subscribeCapability, capableSnapshot, () => false);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const capable = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (capable) void navigator.serviceWorker.getRegistration().then(async registration => {
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { const status = await apiRequest<{ subscribed: boolean }>("/api/railwatch/push", { method: "POST", body: JSON.stringify({ action: "status", endpoint: subscription.endpoint }) }); if (live) setConnected(status.subscribed); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  /** Updates only this browser subscription, leaving other signed-in devices untouched. */
  async function action(kind: "enable" | "remove" | "test") {
    setBusy(true);
    try {
      if (kind === "enable") {
        // Permission must be requested before awaiting network calls on iOS.
        if (await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your browser or phone settings to enable reminders.");
        const config = await apiRequest<{ publicKey: string; enabled: boolean }>("/api/railwatch/push");
        if (!config.enabled) throw new Error("Reminders are disabled by the administrator.");
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const registration = await navigator.serviceWorker.ready;
        const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        await apiRequest("/api/railwatch/push", { method: "POST", body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
        setConnected(true); notice("Notifications enabled for this device.");
      } else {
        const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
        if (!subscription) { setConnected(false); throw new Error("Enable notifications on this device first."); }
        await apiRequest("/api/railwatch/push", { method: "POST", body: JSON.stringify({ action: kind, endpoint: subscription.endpoint }) });
        if (kind === "remove") { await subscription.unsubscribe(); setConnected(false); notice("Notifications disabled for this device."); }
        else notice("Test notification sent. Check this device’s notifications.");
      }
    } catch (error) { fail(error instanceof Error ? error.message : "Could not update browser notifications."); }
    finally { setBusy(false); }
  }
  return <section className={s.settingsCard}><h3>Device notifications</h3><p>{supported ? connected ? "Booking reminders are enabled on this device." : "Receive booking reminders even when RailWatch is closed." : "Open RailWatch over HTTPS in a supported browser. On iPhone, install it on your home screen and open that app first."}</p>{supported && <div className={s.cardActions}><button className={s.primary} disabled={busy} onClick={() => void action(connected ? "test" : "enable")}>{connected ? "Send test notification" : "Enable notifications"}</button>{connected && <ActionMenu label="Device notification actions" disabled={busy} actions={[{ label: "Disable this device", onClick: () => void action("remove") }]} />}</div>}</section>;
}
