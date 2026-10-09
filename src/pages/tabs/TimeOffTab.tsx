import { Btn, Consequence, DateRow, dayText, Empty, Foot, LinkRow, ListGroup, plural, Row, SearchField, Seg, SheetNote, Text, Tick, TimeList, TwoFoot } from "@/components/kit";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, fetchJsonWithTimeout, leaveWhen, type UiTimeOff, type UiStaff } from "./shared";
import PageHead from "@/components/PageHead";
import { BottomSheet } from "@/components/BottomBar";
import { HolidaysSheet } from "@/components/HolidaysSheet";
import type { MarkOut } from "@/components/TeamRooms";

type Kind = Exclude<UiTimeOff['type'], 'Center'>;
type Mode = 'now' | 'part' | 'days';
/** The server's name for what is not available: a guest room is `guest_room`, the rest are the lower-cased type. */
const entityKey = (t: string) => (t === 'GuestRoom' ? 'guest_room' : t.toLowerCase());
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const sortKey = (h: UiTimeOff) => h.startDate || h.date || '';
const isFullDay = (h: UiTimeOff) => !h.startTime || !h.endTime;
const headers = { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) };

/** Every kind in one list and one form (#695), each said in its own words. */
const KINDS: Kind[] = ['Staff', 'Room', 'GuestRoom', 'Therapy', 'Patient'];
const GROUP: Record<Kind, string> = { Staff: 'Staff', Room: 'Treatment rooms', GuestRoom: 'Guest rooms', Therapy: 'Therapies', Patient: 'Guests staying' };
const ONE: Record<Kind, [string, string]> = { Staff: ['staff', 'staff'], Room: ['treatment room', 'treatment rooms'], GuestRoom: ['guest room', 'guest rooms'], Therapy: ['therapy', 'therapies'], Patient: ['guest', 'guests'] };
/** What each kind's treatments will need once it is not available. */
const NEEDS: Partial<Record<Kind, [string, string]>> = { Staff: ['treatment', 'another therapist'], Room: ['treatment', 'another room'], Therapy: ['booking', 'another day'], Patient: ['treatment', 'another time'] };

/** The day as the centre lives it: until it ends, or it starts later. */
const nowOrLater = (h: UiTimeOff, today: string) => (h.endDate || h.date || '').slice(0, 10) >= today;
const isNow = (h: UiTimeOff, today: string, hm: string) => {
  const start = sortKey(h).slice(0, 10);
  if (start > today) return false;
  if (isFullDay(h)) return true;
  const end = (h.endDate || h.date || '').slice(0, 10);
  return (start < today || h.startTime! <= hm) && (end > today || h.endTime! > hm);
};

/** The line a list row carries while its thing is not available, now or coming (#695); the server says it the same way in Search. */
export const notAvailable = (timeOffs: UiTimeOff[], type: UiTimeOff['type'], entity: string, today: string) => {
  const h = timeOffs.filter((x) => x.type === type && x.entity === entity && nowOrLater(x, today)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0];
  if (!h) return undefined;
  const start = sortKey(h).slice(0, 10), end = (h.endDate || h.date || '').slice(0, 10);
  if (start <= today) return end > today ? `Not available until ${dayText(end)}` : 'Not available today';
  return start === end ? `Not available ${dayText(start)}` : `Not available from ${dayText(start)}`;
};

