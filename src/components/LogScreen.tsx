/**
 * The Log (#130): what changed in the last month, newest first, one sentence
 * each, under Today, Yesterday and dates. The newest change, when the app can
 * put it back, has Undo. Opened from Settings.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import PageHead from "@/components/PageHead";
import { Empty, EntryRow, dayText, ErrorLine, ListGroup, Loading } from "@/components/kit";

type Entry = { id: string; at: string; who: "you" | "the app"; text: string; undo: string | null; undone: boolean };

export function LogScreen({ timezone, refresh }: { timezone: string; refresh: () => Promise<void> }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    fetch(`${API_BASE}/log`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setEntries(d.entries || [])).catch(() => { setFailed(true); setEntries([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Days and times on the centre's clock, as everywhere else.
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const heading = (day: string) => day === today ? "Today" : day === yesterday ? "Yesterday"
    : dayText(day);

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
      <PageHead title="Log" note="Last 30 days" />
      {failed ? <ErrorLine text="The Log could not be loaded." retry={load} />
        : entries === null ? <Loading rows={5} />
        : entries.length === 0 ? <Empty text="Nothing has changed in the last 30 days." />
        : days.map(([day, list]) => (
          <ListGroup key={day} title={heading(day)}>
            {list.map((e) => <EntryRow key={e.id} time={time(e.at)} text={e.text} muted={e.undone} by={e.who} action={e.undo ? { label: "Undo", run: () => undo(e) } : undefined} />)}
          </ListGroup>
        ))}
    </div>
  );
}
