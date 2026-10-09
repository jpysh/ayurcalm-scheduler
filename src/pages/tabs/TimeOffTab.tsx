import { Consequence, DateRow, dayText, Days, Empty, PickField, SheetNote, Foot, LinkRow, ListGroup, Row, Seg, Switch, Text, TimeList, TwoFoot } from "@/components/kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, fetchJsonWithTimeout, leaveWhen, toLocalInput, type UiTimeOff, type UiStaff } from "./shared";
import PageHead from "@/components/PageHead";
import { BottomSheet } from "@/components/BottomBar";
import { HolidaysSheet } from "@/components/HolidaysSheet";

/** The server's name for what is away: a guest room is `guest_room`, the rest are the lower-cased type. */
const entityKey = (t: string) => (t === 'GuestRoom' ? 'guest_room' : t.toLowerCase());
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const sortKey = (h: UiTimeOff) => h.startDate || h.date || '';

/** Days a thing is out, marked from its own screen (#671): Leave is people only, so each kind says it in its own words. */
const OUT: Partial<Record<UiTimeOff['type'], { group: string; add: string; title: string; note: string; save: string; done: string }>> = {
  Room: { group: 'Out of use', add: 'Out of use for some days', title: 'Room out of use', note: 'Nothing is booked into it then.', save: 'Mark the room out of use', done: 'out of use' },
  GuestRoom: { group: 'Out of use', add: 'Out of use for some days', title: 'Guest room out of use', note: 'The room cannot be given to a guest on these days.', save: 'Mark the room out of use', done: 'out of use' },
  Therapy: { group: 'Not given', add: 'Not given on some days', title: 'Therapy not given', note: 'It is not booked on these days, say when the oil has run out.', save: 'Save the days', done: 'not given' },
  Patient: { group: 'Away', add: 'No treatments on these days', title: 'No treatments', note: 'Nothing is booked for them then, say for a day trip.', save: 'Save the days', done: 'has no treatments' },
};
/** Still to come, or a weekly repeat not yet ended: what the Upcoming filter keeps. */
const upcoming = (h: UiTimeOff, today: string) => {
  const end = (h.endDate || h.date || '').slice(0, 10);
  return h.recurrence === 'weekly' ? !(end && end < today) : !!end && end >= today;
};

