import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import PageHead from "@/components/PageHead";
import { API_TOKEN, type ApiProgramEvent, type UiStaff, type UiRoom, type Patient } from "./shared";

/**
 * Classes and events (#227): a list, and one labelled form for adding and
 * editing, as the Leave sheet has: name, time, days, who runs it, room, and
 * whether residents are expected. The old inline table edit overflowed at 375px.
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
    return on ? new Date(on).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "Once";
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

export function useEventsScreen({ events, setEvents, roomsList, staff, staffNameById }: {
  events: ApiProgramEvent[]; setEvents: React.Dispatch<React.SetStateAction<ApiProgramEvent[]>>;
  roomsList: UiRoom[]; staff: UiStaff[]; patients: Patient[]; amenityOptions: string[]; isMobile: boolean;
  staffNameById: Record<string, string>; patientNameById: Record<string, string>;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const totalRef = useRef(0);
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
  const rows = [...events].sort((a, b) => once(a).localeCompare(once(b)) || (a.start_time || "").localeCompare(b.start_time || "") || a.activity_name.localeCompare(b.activity_name));
  totalRef.current = rows.length;
  const who = (ev: ApiProgramEvent) => {
    const ids = (ev as ApiProgramEvent & { staff_ids?: string[] }).staff_ids?.length ? (ev as ApiProgramEvent & { staff_ids: string[] }).staff_ids : ev.staff_id ? [String(ev.staff_id)] : [];
    return ids.map((id) => staffNameById[id] || "").filter(Boolean).join(", ");
  };
  const roomName = (id?: string | null) => roomsList.find((r) => String(r.id) === String(id))?.name;

  const tab = (
    <div>
      <PageHead title="Events" note={`${rows.length}`} />
      <div className="overflow-hidden rounded-2xl bg-card">
        {rows.map((ev) => (
          <button key={ev.id} type="button" className="flex min-h-[54px] w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0" onClick={() => setForm(formOf(ev))}>
            <span className="w-24 flex-none tabular-nums text-[14px] text-muted-foreground">{ev.start_time}–{ev.end_time}</span>
            <span className="flex-1">
              <b className="block text-[16px] font-semibold">{ev.activity_name}</b>
              <span className="block text-[13px] text-muted-foreground">{[daysOf(ev), who(ev), roomName(ev.room_id), (ev as ApiProgramEvent & { is_optional?: boolean }).is_optional ? "optional" : null].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="text-muted-foreground">›</span>
          </button>
        ))}
      </div>
      <button type="button" className="mt-3 flex h-12 w-full items-center justify-center rounded-full border font-semibold" onClick={() => setForm(blank())}><Plus className="mr-1 h-4 w-4" />Add event</button>
    </div>
  );

  const label = "grid gap-1 text-[13px] text-muted-foreground";
  const field = "min-h-11 w-full rounded-lg border bg-background px-2 text-[16px] text-foreground";
  const chip = (on: boolean) => `min-h-11 rounded-full border px-3 text-[15px] font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`;
  const dialogs = (
    <BottomSheet open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }} title={form?.id ? "Edit event" : "Add event"}>
      {form ? (
        <div className="-mt-2 grid max-h-[75dvh] gap-3 overflow-y-auto pb-1">
          <label className={label}>Name<input className={field} placeholder="Morning Yoga" value={form.activity_name} onChange={(e) => set({ activity_name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>From<input type="time" step={900} className={field} value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} /></label>
            <label className={label}>To<input type="time" step={900} className={field} value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} /></label>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] text-muted-foreground">Days</legend>
            <div className="flex flex-wrap gap-2">
              {([["daily", "Every day"], ["weekdays", "Some days"], ["once", "One day"]] as const).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={form.days === k} className={chip(form.days === k)} onClick={() => set({ days: k })}>{t}</button>
              ))}
            </div>
            {form.days === "weekdays" ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEK.map((w) => (
                  <button key={w} type="button" aria-pressed={form.weekdays.includes(w)} aria-label={w} className={chip(form.weekdays.includes(w))}
                    onClick={() => set({ weekdays: form.weekdays.includes(w) ? form.weekdays.filter((x) => x !== w) : [...form.weekdays, w] })}>{w[0].toUpperCase() + w.slice(1, 3)}</button>
                ))}
              </div>
            ) : null}
            {form.days === "once" ? <label className={label}>On<input type="date" className={field} value={form.date} onChange={(e) => set({ date: e.target.value })} /></label> : null}
          </fieldset>
          <label className={label}>Run by
            <select className={field} value={form.staff_ids[0] || ""} onChange={(e) => set({ staff_ids: e.target.value ? [e.target.value, ...form.staff_ids.slice(1).filter((x) => x !== e.target.value)] : [] })}>
              <option value="">Nobody from the team</option>
              {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </label>
          <label className={label}>Room
            <select className={field} value={form.room_id} onChange={(e) => set({ room_id: e.target.value })}>
              <option value="">No room (outdoors, the hall)</option>
              {roomsList.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
            </select>
          </label>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-[13px] text-muted-foreground">Patients</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!form.is_optional} className={chip(!form.is_optional)} onClick={() => set({ is_optional: false })}>Everyone attends</button>
              <button type="button" aria-pressed={form.is_optional} className={chip(form.is_optional)} onClick={() => set({ is_optional: true })}>Optional</button>
            </div>
            <span className="text-[12px] text-muted-foreground">No treatment is booked across an event everyone attends.</span>
          </fieldset>
          <div className="sticky bottom-0 flex gap-2 bg-card pt-2">
            {form.id ? <button type="button" className="min-h-11 rounded-full px-4 font-semibold text-destructive" onClick={remove}>Delete</button> : null}
            <span className="flex-1" />
            <button type="button" className="min-h-11 rounded-full px-4 font-semibold" onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground" disabled={busy} onClick={save}>{form.id ? "Save" : "Add"}</button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );

  return { tab, dialogs, setVisibleRows: (_n: number) => {}, totalRef };
}
