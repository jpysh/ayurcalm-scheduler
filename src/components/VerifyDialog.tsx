import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, X, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string; room_id: string; scheduled_date: string; start_time: string; duration_minutes: number };
type ApiStaff = { id: string; name: string; gender: "Male"|"Female"|"Other"; specializations: string[]; schedule: string; status: string };
type ApiRoom = { id: string; name: string; amenities: string[]; status: string };
type ApiTherapy = { id: string; name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean };
type ApiPatient = { id: string; name: string; gender: "Male"|"Female"|"Other" };
type ApiTimeOff = { id: string; entity_type: "center"|"staff"|"room"|"therapy"|"patient"; entity_id?: string|null; date?: string|null; start_date?: string|null; end_date?: string|null; start_time?: string|null; end_time?: string|null; recurrence?: 'weekly'|null; weekdays?: string[]|null };
type ApiProgramEvent = { id: string; date?: string|null; start_date?: string|null; end_date?: string|null; start_time: string; end_time: string; activity_name: string; audience?: string|null; room_id?: string|null; staff_id?: string|null };

type Suggestion = { dateISO: string; time: string; staff_id: string; room_id: string; staff_name: string; room_name: string };
type ApiSuggestionRaw = { scheduled_date: string; start_time: string; room_id: string; staff_id: string };

function toLocalDateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(t: string, mins: number) {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function weekdayOf(dateISO: string) {
  const d = new Date(dateISO);
  const idx = d.getDay();
  return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][idx];
}

