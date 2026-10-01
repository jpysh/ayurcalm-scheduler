import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, Empty, ListGroup, SheetFoot, Tick, dayText } from "@/components/kit";

type Holiday = { date: string; name: string };

/**
 * Settings → Opening hours → Public holidays (#219, #288): India's gazetted holidays still to come, all
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

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Public holidays" note="India's gazetted holidays still to come. Untick the days the centre stays open; moon-dated days can move by one."
      foot={list?.length ? <SheetFoot busy={busy} ok={!!chosen.length} save={add} label={`Close the centre on ${chosen.length} day${chosen.length === 1 ? "" : "s"}`} /> : undefined}>
      {list === null ? null : list.length === 0 ? <Empty text="Every public holiday ahead is already a closed day." /> : (
        <ListGroup>
          {list.map((h) => (
            <div key={key(h)} className="flex min-h-14 items-center border-b border-border px-3 last:border-b-0">
              <Tick on={!off[key(h)]} set={(v) => setOff((o) => ({ ...o, [key(h)]: !v }))} label={<span className="grid"><span className="font-semibold">{h.name}</span><span className="text-[13px] text-muted-foreground">{dayText(h.date)}</span></span>} />
            </div>
          ))}
        </ListGroup>
      )}
    </BottomSheet>
  );
}
