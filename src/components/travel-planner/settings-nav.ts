/** One source for the Settings navigation, shared by the Settings page and the admin workspace pages. */
export const PERSONAL_SECTIONS = [
  { id: "profile", label: "Profile" }, { id: "preferences", label: "Preferences" }, { id: "reminders", label: "Reminders" },
  { id: "connections", label: "Connections" }, { id: "offline", label: "Offline tickets" }, { id: "data", label: "Data and backup" }, { id: "security", label: "Security" },
] as const;
export const ADMIN_SECTIONS = [
  { id: "booking", label: "Booking rules", href: "/settings/workspace?section=booking" },
  { id: "planning", label: "Calendar & routines", href: "/settings/workspace?section=planning" },
  { id: "integrations", label: "Integrations", href: "/settings/workspace/integrations" },
  { id: "email", label: "Email delivery", href: "/settings/workspace?section=email" },
  { id: "users", label: "Users & access", href: "/settings/workspace/members" },
  { id: "operations", label: "Reminder delivery", href: "/settings/workspace/health" },
  { id: "features", label: "Feature availability", href: "/settings/workspace?section=features" },
] as const;