function weekdayShort(dateISO: string) {
  const d = new Date(dateISO);
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

function scheduleWindowOk(schedule: Record<string, { start: string; end: string }> | undefined, dateISO: string, start: string, duration: number) {
  const dayKey = weekdayOf(dateISO);
  const defaultDay = { start: "09:00", end: "18:00" } as const;
  const day = (schedule && typeof schedule === "object" ? (schedule[dayKey] || undefined) : undefined) || defaultDay;
  const s = toMinutes(day.start);
  const e = toMinutes(day.end);
  const reqS = toMinutes(start);
  const reqE = reqS + duration;
  return reqS >= s && reqE <= e;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function VerifyDialog({ open, onOpenChange, apiBase, currentDate, patients, staff, rooms, therapies, timeoff, onOpenAppointment, onRefresh }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiBase: string;
  currentDate: Date;
  patients: ApiPatient[];
  staff: ApiStaff[];
  rooms: { id: string; name: string; amenities: string[]; status: string }[];
  therapies: ApiTherapy[];
  timeoff: ApiTimeOff[];
  onOpenAppointment: (a: ApiAppointment) => void;
  onRefresh: (datesISO: string[]) => Promise<void>;
}) {
  const [scope, setScope] = useState<"day"|"week"|"month">("day");
  const [loading, setLoading] = useState(false);
  const [affected, setAffected] = useState<{ appt: ApiAppointment; reason: string }[]>([]);
  const [staffRaw, setStaffRaw] = useState<{ id: string; weekly_schedule?: Record<string, { start: string; end: string }> }[]>([]);
  const [roomsRaw, setRoomsRaw] = useState<{ id: string; weekly_schedule?: Record<string, { start: string; end: string }> }[]>([]);
  const [dateISOList, setDateISOList] = useState<string[]>([]);
  const [openSuggestionsFor, setOpenSuggestionsFor] = useState<Set<string>>(new Set());
  const [suggestionsMap, setSuggestionsMap] = useState<Map<string, Suggestion[]>>(new Map());
  const [suggestionsLoading, setSuggestionsLoading] = useState<Map<string, boolean>>(new Map());
  const [rescheduledIds, setRescheduledIds] = useState<Set<string>>(new Set());
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [eventsByDate, setEventsByDate] = useState<Map<string, ApiProgramEvent[]>>(new Map());

  const therapyById = useMemo(() => {
    const m = new Map<string, ApiTherapy>();
    for (const t of therapies) m.set(String(t.id), t);
    return m;
  }, [therapies]);
  const staffById = useMemo(() => {
    const m = new Map<string, ApiStaff>();
    for (const s of staff) m.set(String(s.id), s);
    return m;
  }, [staff]);
  const roomById = useMemo(() => {
    const m = new Map<string, ApiRoom>();
    for (const r of rooms) m.set(String(r.id), r);
    return m;
  }, [rooms]);
  const patientById = useMemo(() => {
    const m = new Map<string, ApiPatient>();
    for (const p of patients) m.set(String(p.id), p);
    return m;
  }, [patients]);

  useEffect(() => {
    if (!open) return;
    const list: string[] = [];
    if (scope === "day") {
      list.push(toLocalDateISO(currentDate));
    } else {
      if (scope === "week") {
        const start = new Date(currentDate);
        start.setDate(currentDate.getDate() - currentDate.getDay() + 1);
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          list.push(toLocalDateISO(d));
        }
      } else {
        const start = new Date(currentDate);
        for (let i = 0; i < 30; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          list.push(toLocalDateISO(d));
        }
      }
    }
    setDateISOList(list);
  }, [open, scope, currentDate]);

  useEffect(() => {
    (async () => {
      if (!open || dateISOList.length === 0) return;
      const map = new Map<string, ApiProgramEvent[]>();
      for (const iso of dateISOList) {
        try {
          const res = await fetch(`${apiBase}/program-events?date=${iso}`);
          const data = await res.json();
          map.set(iso, Array.isArray(data) ? data : []);
        } catch { map.set(iso, []); }
      }
      setEventsByDate(map);
    })();
  }, [open, dateISOList, apiBase]);

  async function fetchAppointmentsForDates(datesISO: string[]) {
    const out: ApiAppointment[] = [];
    for (const iso of datesISO) {
      const res = await fetch(`${apiBase}/appointments?date=${iso}`);
      const data = await res.json();
      out.push(...(Array.isArray(data) ? data : []));
    }
    return out;
  }

  function isAffected(a: ApiAppointment) {
    const dISO = new Date(a.scheduled_date).toISOString().slice(0,10);
    const hSameDay = timeoff.filter(h => {
      const day = new Date(dISO);
      const dateHit = h.date ? sameDay(new Date(h.date), day) : false;
      const rangeHit = h.start_date && h.end_date ? (new Date(h.start_date) <= day && new Date(h.end_date) >= day) : false;
      const weeklyHit = h.recurrence === 'weekly' && Array.isArray(h.weekdays) ? h.weekdays.includes(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][day.getDay()]) : false;
      return dateHit || rangeHit || weeklyHit;
    });
    if (hSameDay.some(h => h.entity_type === "center")) return { affected: true, reason: "Center time off" };
    if (hSameDay.some(h => h.entity_type === "staff" && h.entity_id === a.staff_id)) return { affected: true, reason: "Staff time off" };
    if (hSameDay.some(h => h.entity_type === "room" && h.entity_id === a.room_id)) return { affected: true, reason: "Room time off" };
    if (hSameDay.some(h => h.entity_type === "therapy" && h.entity_id === a.therapy_id)) return { affected: true, reason: "Therapy time off" };
    if (hSameDay.some(h => h.entity_type === "patient" && h.entity_id === a.patient_id)) return { affected: true, reason: "Patient time off" };
    const s = staffById.get(String(a.staff_id));
    const r = roomById.get(String(a.room_id));
    const t = therapyById.get(String(a.therapy_id));
    const p = patientById.get(String(a.patient_id));
    if (!s || s.status !== "Active") return { affected: true, reason: "Staff inactive" };
    if (!r || r.status !== "Active") return { affected: true, reason: "Room inactive" };
    const genderMismatch = t?.requires_gender_match && s && p && ((s.gender === "Male" ? "male" : s.gender === "Female" ? "female" : "other") !== (p.gender === "Male" ? "male" : p.gender === "Female" ? "female" : "other"));
    if (genderMismatch) return { affected: true, reason: "Gender mismatch" };
    const amenityOk = t && r && (t.required_amenities || []).every(aReq => (r.amenities || []).includes(aReq));
    if (!amenityOk) return { affected: true, reason: "Amenities missing" };
    const sRaw = staffRaw.find(x => String(x.id) === String(a.staff_id));
    const rRaw = roomsRaw.find(x => String(x.id) === String(a.room_id));
    if (sRaw && !scheduleWindowOk(sRaw.weekly_schedule || {}, dISO, a.start_time, a.duration_minutes)) return { affected: true, reason: "Outside staff hours" };
    if (rRaw && !scheduleWindowOk(rRaw.weekly_schedule || {}, dISO, a.start_time, a.duration_minutes)) return { affected: true, reason: "Outside room hours" };
    const evs = eventsByDate.get(dISO) || [];
    const aStartM = toMinutes(a.start_time);
    const aEndM = aStartM + a.duration_minutes;
    const overlapAll = evs.some(e => (e as any).patients_scope === 'all' && Math.max(aStartM, toMinutes(e.start_time)) < Math.min(aEndM, toMinutes(e.end_time)));
    if (overlapAll) return { affected: true, reason: "Overlaps all-guests event" };
    const overlapRoom = evs.some(e => e.room_id && String(e.room_id) === String(a.room_id) && Math.max(aStartM, toMinutes(e.start_time)) < Math.min(aEndM, toMinutes(e.end_time)));
    if (overlapRoom) return { affected: true, reason: "Room used by event" };
    const overlapStaffDirect = evs.some(e => e.staff_id && String(e.staff_id) === String(a.staff_id) && Math.max(aStartM, toMinutes(e.start_time)) < Math.min(aEndM, toMinutes(e.end_time)));
    if (overlapStaffDirect) return { affected: true, reason: "Staff busy (event host)" };
    const overlapStaffScope = evs.some(e => ((e as any).staff_scope === 'all' || (Array.isArray((e as any).staff_ids) && (e as any).staff_ids.includes(String(a.staff_id)))) && Math.max(aStartM, toMinutes(e.start_time)) < Math.min(aEndM, toMinutes(e.end_time)));
    if (overlapStaffScope) return { affected: true, reason: "Staff busy (event participants)" };
    return { affected: false, reason: "" };
  }

  async function buildSuggestions(a: ApiAppointment) {
    const d = new Date(a.scheduled_date);
    const dateISO = d.toISOString().slice(0,10);
    const start = a.start_time;
    const end = addMinutes(start, Math.max(240, a.duration_minutes + 60));
    const payload = {
      patient_id: a.patient_id,
      therapy_id: a.therapy_id,
      total_sessions: 1,
      preferred_days: [],
      preferred_time_range: { start: "09:00", end: "18:00" },
      start_date: dateISO,
      end_date: dateISO,
      preview_only: true,
      now: new Date().toISOString(),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let data: { suggestions?: ApiSuggestionRaw[] } = {};
    try {
      const res = await fetch(`${apiBase}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) data = await res.json();
    } catch {
      data = {};
    } finally {
      clearTimeout(timer);
    }
    const roomMap = new Map<string, string>();
    const staffMap = new Map<string, string>();
    for (const r of rooms) roomMap.set(String(r.id), r.name);
    for (const s of staff) staffMap.set(String(s.id), s.name);
    const base: Suggestion[] = (data.suggestions || []).slice(0,3).map((sug: ApiSuggestionRaw) => ({
      dateISO: new Date(sug.scheduled_date).toISOString().slice(0,10),
      time: sug.start_time,
      staff_id: sug.staff_id,
      room_id: sug.room_id,
      staff_name: staffMap.get(String(sug.staff_id)) || String(sug.staff_id),
      room_name: roomMap.get(String(sug.room_id)) || String(sug.room_id),
    }));
    let sugg = base;
    if (sugg.length < 3) {
      const payloadWide = {
        patient_id: a.patient_id,
        therapy_id: a.therapy_id,
        total_sessions: 1,
        preferred_days: [],
        preferred_time_range: { start: "09:00", end: "18:00" },
        start_date: dateISO,
        end_date: dateISO,
        preview_only: true,
        now: new Date().toISOString(),
      };
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 5000);
      let data2: { suggestions?: ApiSuggestionRaw[] } = {};
      try {
        const res2 = await fetch(`${apiBase}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadWide), signal: controller2.signal });
        const ct2 = res2.headers.get('content-type') || '';
        if (ct2.includes('application/json')) data2 = await res2.json();
      } catch {
        data2 = {};
      } finally {
        clearTimeout(timer2);
      }
      const moreWide: Suggestion[] = (data2.suggestions || []).map((sug: ApiSuggestionRaw) => ({
        dateISO: new Date(sug.scheduled_date).toISOString().slice(0,10),
        time: sug.start_time,
        staff_id: sug.staff_id,
        room_id: sug.room_id,
        staff_name: staffMap.get(String(sug.staff_id)) || String(sug.staff_id),
        room_name: roomMap.get(String(sug.room_id)) || String(sug.room_id),
      }));
      const seen = new Set(sugg.map(s => `${s.dateISO}|${s.time}|${s.staff_id}|${s.room_id}`));
      for (const m of moreWide) {
        const key = `${m.dateISO}|${m.time}|${m.staff_id}|${m.room_id}`;
        if (!seen.has(key)) {
          sugg.push(m);
          seen.add(key);
          if (sugg.length >= 3) break;
        }
      }
    }
    if (sugg.length < 3) {
      const needed = 3 - sugg.length;
      const baseDate = new Date(a.scheduled_date);
      const mkPayload = (iso: string) => ({
        patient_id: a.patient_id,
        therapy_id: a.therapy_id,
        total_sessions: 1,
        preferred_days: [],
        preferred_time_range: { start: "09:00", end: "18:00" },
        start_date: iso,
        end_date: iso,
        preview_only: true,
        now: new Date().toISOString(),
      });
      const days: string[] = [];
      for (let i = 1; i <= 21; i++) {
        const dt = new Date(baseDate);
        dt.setDate(baseDate.getDate() + i);
        const iso = dt.toISOString().slice(0,10);
  const isCenterHoliday = timeoff.some(h => {
    if (h.entity_type !== "center") return false;
    const day = new Date(iso);
    const dateHit = h.date ? sameDay(new Date(h.date), day) : false;
    const rangeHit = h.start_date && h.end_date ? (new Date(h.start_date) <= day && new Date(h.end_date) >= day) : false;
    const weeklyHit = h.recurrence === 'weekly' && Array.isArray(h.weekdays) ? h.weekdays.includes(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][day.getDay()]) : false;
    return dateHit || rangeHit || weeklyHit;
  });
        if (!isCenterHoliday) days.push(iso);
      }
      for (let idx = 0; idx < days.length && sugg.length < 3; idx += 7) {
        const batch = days.slice(idx, idx + 7);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const results = await Promise.all(batch.map(async (iso) => {
            const res = await fetch(`${apiBase}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mkPayload(iso)), signal: controller.signal });
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) return [] as ApiSuggestionRaw[];
            const data = await res.json() as { suggestions?: ApiSuggestionRaw[] };
            return data.suggestions || [];
          }));
          const flat: ApiSuggestionRaw[] = ([] as ApiSuggestionRaw[]).concat(...results);
          const addList: Suggestion[] = flat.map((sug) => ({
            dateISO: new Date(sug.scheduled_date).toISOString().slice(0,10),
            time: sug.start_time,
            staff_id: sug.staff_id,
            room_id: sug.room_id,
            staff_name: staffMap.get(String(sug.staff_id)) || String(sug.staff_id),
            room_name: roomMap.get(String(sug.room_id)) || String(sug.room_id),
          }));
          const seen = new Set(sugg.map(s => `${s.dateISO}|${s.time}|${s.staff_id}|${s.room_id}`));
          for (const m of addList) {
            const key = `${m.dateISO}|${m.time}|${m.staff_id}|${m.room_id}`;
            if (!seen.has(key)) {
              sugg.push(m);
              seen.add(key);
              if (sugg.length >= 3) break;
            }
          }
        } catch {
          // ignore
        } finally {
          clearTimeout(timer);
        }
      }
    }
    const now = new Date();
    const todayISO = now.toISOString().slice(0,10);
    const nowMin = now.getHours()*60 + now.getMinutes();
    sugg = sugg.filter((x) => {
      if (x.dateISO !== todayISO) return true;
      const [hh,mm] = x.time.split(':').map(Number);
      const m = hh*60+mm;
      return m >= nowMin + 10;
    }).filter((x) => {
      const m = toMinutes(x.time);
      return m >= 9*60 && m <= 18*60;
    }).filter((x) => {
      const isCenterHoliday = timeoff.some(h => h.entity_type === "center" && h.date && sameDay(new Date(h.date), new Date(x.dateISO)));
      if (isCenterHoliday) return false;
      const sRaw = staffRaw.find(z => String(z.id) === String(x.staff_id));
      const rRaw = roomsRaw.find(z => String(z.id) === String(x.room_id));
      const okStaff = scheduleWindowOk(sRaw?.weekly_schedule || {}, x.dateISO, x.time, a.duration_minutes);
      const okRoom = scheduleWindowOk(rRaw?.weekly_schedule || {}, x.dateISO, x.time, a.duration_minutes);
      return okStaff && okRoom;
    }).slice(0,3);
    return sugg;
  }


  async function toggleSuggestions(appt: ApiAppointment) {
    const id = appt.id;
    const isOpen = openSuggestionsFor.has(id);
    if (isOpen) {
      setOpenSuggestionsFor((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setSuggestionsLoading((prev) => {
      const next = new Map(prev);
      next.set(id, true);
      return next;
    });
    try {
      const sugg = await buildSuggestions(appt);
      setSuggestionsMap((prev) => {
        const next = new Map(prev);
        next.set(id, sugg);
        return next;
      });
      setOpenSuggestionsFor((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    } finally {
      setSuggestionsLoading((prev) => {
        const next = new Map(prev);
        next.set(id, false);
        return next;
      });
    }
  }

  async function rescheduleToSuggestion(appt: ApiAppointment, s: Suggestion) {
    const payload = { scheduled_date: s.dateISO, start_time: s.time, staff_id: s.staff_id, room_id: s.room_id, status: "rescheduled" };
    const res = await fetch(`${apiBase}/appointments/${appt.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const text = await res.text();
      toast.error(text ? text.slice(0,120) : "Failed to reschedule");
      return;
    }
    await onRefresh([new Date(appt.scheduled_date).toISOString().slice(0,10), s.dateISO]);
    toast.success("Appointment rescheduled");
    const next = new Set(rescheduledIds);
    next.add(appt.id);
    setRescheduledIds(next);
  }

  async function deleteAppointment(appt: ApiAppointment) {
    if (deletingIds.has(appt.id)) return;
    if (!confirmDeleteFor.has(appt.id)) {
      const next = new Set(confirmDeleteFor);
      next.add(appt.id);
      setConfirmDeleteFor(next);
      toast.message("Double click to delete");
      setTimeout(() => {
        setConfirmDeleteFor((prev) => {
          const cleared = new Set(prev);
          cleared.delete(appt.id);
          return cleared;
        });
      }, 3000);
      return;
    }
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(appt.id);
      return next;
    });
    try {
      const res = await fetch(`${apiBase}/appointments/${appt.id}`, { method: "DELETE", headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await res.json().catch(() => ({} as Record<string, unknown>));
          toast.error((j && (j as { error?: string }).error) || "Failed to delete");
        } else {
          const text = await res.text();
          toast.error(text ? text.slice(0,120) : "Failed to delete");
        }
        return;
      }
      await onRefresh([new Date(appt.scheduled_date).toISOString().slice(0,10)]);
      setConfirmDeleteFor((prev) => {
        const cleared = new Set(prev);
        cleared.delete(appt.id);
        return cleared;
      });
      setAffected(prev => prev.filter(x => x.appt.id !== appt.id));
      toast.success("Appointment deleted");
    } catch (e) {
      const name = (e as { name?: string }).name || '';
      const msg = (e as { message?: string }).message || '';
      if (name === 'AbortError' || (msg && msg.includes('ERR_ABORTED'))) {
        // silently ignore aborted network noise in dev preview
      } else if (msg) {
        toast.error(msg);
      } else {
        toast.error('Delete failed');
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(appt.id);
        return next;
      });
    }
  }

  async function runVerify() {
    setLoading(true);
    try {
      const [sr, rr] = await Promise.all([
        fetch(`${apiBase}/staff`).then(r => r.json()).catch(() => []),
        fetch(`${apiBase}/rooms`).then(r => r.json()).catch(() => []),
      ]);
      setStaffRaw(Array.isArray(sr) ? sr : []);
      setRoomsRaw(Array.isArray(rr) ? rr : []);
      const list = await fetchAppointmentsForDates(dateISOList);
      const impacted: { appt: ApiAppointment; reason: string }[] = [];
      for (const a of list) {
        const chk = isAffected(a);
        if (chk.affected) {
          impacted.push({ appt: a, reason: chk.reason });
        }
      }
      setAffected(impacted);
      if (impacted.length === 0) toast.success("No affected appointments found");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[88vw] sm:max-w-sm md:max-w-sm p-1 sm:p-2 gap-1 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Verify</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              <Select value={scope} onValueChange={(v) => setScope(v as "day"|"week"|"month")}> 
                <SelectTrigger className="h-6 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">Next 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={runVerify} disabled={loading}>
              <RefreshCw className="w-3 h-3 mr-1" />
              {loading ? "Scanning" : "Scan"}
            </Button>
          </div>
          
        </div>
        <div className="space-y-0">
          {affected.map(({ appt, reason }) => {
            const p = patientById.get(String(appt.patient_id));
            const s = staffById.get(String(appt.staff_id));
            const r = roomById.get(String(appt.room_id));
            const t = therapyById.get(String(appt.therapy_id));
            const safe = (v?: string) => (v && v.trim().length > 0 ? v : "(Unknown)");
            return (
              <div key={appt.id} className={`p-1 rounded-md bg-card border w-full max-w-[300px] ${rescheduledIds.has(appt.id) ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                    {weekdayShort(new Date(appt.scheduled_date).toISOString().slice(0,10))} {new Date(appt.scheduled_date).toLocaleDateString("en-IN")} • {appt.start_time}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{reason}</Badge>
                </div>
                <div className="text-[11px] leading-tight">{safe(p?.name)}</div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                  {safe(t?.name)} {`(${appt.duration_minutes}min)`}
                </div>
                <div className="text-[11px] leading-tight">Staff: {safe(s?.name)} • Room: {safe(r?.name)}</div>
                <div className="mt-0 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {patientById.get(String(appt.patient_id)) ? (
                      <span className="text-[11px] underline cursor-pointer select-none" onClick={() => toggleSuggestions(appt)}>Suggestions</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Patient removed • delete only</span>
                    )}
                    {suggestionsLoading.get(appt.id) ? (
                      <span className="text-[11px] text-muted-foreground">Loading…</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0">
                    <button
                      type="button"
                      aria-label="Delete"
                      title="Double-click to delete"
                      className="inline-flex items-center justify-center h-[12px] w-[12px] p-0 m-0 bg-transparent text-muted-foreground hover:text-red-600 focus:outline-none"
                      onClick={() => deleteAppointment(appt)}
                      disabled={deletingIds.has(appt.id)}
                    >
                      <Trash2 className="w-[12px] h-[12px]" />
                    </button>
                  </div>
                </div>
                {openSuggestionsFor.has(appt.id) && !rescheduledIds.has(appt.id) && patientById.get(String(appt.patient_id)) && (
                  <div className="mt-0 overflow-x-auto">
                    <div className="flex items-start gap-0.5 min-w-max">
                      {(suggestionsMap.get(appt.id) || []).slice(0,3).map((sg, idx) => (
                        <div key={`${appt.id}-s-${idx}`} className="p-0.5 rounded-md bg-muted/40 border shrink-0 w-20 cursor-pointer" role="button" onClick={() => rescheduleToSuggestion(appt, sg)}>
                          <div className="text-[11px] font-semibold">{new Date(sg.dateISO).toLocaleDateString("en-IN")} • {sg.time}</div>
                          <div className="text-[11px]">{sg.staff_name}</div>
                          <div className="text-[11px]">{sg.room_name}</div>
                        </div>
                      ))}
                      {!(suggestionsLoading.get(appt.id)) && (suggestionsMap.get(appt.id) || []).length === 0 && (
                        <div className="text-[11px] text-muted-foreground">No available suggestions • delete only</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {affected.length === 0 && (
            <div className="text-[11px] text-muted-foreground">No affected appointments listed</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
  const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || '';
