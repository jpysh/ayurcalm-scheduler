// Last good answer per read, kept per tab so a reload with no signal still shows the centre (#931).
const KEY = "stale:";

export function writeStale(url: string, body: string) {
  try {
    sessionStorage.setItem(KEY + url, JSON.stringify({ at: Date.now(), body }));
  } catch { /* storage full or blocked: the offline line just has less to show */ }
}

export function readStale(url: string): { at: number; body: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY + url);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
