import { ChangeLine, Consequence, DateRow, Days, Dropdown, Empty, Foot, ListGroup, Row, Seg, Switch, Text, TimeList, TwoFoot } from "@/components/kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, fetchJsonWithTimeout, leaveWhen, toLocalInput, type UiTimeOff, type UiStaff, type UiRoom, type UiTherapy, type Patient } from "./shared";
import PageHead from "@/components/PageHead";
import { BottomSheet } from "@/components/BottomBar";
import { HolidaysSheet } from "@/components/HolidaysSheet";

const sortKey = (h: UiTimeOff) => h.startDate || h.date || '';

/** Leave (#285 story 9): one row each, who and when; a tap opens the same sheet that adds one. */
const TimeOffTab = ({ timeOffs, viewMode, setViewMode, visibleRows, totalRef, nameOf, isFullDay, weeklyLabel, openEdit, setShowHolidays }: {
  timeOffs: UiTimeOff[]; viewMode: 'all' | 'upcoming' | 'past'; setViewMode: (v: 'all' | 'upcoming' | 'past') => void;
  visibleRows: number; totalRef: { current: number }; nameOf: (h: UiTimeOff) => string;
  isFullDay: (h: UiTimeOff) => boolean; weeklyLabel: (w?: UiTimeOff['weekdays']) => string; openEdit: (h: UiTimeOff) => void; setShowHolidays: (v: boolean) => void;
}) => {
  const today = new Date(new Date().toDateString());
  const rows = timeOffs.filter((h) => {
    if (viewMode === 'all') return true;
    const start = sortKey(h) ? new Date(sortKey(h)) : undefined;
    const endRaw = h.endDate || h.date;
    const end = endRaw ? new Date(endRaw) : undefined;
    if (viewMode === 'upcoming') return h.recurrence === 'weekly' ? !(end && end < today) : !!start && start >= today;
    return !!end && end < today;
  }).sort((a, b) => new Date(sortKey(a)).getTime() - new Date(sortKey(b)).getTime());
  totalRef.current = rows.length;
  return (
    <div data-testid="timeoff-table">
      <PageHead title="Leave" note={`${rows.length} ${viewMode === 'all' ? '' : viewMode}`.trim()} />
      <Seg<'upcoming' | 'past' | 'all'> value={viewMode} onChange={setViewMode} options={[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']]} />
      <ListGroup>
        <ChangeLine label="Public holidays" value="Closed days" onClick={() => setShowHolidays(true)} />
      </ListGroup>
      {rows.length === 0 ? <Empty text={viewMode === 'past' ? 'No past leave.' : 'No leave booked. Tap + to add some.'} /> : (
        <ListGroup>
          {rows.slice(0, visibleRows).map((h) => (
            <Row key={h.id} title={nameOf(h)} facts={[leaveWhen(h, isFullDay(h)), h.recurrence === 'weekly' ? weeklyLabel(h.weekdays) : '', h.description].filter(Boolean).join(' · ')} onClick={() => openEdit(h)} />
          ))}
        </ListGroup>
      )}
    </div>
  );
};

export default TimeOffTab;

/** The Time off screen: its filters, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useTimeOffScreen({ timeOffs, setTimeOffs, staff, roomsList, therapies, patients, staffNameById, roomNameById, therapyNameById, patientNameById, isMobile, requestDelete, loadReplans, refreshAppointmentsForDate, todayKey, timeSlots, planDay }: {
  timeOffs: UiTimeOff[]; setTimeOffs: React.Dispatch<React.SetStateAction<UiTimeOff[]>>;
  staff: UiStaff[]; roomsList: UiRoom[]; therapies: UiTherapy[]; patients: Patient[];
  staffNameById: Record<string, string>; roomNameById: Record<string, string>; therapyNameById: Record<string, string>; patientNameById: Record<string, string>;
  isMobile: boolean; requestDelete: (kind: "timeoff", id: string, name?: string) => void;
  loadReplans: () => void; refreshAppointmentsForDate: (iso: string, silent?: boolean) => Promise<void>; todayKey: string;
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
  const [visibleTimeOffRows, setVisibleTimeOffRows] = useState(isMobile ? 20 : 40);
  const timeoffTotalRef = useRef(0);
  useEffect(() => { setVisibleTimeOffRows(isMobile ? 20 : 40); }, [timeOffs, holidayViewMode, isMobile]);
  // Most leave is a therapist's whole day, starting today (#137).
  const blank = () => ({
    date: todayKey, endDate: todayKey, type: "Staff" as "Center" | "Staff" | "Room" | "Therapy" | "Patient", entity: "", fullDay: true, description: "", startTime: "", endTime: "",
    recurrence: undefined as 'weekly' | undefined, weekdays: undefined as UiTimeOff['weekdays'],
  });
  const [newTimeOff, setNewTimeOff] = useState({
    date: todayKey,
    endDate: todayKey,
    type: "Staff" as "Center" | "Staff" | "Room" | "Therapy" | "Patient",
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

  const setTimeHM = (iso: string, hh: number, mm: number) => {
    const d = new Date(iso);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  const isFullDay = (h: UiTimeOff) => {
    // No hours is the whole day, wherever the centre's day starts or ends.
    return !h.startTime || !h.endTime;
  };
  const weeklyLabel = (weekdays?: UiTimeOff['weekdays']) => {
    if (!weekdays || weekdays.length === 0) return 'none';
    const map: Record<string, string> = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
    return `Weekly: ${weekdays.map((w) => map[w] || w).join(', ')}`;
  };

  const nameOf = (h: UiTimeOff) => h.type === 'Center' ? 'Whole centre' : (h.type === 'Staff' ? staffNameById[h.entity] : h.type === 'Room' ? roomNameById[h.entity] : h.type === 'Therapy' ? therapyNameById[h.entity] : patientNameById[h.entity]) ?? h.entity;
  const openEdit = (h: UiTimeOff) => {
    setEditing(h);
    setNewTimeOff({ date: (h.startDate || h.date || todayKey).slice(0, 10), endDate: (h.endDate || h.date || todayKey).slice(0, 10), type: h.type, entity: h.entity, fullDay: isFullDay(h), description: h.description || '', startTime: h.startTime || '', endTime: h.endTime || '', recurrence: h.recurrence, weekdays: h.weekdays });
    setSheet('edit');
  };
  const openAdd = () => { setEditing(null); setNewTimeOff(blank()); setSheet('new'); };
  const closeSheet = (o: boolean) => { if (!o) { setSheet(null); setEditing(null); } };

  const saveEdit = async () => {
    if (!editing) return;
    const n = newTimeOff;
    const startTime = n.startTime || timeSlots[0] || '09:00';
    const endTime = n.endTime || timeSlots[timeSlots.length - 1] || '18:00';
    const payload = {
      entity_type: n.type.toLowerCase(), entity_id: n.type === 'Center' ? null : n.entity,
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
    <TimeOffTab timeOffs={timeOffs} viewMode={holidayViewMode} setViewMode={setHolidayViewMode} visibleRows={visibleTimeOffRows} totalRef={timeoffTotalRef}
      nameOf={nameOf} isFullDay={isFullDay} weeklyLabel={weeklyLabel} openEdit={openEdit} setShowHolidays={setShowHolidays} />
  );

  /** Records the leave; the day is planned now (the plan is shown to accept) or left waiting on the pill. */
  const save = async (planNow: boolean) => {
    if (newTimeOff.type !== 'Center' && !newTimeOff.entity) {
      toast.error('Choose who is away first');
      return;
    }
    const planFor = newTimeOff.date;
    const entity_type = newTimeOff.type.toLowerCase();
    const tempId = `temp-${Date.now()}`;
    const startTime = newTimeOff.startTime || timeSlots[0] || '09:00';
    const endTime = newTimeOff.endTime || timeSlots[timeSlots.length - 1] || '18:00';
    const startIso = newTimeOff.fullDay ? setTimeHM(newTimeOff.date, 9, 0) : `${newTimeOff.date}T${startTime}`;
    const endIso = newTimeOff.fullDay ? setTimeHM(newTimeOff.endDate, 18, 0) : `${newTimeOff.endDate}T${endTime}`;
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
          start_time: newTimeOff.fullDay ? null : startTime,
          end_time: newTimeOff.fullDay ? null : endTime,
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
      if (planNow) planDay(planFor);
      else toast.success('Leave saved. The day still needs planning: it waits under "need you".');
    } catch {
      setTimeOffs((prev) => prev.filter((h) => h.id !== tempId));
      toast.error('The leave was not saved. Try again.');
    }
  };

  const dialogs = (
    <>
      <HolidaysSheet open={showHolidays} onOpenChange={setShowHolidays} closed={closedDays} today={todayKey}
        onAdded={(rows) => setTimeOffs((prev) => [...prev, ...rows.map((x) => ({ id: x.id, date: new Date(x.date).toISOString(), type: "Center" as const, entity: "All", description: x.description }))])} />
      <BottomSheet open={sheet !== null} onOpenChange={closeSheet} title={sheet === 'edit' ? 'Change leave' : 'New leave'} note={sheet === 'edit' ? `${editing ? nameOf(editing) : ''}. Change anything, then save.` : 'Who is away, and when.'}
        foot={sheet === 'edit'
          ? <Foot label="Save the leave" save={saveEdit} ok={newTimeOff.type === 'Center' || !!newTimeOff.entity} remove={() => { const h = editing; closeSheet(false); if (h) requestDelete('timeoff', h.id, h.description); }} removeLabel="Delete this leave" />
          : <TwoFoot main="Save and plan the day" onMain={() => save(true)} alt="Save, plan later" onAlt={() => save(false)} ok={newTimeOff.type === 'Center' || !!newTimeOff.entity} />}>
        {/* Who first, as one list (#265 H1): the old form asked for a "type" before the person. */}
        <Dropdown label="Who or what" id="leaveWho" required
          value={newTimeOff.type === 'Center' ? 'Center:All' : newTimeOff.entity ? `${newTimeOff.type}:${newTimeOff.entity}` : ''}
          onChange={(e) => { const [type, ...id] = e.target.value.split(':'); setNewTimeOff({ ...newTimeOff, type: type as UiTimeOff['type'], entity: id.join(':') }); }}>
          <option value="" disabled>Choose…</option>
          <optgroup label="Therapists and doctors">{staff.map((x) => <option key={x.id} value={`Staff:${x.id}`}>{x.name}</option>)}</optgroup>
          <optgroup label="Rooms">{roomsList.map((r) => <option key={r.id} value={`Room:${r.id}`}>{r.name}</option>)}</optgroup>
          <optgroup label="The whole centre"><option value="Center:All">The centre is closed</option></optgroup>
          <optgroup label="Therapies">{therapies.map((t) => <option key={String(t.id ?? t.name)} value={`Therapy:${String(t.id ?? t.name)}`}>{t.name}</option>)}</optgroup>
          <optgroup label="Patients">{patients.map((x) => <option key={x.id} value={`Patient:${x.id}`}>{x.name}</option>)}</optgroup>
        </Dropdown>
        <div className="grid grid-cols-2 gap-3">
          <DateRow label="From" value={newTimeOff.date} onChange={(v) => setNewTimeOff({ ...newTimeOff, date: v, endDate: newTimeOff.endDate < v ? v : newTimeOff.endDate })} />
          <DateRow label="To" value={newTimeOff.endDate} min={newTimeOff.date} onChange={(v) => setNewTimeOff({ ...newTimeOff, endDate: v })} />
        </div>
        <Switch label="Full day" on={newTimeOff.fullDay} set={(v) => setNewTimeOff({ ...newTimeOff, fullDay: v })} />
        {newTimeOff.fullDay ? null : (
          <div className="grid grid-cols-2 gap-3">
            <TimeList label="Starts" times={timeSlots} value={newTimeOff.startTime || timeSlots[0] || '09:00'} onChange={(t) => setNewTimeOff({ ...newTimeOff, startTime: t })} />
            <TimeList label="Ends" times={timeSlots} after={newTimeOff.date === newTimeOff.endDate ? (newTimeOff.startTime || timeSlots[0]) : undefined} value={newTimeOff.endTime || timeSlots[timeSlots.length - 1] || '18:00'} onChange={(t) => setNewTimeOff({ ...newTimeOff, endTime: t })} />
          </div>
        )}
        <Switch label="Every week" on={newTimeOff.recurrence === 'weekly'} set={(v) => setNewTimeOff({ ...newTimeOff, recurrence: v ? 'weekly' : undefined, weekdays: v ? (newTimeOff.weekdays || [(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const)[new Date(`${newTimeOff.date}T00:00:00Z`).getUTCDay()]]) : undefined })} />
        {newTimeOff.recurrence === 'weekly' ? <Days value={newTimeOff.weekdays || []} onChange={(v) => setNewTimeOff({ ...newTimeOff, weekdays: v as UiTimeOff['weekdays'] })} /> : null}
        <Text label="Reason (optional)" id="newTimeOffDescription" value={newTimeOff.description} onChange={(e) => setNewTimeOff({ ...newTimeOff, description: e.target.value })} />
        {impact === null ? null : <Consequence>{impact === 0 ? 'No treatments are booked then.' : `${impact} treatment${impact === 1 ? '' : 's'} ${newTimeOff.date === newTimeOff.endDate ? 'that day' : 'on those days'} will need a new therapist.`}</Consequence>}
      </BottomSheet>
    </>
  );

  return { tab, dialogs, setVisibleRows: setVisibleTimeOffRows, totalRef: timeoffTotalRef, openAdd };
}
