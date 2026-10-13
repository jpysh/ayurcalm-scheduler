import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, DateRow, Empty, LinkRow, ListGroup, Row, SheetFoot, Text, Tick, dayText } from "@/components/kit";

type Holiday = { date: string; name: string };
export type ClosedDay = { id: string; date: string; endDate: string; description: string };

const post = (date: string, endDate: string, description: string) => fetch(`${API_BASE}/timeoff`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ entity_type: "center", entity_id: null, date, start_date: date, end_date: endDate, start_time: null, end_time: null, description }),
}).catch(() => null);

/**
 * Centre closed days (#709), from Availability and from Settings: the days coming, each
 * reopened with a tap; any day of the centre's own added with a reason; and India's
 * gazetted holidays not yet closed, all ticked, so closing on them is one tap.
 */
export function HolidaysSheet({ open, onOpenChange, closed, today, onChanged }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** The centre's closed days, every one. */
  closed: ClosedDay[]; today: string;
  /** Read time off again after a change here. */
  onChanged: () => void;
}) {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<{ date: string; endDate: string; description: string } | null>(null);
  const shut = new Set(closed.map((c) => c.date));
  const coming = closed.filter((c) => c.endDate >= today).sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    if (!open) return;
    setList(null); setOff({}); setAdding(null);
    fetch(`${API_BASE}/holidays/india`).then((r) => r.json()).then((d: Holiday[]) => setList(d)).catch(() => setList([]));
  }, [open]);

  const holidays = (list || []).filter((h) => h.date >= today && !shut.has(h.date));
  const key = (h: Holiday) => h.date + h.name;
  const chosen = holidays.filter((h) => !off[key(h)]);

  async function addHolidays() {
    setBusy(true);
    let saved = 0;
    for (const h of chosen) if ((await post(h.date, h.date, h.name))?.ok) saved++;
    setBusy(false);
    if (saved < chosen.length) toast.error(`${chosen.length - saved} could not be saved.`);
    else toast.success(`Centre closed on ${saved} day${saved === 1 ? "" : "s"}`);
    onChanged();
  }

  async function addOwn() {
    if (!adding) return;
    setBusy(true);
    const r = await post(adding.date, adding.endDate < adding.date ? adding.date : adding.endDate, adding.description.trim() || "Closed");
    setBusy(false);
    if (!r?.ok) { toast.error("Not saved. Try again."); return; }
    toast.success(`Centre closed ${adding.endDate > adding.date ? `${dayText(adding.date)} to ${dayText(adding.endDate)}` : dayText(adding.date)}`);
    setAdding(null);
    onChanged();
  }

  // Open after all: removed at once, Undo closes it again as it was.
  async function reopen(c: ClosedDay) {
    const r = await fetch(`${API_BASE}/timeoff/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { toast.error("Not changed. Try again."); return; }
    onChanged();
    toast(`Open on ${dayText(c.date)}`, { action: { label: "Undo", onClick: async () => { await post(c.date, c.endDate, c.description); onChanged(); } } });
  }

  if (adding) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="Close the centre" onBack={() => setAdding(null)}
        foot={<SheetFoot busy={busy} ok={!!adding.date} save={addOwn} label="Close the centre" />}>
        <div className="grid grid-cols-2 gap-3">
          <DateRow label="From" value={adding.date} min={today} onChange={(v) => setAdding({ ...adding, date: v, endDate: adding.endDate < v ? v : adding.endDate })} />
          <DateRow label="Until" value={adding.endDate} min={adding.date} onChange={(v) => setAdding({ ...adding, endDate: v })} />
        </div>
        <Text label="Reason" placeholder="Staff retreat" value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Centre closed days" note="Tap a day to open the centre after all."
      foot={holidays.length ? <SheetFoot busy={busy} ok={!!chosen.length} save={addHolidays} label={`Close on ${chosen.length} public holiday${chosen.length === 1 ? "" : "s"}`} /> : undefined}>
      <ListGroup title="Closed" count={coming.length}>
        <LinkRow label="Close another day…" onClick={() => setAdding({ date: today, endDate: today, description: "" })} />
        {coming.length ? coming.map((c) => <Row key={c.id} title={c.endDate > c.date ? `${dayText(c.date)} to ${dayText(c.endDate)}` : dayText(c.date)} facts={c.description || "Closed"} trailing="Open ›" onClick={() => void reopen(c)} />)
          : <Empty text="No closed days coming." />}
      </ListGroup>
      {list === null ? null : (
        <div className="mt-3">
          <ListGroup title="Public holidays" count={holidays.length}>
            {holidays.length ? holidays.map((h) => (
              <div key={key(h)} className="flex min-h-14 items-center border-b border-border px-3 last:border-b-0">
                <Tick on={!off[key(h)]} set={(v) => setOff((o) => ({ ...o, [key(h)]: !v }))} label={<span className="grid"><span className="font-semibold">{h.name}</span><span className="text-sm text-muted-foreground">{dayText(h.date)}</span></span>} />
              </div>
            )) : <Empty text="Every public holiday ahead is already a closed day." />}
          </ListGroup>
          {holidays.length ? <p className="mt-2 px-1 text-sm text-muted-foreground">India's gazetted days. Untick the days the centre stays open; moon-dated days can move by one.</p> : null}
        </div>
      )}
    </BottomSheet>
  );
}
