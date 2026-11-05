import type { MetadataRoute } from "next";

/** Describes the installed, same-origin RailWatch application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "RailWatch", short_name: "RailWatch",
    description: "Plan train journeys, view tickets and manage booking reminders.",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#0b0f17", theme_color: "#0b0f17",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
