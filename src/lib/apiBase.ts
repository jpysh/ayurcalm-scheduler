/**
 * Where the API lives, decided once for the whole app.
 *
 * Same-origin by default: the server serves the built front end, and the Vite
 * dev server proxies /api (see vite.config.ts). Set VITE_API_BASE to point at
 * a different host.
 */
export const API_BASE: string =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || "/api";
