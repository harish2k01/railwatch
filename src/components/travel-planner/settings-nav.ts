/**
 * One source for the Settings navigation, shared by the Settings page and the admin workspace pages, so both show
 * the same list. Each entry is one topic; nothing is configured in two places.
 */
export const PERSONAL_SECTIONS = [
  { id: "account", label: "Account", hint: "Name, email, phone and password" },
  { id: "reminders", label: "Reminders", hint: "Where and when RailWatch reminds you" },
  { id: "trips", label: "Trips & days off", hint: "Your regular days off" },
  { id: "connections", label: "Connections", hint: "Calendar sync and email tickets" },
  { id: "devices", label: "Devices & data", hint: "Offline tickets, backup and the app" },
] as const;
export const ADMIN_SECTIONS = [
  { id: "booking", label: "Booking rules", hint: "Booking window for every account", href: "/settings/workspace?section=booking" },
  { id: "planning", label: "Routines & calendar", hint: "How far ahead routines plan, week start", href: "/settings/workspace?section=planning" },
  { id: "users", label: "Members", hint: "Invite people and manage access", href: "/settings/workspace/members" },
  { id: "email", label: "Email sending", hint: "The mail server RailWatch sends from", href: "/settings/workspace?section=email" },
  { id: "integrations", label: "Integrations", hint: "Telegram bot and Google sign-in", href: "/settings/workspace/integrations" },
  { id: "features", label: "Features", hint: "Turn features on or off for everyone", href: "/settings/workspace?section=features" },
  { id: "operations", label: "System health", hint: "Delivery queue, failures and backups", href: "/settings/workspace/health" },
] as const;
