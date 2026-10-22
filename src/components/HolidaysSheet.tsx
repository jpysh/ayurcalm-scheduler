import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, Consequence, DateRow, datePair, Empty, LinkRow, ListGroup, pair, plural, Row, Seg, SheetFoot, Text, Tick, TimeList, TwoFoot, dayText } from "@/components/kit";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";

type Holiday = { date: string; name: string };
export type ClosedDay = { id: string; date: string; endDate: string; description: string; hours?: string };

const post = (date: string, endDate: string, description: string, move = false, hours?: { start: string; end: string }) => fetch(`${API_BASE}/timeoff`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ entity_type: "center", entity_id: null, date, start_date: date, end_date: endDate, start_time: hours?.start ?? null, end_time: hours?.end ?? null, description, move }),
}).catch(() => null);

/**
 * Centre closed days (#709), from Availability and from Settings: the days coming, each
 * reopened with a tap; any day of the centre's own added with a reason; and India's
 * gazetted holidays not yet closed, all ticked, so closing on them is one tap.
 */
export function HolidaysSheet({ open, onOpenChange, closed, today, shown, onChanged }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** The centre's closed days, every one. */
  closed: ClosedDay[]; today: string; shown: string;
  /** Read time off again after a change here. */
  onChanged: () => void;
}) {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  // Part of a day (#985): a power or water cut shuts every room and therapist for those hours, not the day.
  const [adding, setAdding] = useState<{ date: string; endDate: string; description: string; part?: boolean; start?: string; end?: string } | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    fetchJsonWithTimeout<{ opening_time?: string; closing_time?: string }>(`${API_BASE}/settings`).then((x) => {
      const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const out: string[] = [];
      for (let t = m(x.opening_time || "09:00"); t <= m(x.closing_time || "18:00"); t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
      setSlots(out);
    }).catch(() => {});
  }, [open]);
  const hoursOf = (a: NonNullable<typeof adding>) => (a.part ? { start: a.start || slots[0] || "09:00", end: a.end || slots[slots.length - 1] || "18:00" } : undefined);
  const shut = new Set(closed.map((c) => c.date));
  const coming = closed.filter((c) => c.endDate >= today).sort((a, b) => a.date.localeCompare(b.date));

  // The consequence, said before the tap: what is already booked on the days to close.
  const [booked, setBooked] = useState<number | null>(null);
  useEffect(() => {
    setBooked(null);
    if (!adding) return;
    const to = adding.endDate < adding.date ? adding.date : adding.endDate;
    let stale = false;
    const h = hoursOf(adding);
    fetchJsonWithTimeout<{ treatments: number }>(`${API_BASE}/timeoff/impact?type=center&from=${adding.date}&to=${h ? adding.date : to}${h ? `&after=${h.start}&before=${h.end}` : ""}`)
      .then((r) => { if (!stale && typeof r?.treatments === "number") setBooked(r.treatments); }).catch(() => {});
    return () => { stale = true; };
  }, [adding?.date, adding?.endDate, adding?.part, adding?.start, adding?.end, slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function addOwn(move: boolean) {
    if (!adding) return;
    setBusy(true);
    // No reason is saved as none: "Closed" typed for the admin made the day check read "closed for Closed".
    const h = hoursOf(adding);
    const r = await post(adding.date, h || adding.endDate < adding.date ? adding.date : adding.endDate, adding.description.trim(), move, h);
    setBusy(false);
    if (!r?.ok) { toast.error("Not saved. Try again."); return; }
    const saved = await r.json().catch(() => null) as { id: string; moved: { moved: number; left: number; first: string | null; last: string | null } | null; replan: { moved: unknown[]; proposed: unknown[]; unplaced: unknown[] }[] | null } | null;
    const when = h ? `${dayText(adding.date)}, ${h.start} to ${h.end}` : adding.endDate > adding.date ? `${dayText(adding.date)} to ${dayText(adding.endDate)}` : dayText(adding.date);
    const m = saved?.moved;
    const day = saved?.replan?.[0];
    const waiting = day ? day.proposed.length + day.unplaced.length : 0;
    const text = day && (day.moved.length || waiting)
      ? `Centre closed ${when}. ${day.moved.length ? `${plural(day.moved.length, "treatment")} moved out of those hours.` : ""}${waiting ? ` ${waiting} wait under "need you" for your choice.` : ""}`
      : m && (m.moved || m.left)
      ? `Centre closed ${when}. ${m.moved ? `${plural(m.moved, "treatment")} moved to ${m.first === m.last ? dayText(m.first!) : `${dayText(m.first!)} to ${dayText(m.last!)}`}.` : ""}${m.left ? ` ${m.left} could not be placed and wait under "need you".` : ""}`
      : `Centre closed ${when}`;
    // Undo reopens the day and puts the moved treatments back, in one go.
    toast(text, { duration: 5000, action: saved?.id ? { label: "Undo", onClick: async () => {
      await fetch(`${API_BASE}/timeoff/${saved.id}`, { method: "DELETE" }).catch(() => null);
      onChanged();
    } } : undefined });
    setAdding(null);
    onChanged();
  }

  // Open after all: removed at once, Undo closes it again as it was.
  // A second tap on a slow line would send a second delete and a second Undo, which closes the day twice (#879).
  const reopening = useRef(new Set<string>());
  async function reopen(c: ClosedDay) {
    if (reopening.current.has(c.id)) return;
    reopening.current.add(c.id);
    const r = await fetch(`${API_BASE}/timeoff/${c.id}`, { method: "DELETE" }).catch(() => null);
    reopening.current.delete(c.id);
    if (!r?.ok) { toast.error("Not changed. Try again."); return; }
    onChanged();
    toast(`Open on ${dayText(c.date)}`, { action: { label: "Undo", onClick: async () => { await post(c.date, c.endDate, c.description, false, c.hours ? { start: c.hours.slice(0, 5), end: c.hours.slice(-5) } : undefined); onChanged(); } } });
  }

  if (adding) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="Close the centre" onBack={() => setAdding(null)}
        foot={booked ? <TwoFoot busy={busy} main="Close and move them" onMain={() => void addOwn(true)} alt="Close, leave them" onAlt={() => void addOwn(false)} />
          : <SheetFoot busy={busy} ok={!!adding.date} save={() => void addOwn(false)} label="Close the centre" />}>
        <Seg<"days" | "part"> value={adding.part ? "part" : "days"} onChange={(v) => setAdding({ ...adding, part: v === "part" })} options={[["days", "Whole days"], ["part", "Part of a day"]]} />
        {adding.part ? <>
          <DateRow label="Day" value={adding.date} min={today} onChange={(v) => setAdding({ ...adding, date: v, endDate: v })} />
          <div className={pair}>
            <TimeList label="From" times={slots.slice(0, -1)} value={hoursOf(adding)!.start} onChange={(t) => setAdding({ ...adding, start: t, end: adding.end && adding.end > t ? adding.end : undefined })} />
            <TimeList label="Until" times={slots} after={hoursOf(adding)!.start} value={hoursOf(adding)!.end} onChange={(t) => setAdding({ ...adding, end: t })} />
          </div>
        </> : (
          <div className={datePair}>
            <DateRow label="From" value={adding.date} min={today} onChange={(v) => setAdding({ ...adding, date: v, endDate: adding.endDate < v ? v : adding.endDate })} />
            <DateRow label="Until" value={adding.endDate} min={adding.date} onChange={(v) => setAdding({ ...adding, endDate: v })} />
          </div>
        )}
        <Text label="Reason (optional)" placeholder="Staff retreat" value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} />
        {booked ? <Consequence>{`${plural(booked, "treatment")} ${booked === 1 ? "is" : "are"} booked then. "Close and move them" puts ${booked === 1 ? "it" : "them"} ${adding.part ? "at other times that day" : "on the next open day"}; nothing moves until you tap.`}</Consequence> : null}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Centre closed days" note="Tap a day to open the centre after all."
      foot={holidays.length ? <SheetFoot busy={busy} ok={!!chosen.length} save={addHolidays} label={`Close on ${chosen.length} public holiday${chosen.length === 1 ? "" : "s"}`} /> : undefined}>
      <ListGroup title="Closed" count={coming.length}>
        <LinkRow label="Close another day…" onClick={() => setAdding({ date: shown > today ? shown : today, endDate: shown > today ? shown : today, description: "" })} />
        {coming.length ? coming.map((c) => <Row key={c.id} title={c.endDate > c.date ? `${dayText(c.date)} to ${dayText(c.endDate)}` : dayText(c.date)} facts={[c.hours, c.description || "Closed"].filter(Boolean).join(" · ")} trailing="Open ›" onClick={() => void reopen(c)} />)
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