/** The centre's clock now, "HH:MM", whatever zone the phone is in. */
const clockIn = (timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

/**
 * Availability (#695): everything not available, now and coming, of every kind. A tap opens
 * the same form that marks it; + asks what is not available first.
 */
export function useTimeOffScreen({ timeOffs, setTimeOffs, staff, staffNameById, roomNameById, therapyNameById, patientNameById, guests, todayKey, centreToday, timezone, closingTime, timeSlots }: {
  timeOffs: UiTimeOff[]; setTimeOffs: React.Dispatch<React.SetStateAction<UiTimeOff[]>>;
  staff: UiStaff[];
  staffNameById: Record<string, string>; roomNameById: Record<string, string>; therapyNameById: Record<string, string>; patientNameById: Record<string, string>;
  /** Guests staying or coming: the ones a day away can apply to. */
  guests: { id: string; name: string }[];
  todayKey: string; centreToday: string; timezone: string; closingTime: string;
  /** The centre's slot times, "HH:MM": what part of a day starts and ends on. */
  timeSlots: string[];
}) {
  const [showHolidays, setShowHolidays] = useState(false);
  const closedDays = useMemo(() => new Set(timeOffs.filter((h) => h.type === "Center").map((h) => (h.date || h.startDate || "").slice(0, 10))), [timeOffs]);
  const [guestRooms, setGuestRooms] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  useEffect(() => { fetchJsonWithTimeout<{ id: string; name: string; is_active: boolean }[]>(`${API_BASE}/guest-rooms`).then((r) => setGuestRooms(Array.isArray(r) ? r : [])).catch(() => {}); }, [timeOffs.length]);

  const options: Record<Kind, { id: string; name: string }[]> = {
    Staff: staff.map((s) => ({ id: String(s.id), name: s.name })),
    Room: Object.entries(roomNameById).map(([id, name]) => ({ id, name })),
    GuestRoom: guestRooms.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name })),
    Therapy: Object.entries(therapyNameById).map(([id, name]) => ({ id, name })),
    Patient: guests,
  };
  const nameOf = (type: UiTimeOff['type'], id: string) => (type === 'Center' ? 'Whole centre' : type === 'Staff' ? staffNameById[id] : type === 'Room' ? roomNameById[id] : type === 'GuestRoom' ? guestRooms.find((r) => r.id === id)?.name : type === 'Therapy' ? therapyNameById[id] : patientNameById[id]) ?? id;
  // Rows mix people, rooms, therapies and guests; a name alone does not say which (#360).
  const kindOf = (h: Pick<UiTimeOff, 'type' | 'entity'>) => h.type === 'Staff' ? `Staff · ${staff.find((s) => String(s.id) === h.entity)?.role === 'doctor' ? 'Doctor' : 'Therapist'}` : h.type === 'GuestRoom' ? 'Guest room' : h.type === 'Room' ? 'Treatment room' : h.type === 'Patient' ? 'Guest' : h.type;

  // The picker: one kind, one or several of it.
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Kind | null>(null);
  const [chosen, setChosen] = useState<{ kind: Kind; ids: string[] } | null>(null);

  // The one form.
  const blank = { mode: 'now' as Mode, date: centreToday, endDate: centreToday, startTime: '', endTime: '', description: '' };
  const [form, setForm] = useState<(typeof blank & { kind: Kind; ids: string[]; editing?: UiTimeOff }) | null>(null);
  const set = (p: Partial<typeof blank>) => setForm((f) => (f ? { ...f, ...p } : f));

  const openAdd = (preset?: MarkOut | { type: 'Center'; entity: string }) => {
    if (preset && preset.type !== 'Center') { startForm(preset.type, [preset.entity], preset); return; }
    setChosen(null); setQ(''); setOpen(null); setPicking(true);
  };
  const startForm = (kind: Kind, ids: string[], p: Partial<MarkOut> = {}) => {
    setPicking(false);
    // A guest room is let by the night, so it is only ever whole days.
    const date = p.date ?? centreToday;
    setForm({ ...blank, mode: kind === 'GuestRoom' ? 'days' : p.mode ?? 'now', date, endDate: date, startTime: p.startTime ?? '', endTime: p.endTime ?? '', description: p.description ?? '', kind, ids });
  };
  const openEdit = (h: UiTimeOff) => {
    if (h.type === 'Center') return;
    const date = sortKey(h).slice(0, 10), endDate = (h.endDate || h.date || '').slice(0, 10);
    setForm({ kind: h.type, ids: [h.entity], editing: h, mode: isFullDay(h) ? 'days' : 'part', date, endDate, startTime: h.startTime || '', endTime: h.endTime || '', description: h.description || '' });
  };

  /** What the form will store: today from now, hours on one day, or whole days. */
  const stored = (f: NonNullable<typeof form>) => {
    const now = clockIn(timezone);
    if (f.mode === 'now') return { date: centreToday, endDate: centreToday, start: now, end: f.endTime && f.endTime > now ? f.endTime : closingTime };
    if (f.mode === 'part') return { date: f.date, endDate: f.date, start: f.startTime || timeSlots[0] || '09:00', end: f.endTime || closingTime };
    return { date: f.date, endDate: f.endDate < f.date ? f.date : f.endDate, start: null, end: null };
  };

  // The consequence line, said before the tap for every kind.
  const [impact, setImpact] = useState<string | null>(null);
  useEffect(() => {
    setImpact(null);
    if (!form || !form.ids.length) return;
    const s = stored(form);
    const when = form.mode === 'now' ? 'today' : s.date === s.endDate ? 'that day' : 'those days';
    let stale = false;
    if (form.kind === 'GuestRoom') {
      fetchJsonWithTimeout<{ id: string; guests: { name: string }[] }[]>(`${API_BASE}/guest-rooms/free?from=${s.date}&to=${nextDay(s.endDate)}`).then((r) => {
        if (stale || !Array.isArray(r)) return;
        const names = r.filter((x) => form.ids.includes(x.id)).flatMap((x) => x.guests.map((g) => g.name));
        setImpact(names.length ? `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} ${names.length === 1 ? 'is' : 'are'} in ${form.ids.length === 1 ? 'it' : 'them'} then and will need another room. It waits under "need you"; nobody is moved for you.` : 'Nobody is in it then.');
      }).catch(() => {});
    } else {
      const hours = s.start ? `&after=${s.start}&before=${s.end}` : '';
      fetchJsonWithTimeout<{ treatments: number }>(`${API_BASE}/timeoff/impact?type=${entityKey(form.kind)}&ids=${form.ids.join(',')}&from=${s.date}&to=${s.endDate}${hours}`).then((r) => {
        if (stale || typeof r?.treatments !== 'number') return;
        const [noun, need] = NEEDS[form.kind]!;
        const away = form.kind === 'Patient' ? ' Meals are marked "Away" on the kitchen sheet.' : '';
        setImpact((r.treatments ? `${plural(r.treatments, noun)} ${when} will need ${need}.` : `Nothing is booked ${when === 'today' ? 'for the rest of today' : when}.`) + away);
      }).catch(() => {});
    }
    return () => { stale = true; };
  }, [form?.kind, form?.ids.join(), form?.mode, form?.date, form?.endDate, form?.startTime, form?.endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const toUi = (c: Record<string, string | null>, kind: Kind): UiTimeOff => ({ id: c.id, date: c.date ? new Date(c.date).toISOString() : undefined, startDate: c.start_date ? new Date(c.start_date).toISOString() : undefined, endDate: c.end_date ? new Date(c.end_date).toISOString() : undefined, startTime: c.start_time || undefined, endTime: c.end_time || undefined, type: kind, entity: c.entity_id ?? '', description: c.description || '' });
  const body = (f: NonNullable<typeof form>, id: string) => {
    const s = stored(f);
    // Whole days are calendar days, stored as midnight UTC like every other date (#597).
    return { entity_type: entityKey(f.kind), entity_id: id, start_date: `${s.date}T00:00:00.000Z`, end_date: `${s.endDate}T00:00:00.000Z`, start_time: s.start, end_time: s.end, description: f.description, plan: false };
  };

  /** Several at once are all saved or none: one that fails takes back the ones before it. */
  const save = async (fixNow: boolean) => {
    if (!form) return;
    const f = form;
    const s = stored(f);
    setForm(null);
    const made: UiTimeOff[] = [];
    try {
      for (const id of f.ids) {
        const res = await fetch(`${API_BASE}/timeoff`, { method: 'POST', headers, body: JSON.stringify(body(f, id)) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || String(res.status));
        made.push(toUi(await res.json(), f.kind));
      }
    } catch (e) {
      await Promise.all(made.map((h) => fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers })));
      toast.error(`Not saved: ${(e as Error).message}. Try again.`);
      return;
    }
    setTimeOffs((prev) => [...prev, ...made]);
    window.dispatchEvent(new Event('timeoff-changed'));
    const names = f.ids.map((id) => nameOf(f.kind, id)).join(', ');
    const when = s.start ? `${s.date === centreToday ? 'today' : dayText(s.date)} ${s.start}–${s.end}` : s.date === s.endDate ? dayText(s.date) : `${dayText(s.date)} to ${dayText(s.endDate)}`;
    toast(`${names} not available ${when}${fixNow || f.kind === 'GuestRoom' ? '' : '. Anything it affects waits under "need you".'}`, { action: { label: 'Undo', onClick: async () => {
      await Promise.all(made.map((h) => fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers })));
      setTimeOffs((prev) => prev.filter((x) => !made.some((h) => h.id === x.id)));
      window.dispatchEvent(new Event('timeoff-changed'));
    } } });
    if (fixNow) void planRange(s.date, s.endDate);
  };

  // Save and fix (#695): one plan over every day in the range, shown before anything moves, accepted once.
  type RangeRow = { date: string; who: string; start_time: string | null; fix: { label: string; appointment_id: string; staff_id: string | null; co_staff_ids: string[]; room_id: string | null; start_time: string; date: string; cancel?: boolean } };
  const [plan, setPlan] = useState<{ rows: RangeRow[]; left: number } | null>(null);
  const planRange = async (from: string, to: string) => {
    const r = await fetchJsonWithTimeout<{ rows: RangeRow[]; left: number }>(`${API_BASE}/day-check/range?from=${from}&to=${to}`).catch(() => null);
    if (!r) { toast.error('The plan could not be worked out. It waits under "need you".'); return; }
    if (!r.rows.length) { toast(r.left ? `${plural(r.left, 'treatment')} need${r.left === 1 ? 's' : ''} you to choose; ${r.left === 1 ? 'it waits' : 'they wait'} under "need you".` : 'Nothing needed moving.'); return; }
    setPlan(r);
  };
  const acceptPlan = async () => {
    if (!plan) return;
    const p = plan;
    setPlan(null);
    const res = await fetch(`${API_BASE}/day-check/accept`, { method: 'POST', headers, body: JSON.stringify({ date: p.rows[0].date, moves: p.rows.map((r) => ({ ...r.fix, co_staff_ids: r.fix.co_staff_ids || [] })) }) });
    if (!res.ok) { toast.error('The days changed while this was open. Nothing was moved; it waits under "need you".'); return; }
    const batch = (await res.json()).batch_id as string | null;
    window.dispatchEvent(new Event('timeoff-changed'));
    toast(`${plural(p.rows.length, 'treatment')} fixed${p.left ? `. ${p.left} wait${p.left === 1 ? 's' : ''} under "need you".` : '.'}`, { action: batch ? { label: 'Undo', onClick: async () => {
      const u = await fetch(`${API_BASE}/replan/undo`, { method: 'POST', headers, body: JSON.stringify({ batch_id: batch }) });
      if (!u.ok) toast.error('That could not be undone.');
      window.dispatchEvent(new Event('timeoff-changed'));
    } } : undefined });
  };

  const saveEdit = async () => {
    if (!form?.editing) return;
    const f = form, h = form.editing;
    const res = await fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'PUT', headers, body: JSON.stringify(body(f, h.entity)) });
    if (!res.ok) { toast.error('Not saved. Try again.'); return; }
    const u = toUi(await res.json(), f.kind);
    setTimeOffs((prev) => prev.map((x) => (x.id === h.id ? u : x)));
    window.dispatchEvent(new Event('timeoff-changed'));
    setForm(null);
    toast.success('Saved');
  };

  // Available again: removed at once, and Undo puts it back as the server held it (#608).
  const remove = async (h: UiTimeOff) => {
    const kept = await fetchJsonWithTimeout<Record<string, unknown>[]>(`${API_BASE}/timeoff`).then((all) => (all || []).find((x) => x.id === h.id)).catch(() => undefined);
    const res = await fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers });
    if (!res.ok) { toast.error('Not changed. Try again.'); return; }
    setTimeOffs((prev) => prev.filter((x) => x.id !== h.id));
    window.dispatchEvent(new Event('timeoff-changed'));
    toast(`${nameOf(h.type, h.entity)} available again`, { action: kept ? { label: 'Undo', onClick: async () => {
      const { id: _id, ...back } = kept;
      const again = await fetch(`${API_BASE}/timeoff`, { method: 'POST', headers, body: JSON.stringify({ ...back, plan: false }) });
      if (!again.ok) { toast.error('It could not be put back.'); return; }
      const back2 = (await again.json()).id;
      setTimeOffs((prev) => [...prev, { ...h, id: back2 }]);
      window.dispatchEvent(new Event('timeoff-changed'));
    } } : undefined });
  };

  const rowFor = (h: UiTimeOff) => <Row key={h.id} title={nameOf(h.type, h.entity)} facts={[kindOf(h), leaveWhen(h, isFullDay(h)), h.description].filter(Boolean).join(' · ')} trailing="›" onClick={() => openEdit(h)} />;

  /** A thing's own sheet, the same rows for every kind (#695): Available again when it is not, its times, Not available…. */
  const outFor = (type: UiTimeOff['type'], entity: string) => {
    const mine = timeOffs.filter((h) => h.type === type && h.entity === entity && nowOrLater(h, centreToday)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const nowOut = mine.find((h) => isNow(h, centreToday, clockIn(timezone)));
    return (
      <ListGroup title={mine.length ? 'Not available' : undefined}>
        {nowOut ? <Row title="Available again" facts="From now; Undo puts it back" trailing="›" onClick={() => void remove(nowOut)} /> : null}
        {mine.map((h) => <Row key={h.id} title={leaveWhen(h, isFullDay(h))} facts={h.description || undefined} trailing="›" onClick={() => openEdit(h)} />)}
        <LinkRow label="Not available…" onClick={() => openAdd({ type, entity })} />
      </ListGroup>
    );
  };

  const hm = clockIn(timezone);
  const live = timeOffs.filter((h) => h.type !== 'Center' && nowOrLater(h, centreToday)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const now = live.filter((h) => isNow(h, centreToday, hm));
  const coming = live.filter((h) => !isNow(h, centreToday, hm));
  const closed = timeOffs.filter((h) => h.type === 'Center').sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const nextClosed = closed.find((h) => sortKey(h).slice(0, 10) >= centreToday);
  const tab = (
    <div data-testid="timeoff-table">
      <PageHead title="Availability" note={`${now.length} now · ${coming.length} coming`} />
      {live.length === 0 ? <Empty text="Everything is available. Tap + when something is not." /> : null}
      {now.length ? <ListGroup title="Not available now" count={now.length}>{now.map(rowFor)}</ListGroup> : null}
      {coming.length ? <div className="mt-3"><ListGroup title="Coming up" count={coming.length}>{coming.map(rowFor)}</ListGroup></div> : null}
      <div className="mt-3"><ListGroup title="The centre"><Row title="Centre closed days" facts={nextClosed ? `Next: ${nextClosed.description || 'Closed'}, ${leaveWhen(nextClosed, true)}` : 'None coming up'} trailing="›" onClick={() => setShowHolidays(true)} /></ListGroup></div>
    </div>
  );

  const needle = q.trim().toLowerCase();
  const toggle = (kind: Kind, id: string, on: boolean) => setChosen((c) => {
    // Several of one kind: choosing another kind starts again.
    const ids = c && c.kind === kind ? c.ids : [];
    const next = on ? [...ids, id] : ids.filter((x) => x !== id);
    return next.length ? { kind, ids: next } : null;
  });
  const f = form;
  const names = f ? f.ids.map((id) => nameOf(f.kind, id)).join(', ') : '';
  const s = f ? stored(f) : null;
  const fixLabel = !s ? '' : s.date === s.endDate ? (s.date === centreToday ? 'Save and fix the day' : 'Save and fix that day') : 'Save and fix those days';
  const dialogs = (
    <>
      <HolidaysSheet open={showHolidays} onOpenChange={setShowHolidays} closed={closedDays} today={todayKey}
        onAdded={(rows) => setTimeOffs((prev) => [...prev, ...rows.map((x) => ({ id: x.id, date: new Date(x.date).toISOString(), type: "Center" as const, entity: "All", description: x.description }))])} />
      <BottomSheet open={picking} onOpenChange={setPicking} title="What is not available?" note="Choose one or several of the same kind."
        foot={<>
          <SearchField value={q} onChange={setQ} placeholder="Type a name" />
          <Btn kind="primary" disabled={!chosen} onClick={() => chosen && startForm(chosen.kind, chosen.ids)}>{chosen ? `Next: ${chosen.ids.length === 1 ? nameOf(chosen.kind, chosen.ids[0]) : `${chosen.ids.length} ${ONE[chosen.kind][1]}`}` : 'Choose what is not available'}</Btn>
        </>}>
        {KINDS.map((k) => {
          const list = options[k].filter((o) => !needle || o.name.toLowerCase().includes(needle));
          if (!list.length) return null;
          const shown = needle || open === k || chosen?.kind === k;
          return (
            <ListGroup key={k} title={GROUP[k]} count={list.length}>
              {shown ? list.map((o) => <div key={o.id} className="px-4"><Tick label={o.name} on={chosen?.kind === k && chosen.ids.includes(o.id)} set={(v) => toggle(k, o.id, v)} /></div>)
                : <Row title={`Show ${GROUP[k].toLowerCase()}`} trailing="›" onClick={() => setOpen(k)} />}
            </ListGroup>
          );
        })}
      </BottomSheet>
      <BottomSheet open={!!f} onOpenChange={(o) => { if (!o) setForm(null); }} title={f ? `${names}: not available` : ''} note={f ? (f.editing ? kindOf(f.editing) : f.ids.length === 1 ? kindOf({ type: f.kind, entity: f.ids[0] }) : `${f.ids.length} ${ONE[f.kind][1]}`) : undefined}
        foot={!f ? null : f.editing
          ? <Foot label="Save" save={saveEdit} remove={() => { const h = f.editing!; setForm(null); void remove(h); }} removeLabel="Available again" />
          : f.kind === 'GuestRoom' ? <Foot label="Save" save={() => save(false)} />
          : <TwoFoot main={fixLabel} onMain={() => save(true)} alt="Save, fix later" onAlt={() => save(false)} />}>
        {f ? <>
          {f.kind === 'GuestRoom' ? <SheetNote>Whole nights only: a guest sleeps there.</SheetNote>
            : <Seg<Mode> value={f.mode} onChange={(mode) => set({ mode })} options={[['now', 'From now'], ['part', 'Part of a day'], ['days', 'Some days']]} />}
          {f.mode === 'now' ? (
            <div className="grid grid-cols-2 gap-3">
              <Row title="From" facts={`Now, ${hm}`} />
              <TimeList label="Until" times={[...timeSlots, closingTime]} after={hm} value={f.endTime && f.endTime > hm ? f.endTime : closingTime} onChange={(t) => set({ endTime: t })} />
            </div>
          ) : f.mode === 'part' ? <>
            <DateRow label="Day" value={f.date} min={centreToday} onChange={(v) => set({ date: v, endDate: v })} />
            <div className="grid grid-cols-2 gap-3">
              <TimeList label="From" times={timeSlots} value={f.startTime || timeSlots[0] || '09:00'} onChange={(t) => set({ startTime: t })} />
              <TimeList label="Until" times={[...timeSlots, closingTime]} after={f.startTime || timeSlots[0]} value={f.endTime || closingTime} onChange={(t) => set({ endTime: t })} />
            </div>
          </> : (
            <div className="grid grid-cols-2 gap-3">
              <DateRow label="From" value={f.date} onChange={(v) => set({ date: v, endDate: f.endDate < v ? v : f.endDate })} />
              <DateRow label="Until" value={f.endDate} min={f.date} onChange={(v) => set({ endDate: v })} />
            </div>
          )}
          <Text label="Reason (optional)" id="newTimeOffDescription" value={f.description} onChange={(e) => set({ description: e.target.value })} />
          {impact ? <Consequence>{impact}</Consequence> : null}
        </> : null}
      </BottomSheet>
      <BottomSheet open={!!plan} onOpenChange={(o) => { if (!o) setPlan(null); }} title="The plan"
        note={plan ? `${plural(plan.rows.length, 'treatment')} to move${plan.left ? `; ${plan.left} more wait${plan.left === 1 ? 's' : ''} for you under "need you"` : ''}. Nothing moves until you accept.` : undefined}
        foot={<TwoFoot main="Accept the plan" onMain={acceptPlan} alt="Not now" onAlt={() => setPlan(null)} />}>
        {plan ? Object.entries(plan.rows.reduce<Record<string, RangeRow[]>>((by, r) => { (by[r.date] ??= []).push(r); return by; }, {})).map(([date, rows]) => (
          <ListGroup key={date} title={date === centreToday ? 'Today' : dayText(date)} count={rows.length}>
            {rows.map((r) => <Row key={r.fix.appointment_id} title={[r.start_time, r.who].filter(Boolean).join(' · ')} facts={r.fix.label} />)}
          </ListGroup>
        )) : null}
      </BottomSheet>
    </>
  );

  /** Public holidays live with Opening hours in Settings (#288); the sheet is here because it adds to this list. */
  /** Search's row for a thing not available opens its entry (#695). */
  const openOne = (id: string) => { const h = timeOffs.find((x) => x.id === id); if (h) openEdit(h); };
  return { tab, dialogs, outFor, openAdd, openOne, openHolidays: () => setShowHolidays(true) };
}