/** Leave (#285 story 9): one row each, who and when; a tap opens the same sheet that adds one. */
const TimeOffTab = ({ today, timeOffs, viewMode, setViewMode, visibleRows, totalRef, nameOf, kindOf, isFullDay, weeklyLabel, openEdit, onHolidays }: {
  /** The centre's today, YYYY-MM-DD: leave is whole calendar days, so it is compared as days, never against the phone's midnight (#601). */
  today: string;
  timeOffs: UiTimeOff[]; viewMode: 'all' | 'upcoming' | 'past'; setViewMode: (v: 'all' | 'upcoming' | 'past') => void;
  visibleRows: number; totalRef: { current: number }; nameOf: (h: UiTimeOff) => string; kindOf: (h: UiTimeOff) => string;
  isFullDay: (h: UiTimeOff) => boolean; weeklyLabel: (w?: UiTimeOff['weekdays']) => string; openEdit: (h: UiTimeOff) => void; onHolidays: () => void;
}) => {
  // The centre's closed days are set once a year and live in their own sheet; this list is the team's, which changes daily.
  const closed = timeOffs.filter((h) => h.type === 'Center').sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const nextClosed = closed.find((h) => sortKey(h).slice(0, 10) >= today);
  const rows = timeOffs.filter((h) => h.type === 'Staff').filter((h) => {
    if (viewMode === 'all') return true;
    const start = sortKey(h).slice(0, 10) || undefined;
    const endRaw = h.endDate || h.date;
    const end = endRaw ? endRaw.slice(0, 10) : undefined;
    if (viewMode === 'upcoming') return h.recurrence === 'weekly' ? !(end && end < today) : !!start && start >= today;
    return !!end && end < today;
  }).sort((a, b) => new Date(sortKey(a)).getTime() - new Date(sortKey(b)).getTime());
  totalRef.current = rows.length;
  return (
    <div data-testid="timeoff-table">
      <PageHead title="Leave" note={`${rows.length} ${viewMode === 'all' ? '' : viewMode}`.trim()} />
      <div className="mb-3"><ListGroup><Row title="Centre closed days" facts={nextClosed ? `Next: ${nextClosed.description || 'Closed'}, ${leaveWhen(nextClosed, true)}` : 'None coming up'} trailing="›" onClick={onHolidays} /></ListGroup></div>
      <Seg<'upcoming' | 'past' | 'all'> value={viewMode} onChange={setViewMode} options={[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']]} />
      {rows.length === 0 ? <Empty text={viewMode === 'past' ? 'No past leave.' : 'No leave booked. Tap + to add some.'} /> : (
        <ListGroup>
          {rows.slice(0, visibleRows).map((h) => (
            <Row key={h.id} title={nameOf(h)} facts={[kindOf(h), leaveWhen(h, isFullDay(h)), h.recurrence === 'weekly' ? weeklyLabel(h.weekdays) : '', h.description].filter(Boolean).join(' · ')} onClick={() => openEdit(h)} />
          ))}
        </ListGroup>
      )}
    </div>
  );
};

export default TimeOffTab;

/** The Time off screen: its filters, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useTimeOffScreen({ timeOffs, setTimeOffs, staff, staffNameById, roomNameById, therapyNameById, patientNameById, loadReplans, refreshAppointmentsForDate, todayKey, startDay, centreToday, timeSlots, planDay }: {
  timeOffs: UiTimeOff[]; setTimeOffs: React.Dispatch<React.SetStateAction<UiTimeOff[]>>;
  staff: UiStaff[];
  staffNameById: Record<string, string>; roomNameById: Record<string, string>; therapyNameById: Record<string, string>; patientNameById: Record<string, string>;
  loadReplans: () => void; refreshAppointmentsForDate: (iso: string, silent?: boolean) => Promise<void>; todayKey: string; startDay: string; centreToday: string;
  /** The centre's slot times, "HH:MM": what part-day leave starts and ends on. */
  timeSlots: string[];
  /** Save and plan: shows the day of the leave with the plan for it, to accept. */
  planDay: (iso: string) => void;
}) {
  const [holidayViewMode, setHolidayViewMode] = useState<'all'|'upcoming'|'past'>('upcoming');
  const [sheet, setSheet] = useState<'new' | 'edit' | null>(null);
  const [editing, setEditing] = useState<UiTimeOff | null>(null);
  const [showHolidays, setShowHolidays] = useState(false);
  const closedDays = useMemo(() => new Set(timeOffs.filter((h) => h.type === "Center").map((h) => (h.date || h.startDate || "").slice(0, 10))), [timeOffs]);
  // Guest rooms (#563): the same leave list and sheet take a room out for some days, say for no electricity.
  const [guestRooms, setGuestRooms] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  useEffect(() => { fetchJsonWithTimeout<{ id: string; name: string; is_active: boolean }[]>(`${API_BASE}/guest-rooms`).then((r) => setGuestRooms(Array.isArray(r) ? r : [])).catch(() => {}); }, [timeOffs.length]);
  const [visibleTimeOffRows, setVisibleTimeOffRows] = useState(20);
  const timeoffTotalRef = useRef(0);
  useEffect(() => { setVisibleTimeOffRows(20); }, [timeOffs, holidayViewMode]);
  // Most leave is a therapist's whole day, starting today (#137).
  const blank = () => ({
    date: startDay, endDate: startDay, type: "Staff" as "Center" | "Staff" | "Room" | "GuestRoom" | "Therapy" | "Patient", entity: "", fullDay: true, description: "", startTime: "", endTime: "",
    recurrence: undefined as 'weekly' | undefined, weekdays: undefined as UiTimeOff['weekdays'],
  });
  const [newTimeOff, setNewTimeOff] = useState({
    date: startDay,
    endDate: startDay,
    type: "Staff" as "Center" | "Staff" | "Room" | "GuestRoom" | "Therapy" | "Patient",
    entity: "",
    fullDay: true,
    description: "",
    startTime: "", endTime: "",
    recurrence: undefined as 'weekly' | undefined, weekdays: undefined as UiTimeOff['weekdays'],
  });

  // The consequence line: how many treatments the days would leave without their therapist (story 9).
  const [impact, setImpact] = useState<number | null>(null);
  useEffect(() => {
    if (!sheet || newTimeOff.type !== 'Staff' || !newTimeOff.entity) { setImpact(null); return; }
    let stale = false;
    fetchJsonWithTimeout<{ treatments: number }>(`${API_BASE}/timeoff/impact?staff_id=${newTimeOff.entity}&from=${newTimeOff.date}&to=${newTimeOff.endDate}`).then((r) => { if (!stale) setImpact(typeof r?.treatments === 'number' ? r.treatments : null); });
    return () => { stale = true; };
  }, [sheet, newTimeOff.type, newTimeOff.entity, newTimeOff.date, newTimeOff.endDate]);

  // A guest already in the room on those days will need another one (#563); said before the tap.
  const [inRoom, setInRoom] = useState<string[] | null>(null);
  useEffect(() => {
    if (!sheet || newTimeOff.type !== 'GuestRoom' || !newTimeOff.entity) { setInRoom(null); return; }
    let stale = false;
    fetchJsonWithTimeout<{ id: string; guests: { name: string }[] }[]>(`${API_BASE}/guest-rooms/free?from=${newTimeOff.date}&to=${nextDay(newTimeOff.endDate)}`)
      .then((r) => { if (!stale) setInRoom(Array.isArray(r) ? r.find((x) => x.id === newTimeOff.entity)?.guests.map((g) => g.name) ?? [] : null); });
    return () => { stale = true; };
  }, [sheet, newTimeOff.type, newTimeOff.entity, newTimeOff.date, newTimeOff.endDate]);
  const isFullDay = (h: UiTimeOff) => {
    // No hours is the whole day, wherever the centre's day starts or ends.
    return !h.startTime || !h.endTime;
  };
  const weeklyLabel = (weekdays?: UiTimeOff['weekdays']) => {
    if (!weekdays || weekdays.length === 0) return 'none';
    const map: Record<string, string> = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
    return `Weekly: ${weekdays.map((w) => map[w] || w).join(', ')}`;
  };

  const nameOf = (h: UiTimeOff) => h.type === 'Center' ? 'Whole centre' : (h.type === 'Staff' ? staffNameById[h.entity] : h.type === 'Room' ? roomNameById[h.entity] : h.type === 'GuestRoom' ? guestRooms.find((r) => r.id === h.entity)?.name : h.type === 'Therapy' ? therapyNameById[h.entity] : patientNameById[h.entity]) ?? h.entity;
  // Rows mix people, rooms, therapies and patients; a name alone does not say which (#360).
  const kindOf = (h: UiTimeOff) => h.type === "Staff" ? (staff.find((s) => String(s.id) === h.entity)?.role === "doctor" ? "Doctor" : "Therapist") : h.type === "GuestRoom" ? "Guest room" : h.type;
  // Removed at once and put back by Undo from the leave as the server held it (#608); the day's own moves are not redone, they wait under "need you".
  const removeLeave = async (h: UiTimeOff) => {
    const who = nameOf(h);
    const kept = await fetchJsonWithTimeout<Record<string, unknown>[]>(`${API_BASE}/timeoff`).then((all) => (all || []).find((x) => x.id === h.id)).catch(() => undefined);
    const res = await fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
    if (!res.ok) { toast.error('The leave was not removed. Try again.'); return; }
    setTimeOffs((prev) => prev.filter((x) => x.id !== h.id));
    window.dispatchEvent(new Event('timeoff-changed'));
    toast(h.type === 'Center' ? 'Closed day removed' : `Leave for ${who} removed`, { action: kept ? { label: 'Undo', onClick: async () => {
      const { id: _id, ...back } = kept;
      const again = await fetch(`${API_BASE}/timeoff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...back, plan: false }) });
      if (!again.ok) { toast.error('The leave could not be put back.'); return; }
      const made = await again.json();
      setTimeOffs((prev) => [...prev, { ...h, id: made.id }]);
      window.dispatchEvent(new Event('timeoff-changed'));
    } } : undefined });
  };
  const openEdit = (h: UiTimeOff) => {
    setEditing(h);
    setNewTimeOff({ date: (h.startDate || h.date || todayKey).slice(0, 10), endDate: (h.endDate || h.date || todayKey).slice(0, 10), type: h.type, entity: h.entity, fullDay: isFullDay(h), description: h.description || '', startTime: h.startTime || '', endTime: h.endTime || '', recurrence: h.recurrence, weekdays: h.weekdays });
    setSheet('edit');
  };
  const openAdd = (preset?: { type: UiTimeOff['type']; entity: string }) => { setEditing(null); setNewTimeOff({ ...blank(), ...(preset ?? {}) }); setSheet('new'); };
  /** A room, guest room, therapy or patient lists its own days out on its sheet, and adds more there (#671). */
  const outFor = (type: UiTimeOff['type'], entity: string) => {
    const w = OUT[type]!;
    const mine = timeOffs.filter((h) => h.type === type && h.entity === entity && upcoming(h, centreToday)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return (
      <ListGroup title={mine.length ? w.group : undefined}>
        {mine.map((h) => <Row key={h.id} title={leaveWhen(h, isFullDay(h))} facts={[h.recurrence === 'weekly' ? weeklyLabel(h.weekdays) : '', h.description].filter(Boolean).join(' · ') || undefined} trailing="›" onClick={() => openEdit(h)} />)}
        <LinkRow label={w.add} onClick={() => openAdd({ type, entity })} />
      </ListGroup>
    );
  };
  const closeSheet = (o: boolean) => { if (!o) { setSheet(null); setEditing(null); } };

  const saveEdit = async () => {
    if (!editing) return;
    const n = newTimeOff;
    const startTime = n.startTime || timeSlots[0] || '09:00';
    const endTime = n.endTime || timeSlots[timeSlots.length - 1] || '18:00';
    const payload = {
      entity_type: entityKey(n.type), entity_id: n.type === 'Center' ? null : n.entity,
      start_date: `${n.date}T00:00:00.000Z`, end_date: `${n.endDate}T00:00:00.000Z`,
      start_time: n.fullDay ? null : startTime, end_time: n.fullDay ? null : endTime,
      recurrence: n.recurrence, weekdays: n.weekdays, description: n.description,
    };
    try {
      const res = await fetch(`${API_BASE}/timeoff/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(String(res.status));
      const u = await res.json();
      setTimeOffs((prev) => prev.map((x) => x.id === editing.id ? { ...x, type: n.type, entity: n.type === 'Center' ? 'All' : n.entity, description: n.description, date: u.date ? new Date(u.date).toISOString() : undefined, startDate: u.start_date ? new Date(u.start_date).toISOString() : undefined, endDate: u.end_date ? new Date(u.end_date).toISOString() : undefined, startTime: u.start_time || undefined, endTime: u.end_time || undefined, recurrence: u.recurrence || undefined, weekdays: u.weekdays || undefined } : x));
      toast.success('Leave saved');
      closeSheet(false);
    } catch {
      toast.error('The leave was not saved. Try again.');
    }
  };

  const tab = (
    <TimeOffTab today={centreToday} timeOffs={timeOffs} viewMode={holidayViewMode} setViewMode={setHolidayViewMode} visibleRows={visibleTimeOffRows} totalRef={timeoffTotalRef}
      nameOf={nameOf} kindOf={kindOf} isFullDay={isFullDay} weeklyLabel={weeklyLabel} openEdit={openEdit} onHolidays={() => setShowHolidays(true)} />
  );

  /** Records the leave; the day is planned now (the plan is shown to accept) or left waiting on the pill. */
  const save = async (planNow: boolean) => {
    if (newTimeOff.type !== 'Center' && !newTimeOff.entity) {
      toast.error('Choose who is away first');
      return;
    }
    const planFor = newTimeOff.date;
    const entity_type = entityKey(newTimeOff.type);
    const tempId = `temp-${Date.now()}`;
    const startTime = newTimeOff.startTime || timeSlots[0] || '09:00';
    const endTime = newTimeOff.endTime || timeSlots[timeSlots.length - 1] || '18:00';
    // Whole days are calendar days, stored as midnight UTC like every other date, whatever zone the phone is in (#597).
    const room = newTimeOff.type === 'GuestRoom';
    const startIso = newTimeOff.fullDay || room ? `${newTimeOff.date}T00:00:00.000Z` : `${newTimeOff.date}T${startTime}`;
    const endIso = newTimeOff.fullDay || room ? `${newTimeOff.endDate}T00:00:00.000Z` : `${newTimeOff.endDate}T${endTime}`;
    const optimistic: UiTimeOff = { id: tempId, startDate: startIso, endDate: endIso, recurrence: newTimeOff.recurrence, weekdays: newTimeOff.weekdays as UiTimeOff['weekdays'], type: newTimeOff.type, entity: newTimeOff.type === 'Center' ? 'All' : (newTimeOff.entity || ''), description: newTimeOff.description };
    setTimeOffs((prev) => [...prev, optimistic]);
    setSheet(null);
    setNewTimeOff(blank());
    try {
      const res = await fetch(`${API_BASE}/timeoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type,
          entity_id: optimistic.entity === 'All' ? null : (optimistic.entity || null),
          start_date: optimistic.startDate,
          end_date: optimistic.endDate,
          start_time: room || newTimeOff.fullDay ? null : startTime,
          end_time: room || newTimeOff.fullDay ? null : endTime,
          recurrence: optimistic.recurrence,
          weekdays: optimistic.weekdays,
          description: optimistic.description,
          // The plan is shown before it is applied, or waits: the server never rebuilds the day behind the admin's back from here.
          plan: false,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const created = await res.json();
      setTimeOffs((prev) => prev.map((h) => h.id === tempId ? { id: created.id, startDate: created.start_date ? new Date(created.start_date).toISOString() : undefined, endDate: created.end_date ? new Date(created.end_date).toISOString() : undefined, recurrence: created.recurrence || undefined, weekdays: created.weekdays || undefined, type: optimistic.type, entity: created.entity_id ?? optimistic.entity, description: created.description ?? optimistic.description } : h));
      if (optimistic.type !== 'Staff' && OUT[optimistic.type]) {
        const name = nameOf(optimistic);
        toast(`${name} ${OUT[optimistic.type]!.done} ${newTimeOff.date === newTimeOff.endDate ? dayText(newTimeOff.date) : `${dayText(newTimeOff.date)} to ${dayText(newTimeOff.endDate)}`}`, {
          action: { label: 'Undo', onClick: async () => { await fetch(`${API_BASE}/timeoff/${created.id}`, { method: 'DELETE' }); setTimeOffs((prev) => prev.filter((h) => h.id !== created.id)); } },
        });
      } else if (planNow) planDay(planFor);
      else toast.success('Leave saved. The day still needs planning: it waits under "need you".');
    } catch {
      setTimeOffs((prev) => prev.filter((h) => h.id !== tempId));
      toast.error('The leave was not saved. Try again.');
    }
  };

  const out = newTimeOff.type === 'Staff' || newTimeOff.type === 'Center' ? undefined : OUT[newTimeOff.type];
  const dialogs = (
    <>
      <HolidaysSheet open={showHolidays} onOpenChange={setShowHolidays} closed={closedDays} today={todayKey}
        onAdded={(rows) => setTimeOffs((prev) => [...prev, ...rows.map((x) => ({ id: x.id, date: new Date(x.date).toISOString(), type: "Center" as const, entity: "All", description: x.description }))])} />
      <BottomSheet open={sheet !== null} onOpenChange={closeSheet} title={out ? out.title : sheet === 'edit' ? 'Change leave' : 'New leave'} note={out ? out.note : sheet === 'edit' ? `${editing ? nameOf(editing) : ''}. Change anything, then save.` : 'Who is away, and when.'}
        foot={sheet === 'edit'
          ? <Foot label="Save the leave" save={saveEdit} ok={newTimeOff.type === 'Center' || !!newTimeOff.entity} remove={() => { const h = editing; closeSheet(false); if (h) void removeLeave(h); }} removeLabel={out ? 'Remove these days' : 'Delete this leave'} />
          : out
            ? <Foot label={out.save} ok={!!newTimeOff.entity} save={() => save(false)} />
            : <TwoFoot main="Save and plan the day" onMain={() => save(true)} alt="Save, plan later" onAlt={() => save(false)} ok={newTimeOff.type === 'Center' || !!newTimeOff.entity} />}>
        {/* Leave is people only (#671); anything else arrives here from its own sheet, already chosen. */}
        {out ? <ListGroup><Row title={nameOf({ id: '', type: newTimeOff.type, entity: newTimeOff.entity, description: '' })} facts={kindOf({ id: '', type: newTimeOff.type, entity: newTimeOff.entity, description: '' })} /></ListGroup>
          : <PickField label="Who" placeholder="Choose…" value={newTimeOff.entity ? `Staff:${newTimeOff.entity}` : ''}
            onPick={(v) => setNewTimeOff({ ...newTimeOff, type: 'Staff', entity: v.split(':').slice(1).join(':') })}
            groups={(['Therapists', 'Doctors'] as const).map((title) => ({ title, options: staff.filter((x) => (x.role === 'doctor') === (title === 'Doctors')).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: `Staff:${x.id}`, name: x.name })) })).filter((g) => g.options.length)} />}
        {sheet === 'new' && newTimeOff.type !== 'Center' && !newTimeOff.entity ? <SheetNote>Choose who is away to save.</SheetNote> : null}
        <div className="grid grid-cols-2 gap-3">
          <DateRow label="From" value={newTimeOff.date} onChange={(v) => setNewTimeOff({ ...newTimeOff, date: v, endDate: newTimeOff.endDate < v ? v : newTimeOff.endDate })} />
          <DateRow label="To" value={newTimeOff.endDate} min={newTimeOff.date} onChange={(v) => setNewTimeOff({ ...newTimeOff, endDate: v })} />
        </div>
        {newTimeOff.type === 'GuestRoom' ? null : <Switch label="Full day" on={newTimeOff.fullDay} set={(v) => setNewTimeOff({ ...newTimeOff, fullDay: v })} />}
        {newTimeOff.fullDay || newTimeOff.type === 'GuestRoom' ? null : (
          <div className="grid grid-cols-2 gap-3">
            <TimeList label="Starts" times={timeSlots} value={newTimeOff.startTime || timeSlots[0] || '09:00'} onChange={(t) => setNewTimeOff({ ...newTimeOff, startTime: t })} />
            <TimeList label="Ends" times={timeSlots} after={newTimeOff.date === newTimeOff.endDate ? (newTimeOff.startTime || timeSlots[0]) : undefined} value={newTimeOff.endTime || timeSlots[timeSlots.length - 1] || '18:00'} onChange={(t) => setNewTimeOff({ ...newTimeOff, endTime: t })} />
          </div>
        )}
        {newTimeOff.type === 'GuestRoom' ? null : <Switch label="Every week" on={newTimeOff.recurrence === 'weekly'} set={(v) => setNewTimeOff({ ...newTimeOff, recurrence: v ? 'weekly' : undefined, weekdays: v ? (newTimeOff.weekdays || [(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const)[new Date(`${newTimeOff.date}T00:00:00Z`).getUTCDay()]]) : undefined })} />}
        {newTimeOff.recurrence === 'weekly' ? <Days value={newTimeOff.weekdays || []} onChange={(v) => setNewTimeOff({ ...newTimeOff, weekdays: v as UiTimeOff['weekdays'] })} /> : null}
        <Text label="Reason (optional)" id="newTimeOffDescription" value={newTimeOff.description} onChange={(e) => setNewTimeOff({ ...newTimeOff, description: e.target.value })} />
        {newTimeOff.type === 'GuestRoom' && inRoom ? <Consequence>{inRoom.length ? `${inRoom.join(' and ')} ${inRoom.length === 1 ? 'is' : 'are'} in it then, and will need another room: it waits under "need you".` : 'Nobody is in it then.'}</Consequence> : null}
        {impact === null ? null : <Consequence>{impact === 0 ? 'No treatments are booked then.' : `${impact} treatment${impact === 1 ? '' : 's'} ${newTimeOff.date === newTimeOff.endDate ? 'that day' : 'on those days'} will need a new therapist.`}</Consequence>}
      </BottomSheet>
    </>
  );

  /** Public holidays live with Opening hours in Settings (#288); the sheet is here because it adds to this list. */
  return { tab, dialogs, outFor, setVisibleRows: setVisibleTimeOffRows, totalRef: timeoffTotalRef, openAdd, openHolidays: () => setShowHolidays(true) };
}
