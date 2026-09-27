/**
 * The Log (#130): what changed in the last month, newest first, one sentence
 * each, under Today, Yesterday and dates. The newest change, when the app can
 * put it back, has Undo. Opened from Settings.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type Entry = { id: string; at: string; who: "you" | "the app"; text: string; undo: string | null; undone: boolean };

export function LogScreen({ timezone, refresh }: { timezone: string; refresh: () => Promise<void> }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const load = useCallback(() => {
    fetch(`${API_BASE}/log`).then((r) => (r.ok ? r.json() : { entries: [] })).then((d) => setEntries(d.entries || [])).catch(() => setEntries([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Days and times on the centre's clock, as everywhere else.
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const heading = (day: string) => day === today ? "Today" : day === yesterday ? "Yesterday"
    : new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const days: [string, Entry[]][] = [];
  for (const e of entries || []) {
    const d = ymd(new Date(e.at));
    if (days.length && days[days.length - 1][0] === d) days[days.length - 1][1].push(e); else days.push([d, [e]]);
  }

  const undo = async (e: Entry) => {
    const res = await fetch(`${API_BASE}/replan/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: e.undo }) });
    if (!res.ok) { toast.error("That could not be undone."); return; }
    toast("Put back as it was");
    await refresh();
    load();
  };

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
        <h1 className="text-[22px] font-semibold">Log</h1>
        <span className="text-[13px] text-muted-foreground">Last 30 days</span>
      </div>
      {entries === null ? <div className="py-6 text-center text-muted-foreground">…</div>
        : entries.length === 0 ? <div className="py-6 text-center text-muted-foreground">Nothing has changed in the last 30 days.</div>
        : days.map(([day, list]) => (
          <section key={day}>
            <div className="px-1 pb-1.5 pt-3 text-[13px] font-bold">{heading(day)}</div>
            <div className="overflow-hidden rounded-2xl bg-card">
              {list.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0">
                  <span className="w-12 flex-none pt-px tabular-nums text-[15px] font-semibold">{time(e.at)}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] leading-snug ${e.undone ? "text-muted-foreground" : ""}`}>{e.text}</span>
                    <span className="block text-xs text-muted-foreground">{e.who}</span>
                  </span>
                  {e.undo ? <button type="button" className="-my-1 min-h-10 rounded-full px-3 text-sm font-bold text-primary" onClick={() => undo(e)}>Undo</button> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
