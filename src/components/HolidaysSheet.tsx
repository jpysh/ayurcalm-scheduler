import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";

type Holiday = { date: string; name: string };

/**
 * Leave → Public holidays (#219): India's gazetted holidays still to come, all
 * ticked, so closing the centre on them is one tap. Untick what the centre
 * works through. Days already closed are left out.
 */
export function HolidaysSheet({ open, onOpenChange, closed, today, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** YYYY-MM-DD days the centre is already closed. */
  closed: Set<string>; today: string; onAdded: (rows: { id: string; date: string; description: string }[]) => void;
}) {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null); setOff({});
    fetch(`${API_BASE}/holidays/india`).then((r) => r.json())
      .then((d: Holiday[]) => setList(d.filter((h) => h.date >= today && !closed.has(h.date))))
      .catch(() => setList([]));
  }, [open, today, closed]);

  const key = (h: Holiday) => h.date + h.name;
  const chosen = (list || []).filter((h) => !off[key(h)]);

  async function add() {
    setBusy(true);
    const saved: { id: string; date: string; description: string }[] = [];
    for (const h of chosen) {
      const r = await fetch(`${API_BASE}/timeoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "center", entity_id: null, date: h.date, start_date: h.date, end_date: h.date, start_time: null, end_time: null, description: h.name }),
      }).catch(() => null);
      if (r?.ok) saved.push({ ...(await r.json()), date: h.date });
    }
    setBusy(false);
    if (saved.length < chosen.length) toast.error(`${chosen.length - saved.length} could not be saved.`);
    else toast.success(`Centre closed on ${saved.length} day${saved.length === 1 ? "" : "s"}`);
    onAdded(saved);
    onOpenChange(false);
  }

  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Public holidays">
      {list === null ? <p className="text-sm text-muted-foreground">Loading…</p>
        : list.length === 0 ? <p className="text-sm">Every public holiday ahead is already a closed day.</p>
        : (
          <div className="grid gap-3">
            <p className="text-[13px] text-muted-foreground">India's gazetted holidays. Untick the days the centre stays open. Moon-dated days can move by one.</p>
            <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-border">
              {list.map((h) => (
                <label key={key(h)} className="flex min-h-[54px] items-center gap-3 border-b border-border px-3 last:border-b-0">
                  <input type="checkbox" className="h-5 w-5 min-h-0 min-w-0 flex-none" checked={!off[key(h)]} onChange={(e) => setOff((o) => ({ ...o, [key(h)]: !e.target.checked }))} />
                  <span className="grid">
                    <span className="text-[16px] font-semibold">{h.name}</span>
                    <span className="text-[13px] text-muted-foreground">{fmt(h.date)}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="button" disabled={busy || !chosen.length} onClick={add}
              className="min-h-11 w-full rounded-full bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Saving…" : `Close the centre on ${chosen.length} day${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
    </BottomSheet>
  );
}
