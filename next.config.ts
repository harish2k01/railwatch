import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  poweredByHeader: false,
  compress: true,
  // Old paths from before the plan 2.1 navigation keep working.
  async redirects() {
    return [
      { source: "/holidays", destination: "/time-off", permanent: true },
      { source: "/admin", destination: "/settings/workspace", permanent: true },
      { source: "/admin/users", destination: "/settings/workspace/members", permanent: true },
      { source: "/admin/integrations", destination: "/settings/workspace/integrations", permanent: true },
      { source: "/admin/operations", destination: "/settings/workspace/health", permanent: true },
    ];
  },
  async headers() {
    const headers = [{ source: "/:path*", headers: securityHeaders }, { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
    // OCR uses same-origin WebAssembly; JavaScript eval is permitted only for development debugging.
    if (process.env.NODE_ENV === "development") {
      headers.push({ source: "/:path*", headers: securityHeaders.map((header) => header.key === "Content-Security-Policy"
        ? { ...header, value: header.value.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'") }
        : header) });
    }
    return headers;
  },
};

export default nextConfig;
