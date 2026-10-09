import { useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import PageHead from "@/components/PageHead";
import { DateRow, Days, dayText, Dropdown, Empty, ListGroup, Row, Seg, SheetFoot, Text, TimeList, timesBetween, Group } from "@/components/kit";
import { API_TOKEN, type ApiProgramEvent, type UiStaff, type UiRoom } from "./shared";

/**
 * Classes and events (#227): a list, and one labelled form for adding and
 * editing, as the Leave sheet has: name, time, days, who runs it, room, and
 * whether patients are expected (#285 session 6: rows and sheet from the kit).
 */
const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type Form = {
  id?: string; activity_name: string; start_time: string; end_time: string;
  days: "daily" | "weekdays" | "once"; weekdays: string[]; date: string;
  staff_ids: string[]; room_id: string; is_optional: boolean;
  /** What the form does not show (who among residents, amenities), kept as it was. */
  raw?: ApiProgramEvent & { patients_scope?: string | null; patient_ids?: string[] };
};
const blank = (): Form => ({ activity_name: "", start_time: "07:00", end_time: "08:00", days: "daily", weekdays: [], date: "", staff_ids: [], room_id: "", is_optional: false });

const daysOf = (ev: ApiProgramEvent) => {
  const d = ev.weekdays || [];
  if (ev.recurrence !== "weekly" || d.length === 0) {
    const on = ev.date || ev.start_date;
    return on ? dayText(on) : "Once";
  }
  return d.length === 7 ? "Daily" : WEEK.filter((w) => d.includes(w)).map((w) => w[0].toUpperCase() + w.slice(1, 3)).join(", ");
};

const formOf = (ev: ApiProgramEvent): Form => {
  const d = ev.weekdays || [];
  const weekly = ev.recurrence === "weekly" && d.length > 0;
  const x = ev as ApiProgramEvent & { staff_ids?: string[]; is_optional?: boolean };
  return {
    id: String(ev.id), activity_name: ev.activity_name, start_time: ev.start_time || "", end_time: ev.end_time || "",
    days: !weekly ? "once" : d.length === 7 ? "daily" : "weekdays", weekdays: weekly ? d : [],
    date: String(ev.date || ev.start_date || "").slice(0, 10),
    staff_ids: x.staff_ids?.length ? x.staff_ids : ev.staff_id ? [String(ev.staff_id)] : [],
    room_id: ev.room_id ? String(ev.room_id) : "", is_optional: !!x.is_optional, raw: ev,
  };
};

export function useEventsScreen({ events, setEvents, roomsList, staff, staffNameById, q }: {
  events: ApiProgramEvent[]; setEvents: React.Dispatch<React.SetStateAction<ApiProgramEvent[]>>;
  roomsList: UiRoom[]; staff: UiStaff[]; staffNameById: Record<string, string>; q: string;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const headers = { "Content-Type": "application/json", ...(API_TOKEN ? { "x-api-key": API_TOKEN } : {}) };

  const save = async () => {
    if (!form) return;
    if (!form.activity_name.trim()) { toast.error("Give it a name"); return; }
    if (!form.start_time || !form.end_time || form.end_time <= form.start_time) { toast.error("The end must be after the start"); return; }
    if (form.days === "once" && !form.date) { toast.error("Choose the day"); return; }
    if (form.days === "weekdays" && !form.weekdays.length) { toast.error("Choose at least one day"); return; }
    const weekdays = form.days === "daily" ? [...WEEK] : form.days === "weekdays" ? form.weekdays : [];
    const payload = {
      activity_name: form.activity_name.trim(), start_time: form.start_time, end_time: form.end_time,
      recurrence: weekdays.length ? "weekly" : null, weekdays,
      // A period the sheet does not show (weekly between two dates, or a run of days) is kept.
      ...(() => {
        const r = form.raw, day = (d?: string | Date | null) => (d ? String(d).slice(0, 10) : null);
        if (weekdays.length) return { date: null, start_date: day(r?.start_date), end_date: day(r?.end_date) };
        if (r?.end_date && !r.date && day(r.start_date) === form.date) return { date: null, start_date: form.date, end_date: day(r.end_date) };
        return { date: form.date, start_date: null, end_date: null };
      })(),
      room_id: form.room_id || null,
      staff_scope: form.staff_ids.length ? "custom" : "none", staff_ids: form.staff_ids, staff_id: form.staff_ids[0] || null,
      patients_scope: form.raw?.patients_scope || "all", patient_ids: form.raw?.patient_ids || [], is_optional: form.is_optional,
      required_amenities: form.raw?.required_amenities || [],
    };
    setBusy(true);
    const res = await fetch(`${API_BASE}/program-events${form.id ? `/${form.id}` : ""}`, { method: form.id ? "PUT" : "POST", headers, body: JSON.stringify(payload) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { const j = await res?.json().catch(() => ({})); toast.error(j?.error || "Not saved", { duration: 10000 }); return; }
    setEvents(await fetch(`${API_BASE}/program-events`).then((r) => r.json()));
    toast.success(form.id ? "Saved" : `${payload.activity_name} added`);
    setForm(null);
  };
  const remove = async () => {
    if (!form?.id) return;
    const res = await fetch(`${API_BASE}/program-events/${form.id}`, { method: "DELETE", headers });
    if (!res.ok) { toast.error("Not deleted"); return; }
    setEvents((prev) => prev.filter((x) => String(x.id) !== form.id));
    setForm(null);
  };

  // The daily round first, by time of day, then one-off events by their day (#137).
  const once = (x: ApiProgramEvent) => (x.recurrence === "weekly" && (x.weekdays || []).length ? "" : String(x.date || x.start_date || ""));
  const ql = q.trim().toLowerCase();
  const rows = [...events].filter((x) => !ql || x.activity_name.toLowerCase().includes(ql)).sort((a, b) => once(a).localeCompare(once(b)) || (a.start_time || "").localeCompare(b.start_time || "") || a.activity_name.localeCompare(b.activity_name));
  const who = (ev: ApiProgramEvent) => {
    const ids = (ev as ApiProgramEvent & { staff_ids?: string[] }).staff_ids?.length ? (ev as ApiProgramEvent & { staff_ids: string[] }).staff_ids : ev.staff_id ? [String(ev.staff_id)] : [];
    return ids.map((id) => staffNameById[id] || "").filter(Boolean).join(", ");
  };
  const roomName = (id?: string | null) => roomsList.find((r) => String(r.id) === String(id))?.name;

  const tab = (
    <div>
      <PageHead title="Events" note={`${events.length}`} />
      {rows.length === 0 ? <Empty text={ql ? "No event matches." : "No classes or events yet. Tap + to add one."} /> : (
        <ListGroup>
          {rows.map((ev) => (
            <Row key={ev.id} title={ev.activity_name} trailing={`${ev.start_time}–${ev.end_time}`}
              facts={[daysOf(ev), who(ev), roomName(ev.room_id), (ev as ApiProgramEvent & { is_optional?: boolean }).is_optional ? "optional" : null].filter(Boolean).join(" · ")} onClick={() => setForm(formOf(ev))} />
          ))}
        </ListGroup>
      )}
    </div>
  );

  // Every quarter hour of a day: a time is picked, in 24-hour, never typed on a clock face.
  const times = timesBetween("00:00", "23:45", 15);
  const dialogs = (
    <BottomSheet open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }} title={form?.id ? "Edit event" : "Add event"} note="A class or event on the centre's round. Name and time are needed."
      foot={form ? <SheetFoot busy={busy} save={save} label={form.id ? "Save the event" : "Add the event"} remove={form.id ? remove : undefined} removeLabel="Delete this event" /> : undefined}>
      {form ? (<>
        <Text label="Name" value={form.activity_name} placeholder="Morning Yoga" onChange={(e) => set({ activity_name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <TimeList label="From" times={times} value={form.start_time} onChange={(t) => set({ start_time: t })} />
          <TimeList label="To" times={times} after={form.start_time} value={form.end_time} onChange={(t) => set({ end_time: t })} />
        </div>
        <Group label="Days">
          <Seg options={[["daily", "Every day"], ["weekdays", "Some days"], ["once", "One day"]]} value={form.days} onChange={(d) => set({ days: d })} />
        </Group>
        {form.days === "weekdays" ? <div className="mt-2"><Days value={form.weekdays} onChange={(v) => set({ weekdays: v })} /></div> : null}
        {form.days === "once" ? <DateRow label="On" value={form.date} onChange={(d) => set({ date: d })} /> : null}
        <Dropdown label="Run by (optional)" value={form.staff_ids[0] || ""} onChange={(e) => set({ staff_ids: e.target.value ? [e.target.value, ...form.staff_ids.slice(1).filter((x) => x !== e.target.value)] : [] })}>
          <option value="">No staff</option>
          {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </Dropdown>
        <Dropdown label="Room (optional)" value={form.room_id} onChange={(e) => set({ room_id: e.target.value })}>
          <option value="">No room (outdoors, the hall)</option>
          {roomsList.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
        </Dropdown>
        <Group label="Patients" note="No treatment is booked across an event everyone attends.">
          <Seg options={[["all", "Everyone attends"], ["optional", "Optional"]]} value={form.is_optional ? "optional" : "all"} onChange={(v) => set({ is_optional: v === "optional" })} />
        </Group>
      </>) : null}
    </BottomSheet>
  );

  return { tab, dialogs, openAdd: () => setForm(blank()) };
}
