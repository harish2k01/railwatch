// The frontend gateway is the only caller of the backend, so it is the only place that
// reads proxy headers. The backend trusts this single header and nothing a browser sends.
export const CLIENT_ADDRESS_HEADER = "x-railwatch-client-address";

// Headers a client could use to claim another address. Traefik rewrites x-real-ip and
// x-forwarded-for, but passes cf-connecting-ip and the others through untouched.
const CLIENT_SUPPLIED = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for", "forwarded", CLIENT_ADDRESS_HEADER];

/** Reads the client address set by the reverse proxy, ignoring headers it does not rewrite. */
export function proxyClientAddress(headers: Headers) {
  const value = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return value && /^[0-9A-Fa-f:.]{2,45}$/.test(value) ? value : undefined;
}

/** Replaces every client-supplied address header with the proxy-derived address. */
export function forwardClientAddress(incoming: Headers, outgoing: Headers) {
  const address = proxyClientAddress(incoming);
  for (const name of CLIENT_SUPPLIED) outgoing.delete(name);
  if (address) outgoing.set(CLIENT_ADDRESS_HEADER, address);
}
