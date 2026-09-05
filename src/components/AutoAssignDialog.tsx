import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

interface AutoAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned?: (dates: string[]) => void;
  defaultDateISO?: string;
}

const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || '';
const fetchJsonWithTimeout = async <T = unknown>(url: string, ms = 6000): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator && 'onLine' in navigator && navigator.onLine === false) {
    return [] as T;
  }
  let attempt = 0;
  while (attempt < 2) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return await res.json();
    } catch {
      attempt += 1;
      if (attempt >= 2) return [] as T;
    } finally {
      clearTimeout(timer);
    }
  }
  return [] as T;
};
type Weekday = 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday';
type WeeklySchedule = Record<Weekday, { start: string; end: string }>;
type ApiPatient = { id: string; name: string; gender?: 'male'|'female'|'other'; phone?: string | null; available_from?: string | null; available_to?: string | null };
type ApiTherapy = { id: string; name: string; duration_minutes: number; required_amenities?: string[]; requires_gender_match?: boolean };
type ApiStaff = { id: string; name: string; gender?: 'male'|'female'|'other'; weekly_schedule?: WeeklySchedule };
type ApiRoom = { id: string; name: string; weekly_schedule?: WeeklySchedule; amenities?: string[] };
type ApiTimeOff = { id?: string; entity_type: 'center'|'staff'|'room'|'therapy'|'patient'; entity_id?: string | null; date?: string | null; start_date?: string | null; end_date?: string | null; start_time?: string | null; end_time?: string | null; recurrence?: 'weekly' | null; weekdays?: Weekday[] | null; description?: string | null };

export const AutoAssignDialog = ({ open, onOpenChange, onAssigned, defaultDateISO }: AutoAssignDialogProps) => {
  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [formData, setFormData] = useState({
    patientId: "",
    therapyId: "",
    totalSessions: "1",
    preferredDays: [] as string[],
    preferredTimeStart: "09:00",
    preferredTimeEnd: "18:00",
    startDate: toLocalDateStr(new Date()),
    endDate: toLocalDateStr(new Date()),
    preferredStaffId: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [therapies, setTherapies] = useState<ApiTherapy[]>([]);
  const [therapyQuery, setTherapyQuery] = useState("");
  const [therapyPickerOpen, setTherapyPickerOpen] = useState(false);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [daysPickerOpen, setDaysPickerOpen] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [staff, setStaff] = useState<ApiStaff[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  interface AssignmentAppointment {
    date: string;
    time: string;
    room: string;
    staff: string;
    therapy?: string;
    patient?: string;
  }
  interface AssignmentResult {
    success: boolean;
    appointments: AssignmentAppointment[];
  }
  const [assignmentResult, setAssignmentResult] = useState<AssignmentResult | null>(null);
  type Suggestion = { date: string; time: string; room_id: string; staff_id: string; room: string; staff: string };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number | null>(null);
  const [assignedDates, setAssignedDates] = useState<string[]>([]);
  const [preferredFallbackUsed, setPreferredFallbackUsed] = useState(false);
  type ApiProgramEvent = { id: string; date?: string|null; start_date?: string|null; end_date?: string|null; start_time: string; end_time: string; activity_name: string; audience?: string|null; room_id?: string|null; staff_id?: string|null };
  const [eventsByDate, setEventsByDate] = useState<Map<string, ApiProgramEvent[]>>(new Map());

  const selectedPatientName = useMemo(() => patients.find((p) => p.id === formData.patientId)?.name || "", [patients, formData.patientId]);
  const therapiesFiltered = useMemo(() => {
    const q = therapyQuery.trim().toLowerCase();
    return q ? therapies.filter((t) => t.name.toLowerCase().includes(q)) : therapies;
  }, [therapies, therapyQuery]);
  const selectedPreferredStaff = useMemo(() => staff.find((s) => s.id === formData.preferredStaffId) || null, [staff, formData.preferredStaffId]);
  const selectedPatient = useMemo(() => patients.find((p) => p.id === formData.patientId) || null, [patients, formData.patientId]);
  const selectedTherapy = useMemo(() => therapies.find((t) => t.id === formData.therapyId) || null, [therapies, formData.therapyId]);
  const staffFiltered = useMemo(() => {
    let list = [...staff];
    if (selectedTherapy?.requires_gender_match && selectedPatient?.gender) {
      list = list.filter((s) => s.gender === selectedPatient?.gender);
    }
    return list;
  }, [staff, selectedTherapy, selectedPatient]);
  useEffect(() => {
    if (selectedTherapy?.requires_gender_match && selectedPatient?.gender && formData.preferredStaffId) {
      const cur = staff.find((s) => s.id === formData.preferredStaffId);
      if (cur && cur.gender !== selectedPatient.gender) {
        setFormData((prev) => ({ ...prev, preferredStaffId: "" }));
      }
    }
  }, [selectedTherapy, selectedPatient, staff, formData.preferredStaffId]);

  const [timeOffs, setTimeOffs] = useState<ApiTimeOff[]>([]);
  useEffect(() => {
    const s = formData.startDate;
    const e = formData.endDate;
    if (!s || !e) return;
    (async () => {
      try {
        const t = await fetchJsonWithTimeout<ApiTimeOff[]>(`${API_BASE}/timeoff?from=${s}&to=${e}`);
        setTimeOffs(Array.isArray(t) ? t : []);
      } catch {
        setTimeOffs([]);
      }
    })();
  }, [formData.startDate, formData.endDate]);

  const load = async () => {
    try {
        const p = await fetchJsonWithTimeout<ApiPatient[]>(`${API_BASE}/patients`);
        const t = await fetchJsonWithTimeout<ApiTherapy[]>(`${API_BASE}/therapies`);
        const s = await fetchJsonWithTimeout<ApiStaff[]>(`${API_BASE}/staff`);
        const r = await fetchJsonWithTimeout<ApiRoom[]>(`${API_BASE}/rooms`);
        setPatients((p || []).map((x) => ({ id: x.id, name: x.name, gender: x.gender, phone: x.phone || null, available_from: x.available_from || null, available_to: x.available_to || null })));
        setTherapies(t || []);
        setStaffMap(Object.fromEntries((s || []).map((x) => [x.id, x.name])));
        setStaff(s || []);
        setRoomMap(Object.fromEntries((r || []).map((x) => [x.id, x.name])));
        setRooms(r || []);
      } catch {
        setPatients([]);
        setTherapies([]);
        setStaffMap({});
        setStaff([]);
        setRoomMap({});
      }
  };

  useEffect(() => {
    if (!open) return;
    const today = toLocalDateStr(new Date());
    setFormData({
      patientId: "",
      therapyId: "",
      totalSessions: "1",
      preferredDays: [],
      preferredTimeStart: "09:00",
      preferredTimeEnd: "18:00",
      startDate: defaultDateISO || today,
      endDate: defaultDateISO || today,
      preferredStaffId: "",
    });
    setAssignmentResult(null);
    setSuggestions([]);
    setSelectedSuggestionIdx(null);
    setAssignedDates([]);
    setTherapyQuery("");
    setTherapyPickerOpen(false);
    setPatientPickerOpen(false);
    setDaysPickerOpen(false);
    setStaffPickerOpen(false);
    setPreferredFallbackUsed(false);
    load();
  }, [open, defaultDateISO]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const startISO = toLocalDateStr(new Date(formData.startDate));
        const endISO = toLocalDateStr(new Date(formData.endDate));
        const d0 = new Date(startISO);
        const d1 = new Date(endISO);
        const map = new Map<string, ApiProgramEvent[]>();
        for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
          const iso = toLocalDateStr(new Date(d));
          const res = await fetch(`${API_BASE}/program-events?date=${iso}`);
          const data = await res.json();
          map.set(iso, Array.isArray(data) ? data : []);
        }
        setEventsByDate(map);
      } catch { /* noop */ }
    })();
  }, [open, formData.startDate, formData.endDate]);

  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [conflictDetails, setConflictDetails] = useState<Record<string, unknown> | null>(null);
  const defaultBusinessDay = useMemo(() => ({ start: "09:00", end: "18:00" } as const), []);
  type Weekday = 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday';
  const weekdayNames = useMemo<Weekday[]>(() => ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], []);
  const toMinutes = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const toTimeString = (mins: number) => { const h=Math.floor(mins/60), m=mins%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };
  const centerHoursByDay = useMemo(() => {
    const map = ({ sunday: { ...defaultBusinessDay }, monday: { ...defaultBusinessDay }, tuesday: { ...defaultBusinessDay }, wednesday: { ...defaultBusinessDay }, thursday: { ...defaultBusinessDay }, friday: { ...defaultBusinessDay }, saturday: { ...defaultBusinessDay } }) satisfies Record<Weekday, { start: string; end: string }>;
    (rooms || []).forEach((r) => {
      const ws = (r.weekly_schedule || {}) as Record<Weekday, { start?: string; end?: string }>;
      weekdayNames.forEach((wd) => {
        const s = ws[wd]?.start || defaultBusinessDay.start;
        const e = ws[wd]?.end || defaultBusinessDay.end;
        map[wd] = { start: toTimeString(Math.min(toMinutes(map[wd].start), toMinutes(s))), end: toTimeString(Math.max(toMinutes(map[wd].end), toMinutes(e))) };
      });
    });
    return map;
  }, [rooms, defaultBusinessDay, weekdayNames]);
  const staffHoursByDay = useMemo(() => {
    const map = ({ sunday: { ...defaultBusinessDay }, monday: { ...defaultBusinessDay }, tuesday: { ...defaultBusinessDay }, wednesday: { ...defaultBusinessDay }, thursday: { ...defaultBusinessDay }, friday: { ...defaultBusinessDay }, saturday: { ...defaultBusinessDay } }) satisfies Record<Weekday, { start: string; end: string }>;
    const selected = (staff || []).find((s) => s.id === formData.preferredStaffId);
    if (!selected) return map;
    const ws = (selected.weekly_schedule || {}) as Record<Weekday, { start?: string; end?: string }>;
    weekdayNames.forEach((wd) => {
      const s = ws[wd]?.start || defaultBusinessDay.start;
      const e = ws[wd]?.end || defaultBusinessDay.end;
      map[wd] = { start: s, end: e };
    });
    return map;
  }, [staff, formData.preferredStaffId, defaultBusinessDay, weekdayNames]);
  const effectiveHours = useMemo(() => {
    const days = (formData.preferredDays.length > 0 ? formData.preferredDays : weekdayNames) as Weekday[];
    const minStart = Math.max(...days.map((d) => toMinutes(centerHoursByDay[d].start)));
    const maxEnd = Math.min(...days.map((d) => toMinutes(centerHoursByDay[d].end)));
    const staffMinStart = Math.max(...days.map((d) => toMinutes(staffHoursByDay[d].start)));
    const staffMaxEnd = Math.min(...days.map((d) => toMinutes(staffHoursByDay[d].end)));
    const startM = Math.max(minStart, staffMinStart);
    const endM = Math.min(maxEnd, staffMaxEnd);
    return { start: toTimeString(startM), end: toTimeString(endM) };
  }, [centerHoursByDay, staffHoursByDay, formData.preferredDays, weekdayNames]);
  useEffect(() => {
    setFormData((prev) => {
      let s = prev.preferredTimeStart;
      let e = prev.preferredTimeEnd;
      if (toMinutes(s) < toMinutes(effectiveHours.start)) s = effectiveHours.start;
      if (toMinutes(e) > toMinutes(effectiveHours.end)) e = effectiveHours.end;
      if (toMinutes(e) <= toMinutes(s)) e = toTimeString(Math.min(toMinutes(effectiveHours.end), toMinutes(s) + 60));
      return { ...prev, preferredTimeStart: s, preferredTimeEnd: e };
    });
  }, [effectiveHours.start, effectiveHours.end]);

  const therapyAvailableFilter = useMemo(() => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const daysPref = (formData.preferredDays.length > 0 ? formData.preferredDays : weekdayNames) as Weekday[];
    const inclusiveDays: { date: Date; wd: Weekday }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const wdIdx = d.getDay();
      const wd = weekdayNames[wdIdx];
      inclusiveDays.push({ date: new Date(d), wd });
    }
    const hits = (h: ApiTimeOff, day: Date, wd: Weekday) => {
      const dateHit = h.date && new Date(h.date).toDateString() === day.toDateString();
      const rangeHit = h.start_date && h.end_date && new Date(h.start_date) <= day && new Date(h.end_date) >= day;
      const weeklyHit = h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(wd);
      return dateHit || rangeHit || weeklyHit;
    };
    const windowStartM = toMinutes(effectiveHours.start);
    const windowEndM = toMinutes(effectiveHours.end);
    return (t: ApiTherapy) => {
      for (const { date, wd } of inclusiveDays) {
        if (!daysPref.includes(wd)) continue;
        const centerBlocked = timeOffs.some((h) => h.entity_type === 'center' && hits(h, date, wd));
        if (centerBlocked) continue;
        const therapyBlocked = timeOffs.some((h) => h.entity_type === 'therapy' && String(h.entity_id) === String(t.id) && hits(h, date, wd));
        if (therapyBlocked) continue;
        const okAnyRoom = (rooms || []).some((r) => {
          const amenOk = (t.required_amenities || []).every((a: string) => (r.amenities || []).includes(a));
          if (!amenOk) return false;
          const rDay = (r.weekly_schedule || {})[wd] || defaultBusinessDay;
          const s = toMinutes(rDay.start);
          const e = toMinutes(rDay.end);
          const interStart = Math.max(windowStartM, s);
          const interEnd = Math.min(windowEndM, e);
          return interEnd - interStart >= (t.duration_minutes || 60);
        });
        if (okAnyRoom) return true;
      }
      return false;
    };
  }, [formData.startDate, formData.endDate, formData.preferredDays, effectiveHours.start, effectiveHours.end, rooms, timeOffs, defaultBusinessDay, weekdayNames]);
  const handleAssign = async () => {
    setIsProcessing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const payload = {
        patient_id: formData.patientId,
        therapy_id: formData.therapyId,
        total_sessions: Number(formData.totalSessions),
        preferred_days: formData.preferredDays,
        preferred_time_range: { start: formData.preferredTimeStart, end: formData.preferredTimeEnd },
        start_date: formData.startDate,
        end_date: formData.endDate,
        preview_only: true,
        preferred_staff_id: formData.preferredStaffId || undefined,
        now: new Date().toISOString(),
      };
      const minAllowed = toMinutes(effectiveHours.start);
      const maxAllowed = toMinutes(effectiveHours.end);
      if (toMinutes(formData.preferredTimeStart) < minAllowed || toMinutes(formData.preferredTimeEnd) > maxAllowed) {
        toast.error(`Please select time within business hours (${effectiveHours.start}–${effectiveHours.end})`);
        clearTimeout(timeout);
        setIsProcessing(false);
        return;
      }
      let res = await fetch(`${API_BASE}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      let data: { success: boolean; appointments?: { scheduled_date: string; start_time: string; room_id: string; staff_id: string }[]; suggestions?: { scheduled_date: string; start_time: string; room_id: string; staff_id: string }[]; conflicts?: { reason?: string; details?: Record<string, unknown> } } = { success: false };
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          toast.error(text ? `Auto-assign failed: ${text.slice(0,120)}` : 'Auto-assign failed');
        }
      }
      setConflictReason(data?.conflicts?.reason || null);
      try {
        setConflictDetails(data?.conflicts?.details ?? null);
      } catch { setConflictDetails(null); }
      if (!res.ok) {
        try {
          const err = await res.clone().json() as { conflicts?: { reason?: string } };
          toast.error(err?.conflicts?.reason ? `Auto-assign failed: ${err.conflicts.reason}` : "Auto-assign failed");
        } catch {
          // already handled above for non-JSON
        }
        // Continue to process any suggestions returned with a conflict
      }
      if ((data.suggestions || []).length === 0 && formData.preferredStaffId) {
        setPreferredFallbackUsed(false);
        try {
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 12000);
          const payload2 = { ...payload, preferred_staff_id: undefined };
          res = await fetch(`${API_BASE}/appointments`, { method: "POST", headers: { "Content-Type": "application/json", ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload2), signal: controller2.signal });
          clearTimeout(timeout2);
          const ct2 = res.headers.get('content-type') || '';
          if (ct2.includes('application/json')) {
            data = await res.json();
          } else {
            const text2 = await res.text();
            if (!res.ok) {
              toast.error(text2 ? `Auto-assign failed: ${text2.slice(0,120)}` : 'Auto-assign failed');
            }
          }
          setConflictReason(data?.conflicts?.reason || null);
          try {
            setConflictDetails(data?.conflicts?.details ?? null);
          } catch { setConflictDetails(null); }
          setPreferredFallbackUsed((data.suggestions || []).length > 0);
        } catch {
          setPreferredFallbackUsed(false);
        }
      }
      const selectedTherapy = therapies.find((t) => t.id === formData.therapyId);
      const selectedPatient = patients.find((p) => p.id === formData.patientId);
      const appts = (data.appointments || []).map((a) => {
        const d = new Date(a.scheduled_date);
        const dateStr = d.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
        return {
          date: dateStr,
          time: a.start_time,
          room: roomMap[a.room_id] || a.room_id || "",
          staff: staffMap[a.staff_id] || a.staff_id || "",
          therapy: selectedTherapy?.name,
          patient: selectedPatient?.name,
        };
      });
      setAssignmentResult({ success: data.success, appointments: appts });
      const suggRaw = (data.suggestions || []).slice(0,3).map((s) => ({
        date: toLocalDateStr(new Date(s.scheduled_date)),
        time: s.start_time,
        room_id: s.room_id,
        staff_id: s.staff_id,
        room: roomMap[s.room_id] || s.room_id,
        staff: staffMap[s.staff_id] || s.staff_id,
      }));
      const now = new Date();
      const today = toLocalDateStr(now);
      const nowMin = now.getHours()*60 + now.getMinutes();
      const sugg = suggRaw.filter((x) => {
        if (x.date !== today) return true;
        const [hh,mm] = x.time.split(':').map(Number);
        const m = hh*60+mm;
        return m >= nowMin;
      }).filter((x) => {
        const evs = eventsByDate.get(x.date) || [];
        const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
        const sM = toMin(x.time);
        const endM = sM + (selectedTherapy?.duration_minutes || 60);
        const conflictAll = evs.some(e => (e as any).patients_scope === 'all' && Math.max(sM, toMin(e.start_time)) < Math.min(endM, toMin(e.end_time)));
        if (conflictAll) return false;
        const conflictRoom = evs.some(e => e.room_id && String(e.room_id) === String(x.room_id) && Math.max(sM, toMin(e.start_time)) < Math.min(endM, toMin(e.end_time)));
        if (conflictRoom) return false;
        const conflictStaffDirect = evs.some(e => e.staff_id && String(e.staff_id) === String(x.staff_id) && Math.max(sM, toMin(e.start_time)) < Math.min(endM, toMin(e.end_time)));
        if (conflictStaffDirect) return false;
        const conflictStaffScope = evs.some(e => ((e as any).staff_scope === 'all' || (Array.isArray((e as any).staff_ids) && (e as any).staff_ids.includes(String(x.staff_id)))) && Math.max(sM, toMin(e.start_time)) < Math.min(endM, toMin(e.end_time)));
        if (conflictStaffScope) return false;
        return true;
      });
      setSuggestions(sugg);
      setAssignedDates((data.appointments || []).map((a: { scheduled_date: string }) => toLocalDateStr(new Date(a.scheduled_date))));
    } catch (e) {
      if ((e as unknown as { name?: string }).name === 'AbortError') {
        toast.error("Auto-assign timed out");
      } else {
        const msg = (e as unknown as { message?: string }).message || '';
        toast.error(msg ? `Unexpected error during auto-assign: ${msg}` : "Unexpected error during auto-assign");
      }
      setAssignmentResult({ success: false, appointments: [] });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setFormData({
      patientId: "",
      therapyId: "",
      totalSessions: "1",
      preferredDays: [],
      preferredTimeStart: "09:00",
      preferredTimeEnd: "18:00",
      startDate: toLocalDateStr(new Date()),
      endDate: toLocalDateStr(new Date()),
      preferredStaffId: "",
    });
    setAssignmentResult(null);
    setSuggestions([]);
    setSelectedSuggestionIdx(null);
    setAssignedDates([]);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (selectedSuggestionIdx !== null) {
      confirmSelected();
    } else {
      toast.error("Select a suggested slot to confirm");
    }
  };

  const confirmSelected = async () => {
    if (selectedSuggestionIdx === null) return;
    const sel = suggestions[selectedSuggestionIdx];
    const selectedTherapy = therapies.find((t) => t.id === formData.therapyId);
      const addMinutes = (time: string, mins: number) => {
        const [h, m] = time.split(':').map(Number);
        const total = h * 60 + m + mins;
        const hh = String(Math.floor(total / 60)).padStart(2, '0');
        const mm = String(total % 60).padStart(2, '0');
        return `${hh}:${mm}`;
      };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const payload = {
        patient_id: formData.patientId,
        therapy_id: formData.therapyId,
        total_sessions: Number(formData.totalSessions),
        preferred_days: formData.preferredDays,
        preferred_time_range: { start: sel.time, end: addMinutes(sel.time, (selectedTherapy?.duration_minutes || 60)) },
        start_date: sel.date,
        end_date: toLocalDateStr(new Date(new Date(sel.date).getTime() + (Math.max(1, Number(formData.totalSessions) - 1)) * 24 * 60 * 60 * 1000)),
        preferred_room_id: sel.room_id,
        preferred_staff_id: sel.staff_id,
        now: new Date().toISOString(),
      };
      const res = await fetch(`${API_BASE}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      let data: { appointments?: { id?: string; scheduled_date: string }[]; conflicts?: { reason?: string } } = {};
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          toast.error(text ? `Failed: ${text.slice(0,120)}` : 'Failed to confirm selected slot');
          return;
        }
      }
      if (!res.ok) {
        const err = await res.json() as { conflicts?: { reason?: string } };
        toast.error(err?.conflicts?.reason ? `Failed: ${err.conflicts.reason}` : "Failed to confirm selected slot");
        return;
      }
      try {
        const ids = (data.appointments || []).map((a) => a.id).filter(Boolean) as string[];
        await Promise.all(ids.map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify({ status: 'confirmed' }) })));
      } catch (e) { void e; }
      toast.success("Selected slot confirmed");
      setAssignmentResult(null);
      setSuggestions([]);
      if (onAssigned && (data.appointments || []).length > 0) {
        onAssigned((data.appointments || []).map((a) => new Date(a.scheduled_date).toISOString().slice(0,10)));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Unexpected error while confirming");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-3rem)] max-w-[22rem] sm:max-w-md mx-auto rounded-xl max-h-[85vh] overflow-y-auto p-2">
        <DialogHeader>
          <DialogTitle className="text-sm text-center">Auto-Assign Appointment</DialogTitle>
        </DialogHeader>

        <div className="py-1 space-y-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="startDate" className="text-xs shrink-0">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                lang="en-IN"
                value={formData.startDate}
                onClick={(e) => (e.currentTarget as unknown as { showPicker?: () => void }).showPicker?.()}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormData((prev) => ({ ...prev, startDate: v, endDate: v }));
                }}
                className="h-7 text-xs px-1.5 flex-1"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label htmlFor="endDate" className="text-xs shrink-0">End Date</Label>
              <Input
                id="endDate"
                type="date"
                lang="en-IN"
                value={formData.endDate}
                min={formData.startDate}
                onClick={(e) => (e.currentTarget as unknown as { showPicker?: () => void }).showPicker?.()}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="h-7 text-xs px-1.5 flex-1"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor="timeStart" className="text-xs shrink-0">Start Time</Label>
                <Input
                  id="timeStart"
                  type="time"
                  value={formData.preferredTimeStart}
                  min={effectiveHours.start}
                  max={effectiveHours.end}
                  onChange={(e) => {
                    const v = e.target.value;
                    const clampedStart = toTimeString(Math.max(toMinutes(effectiveHours.start), Math.min(toMinutes(v), toMinutes(effectiveHours.end))));
                    const endCandidateMins = toMinutes(clampedStart) + 180;
                    const clampedEnd = toTimeString(Math.min(endCandidateMins, toMinutes(effectiveHours.end)));
                    setFormData({ ...formData, preferredTimeStart: clampedStart, preferredTimeEnd: clampedEnd });
                  }}
                  className="h-7 text-xs px-1.5 flex-1"
                />
              </div>
              <div className="flex items-center gap-1">
                <Label htmlFor="timeEnd" className="text-xs shrink-0">End Time</Label>
                <Input
                  id="timeEnd"
                  type="time"
                  value={formData.preferredTimeEnd}
                  min={effectiveHours.start}
                  max={effectiveHours.end}
                  onChange={(e) => {
                    const v = e.target.value;
                    const clamped = toTimeString(Math.max(toMinutes(formData.preferredTimeStart), Math.min(toMinutes(v), toMinutes(effectiveHours.end))));
                    setFormData({ ...formData, preferredTimeEnd: clamped });
                  }}
                  className="h-7 text-xs px-1.5 flex-1"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preferred Days (Optional)</Label>
              <Button variant="outline" className="h-7 text-xs justify-between w-full" onClick={() => setDaysPickerOpen(true)}>
                <span>
                  {formData.preferredDays.length === 0 ? 'Any day' : formData.preferredDays.map((d) => (
                    d === 'monday' ? 'Mon' : d === 'tuesday' ? 'Tue' : d === 'wednesday' ? 'Wed' : d === 'thursday' ? 'Thu' : d === 'friday' ? 'Fri' : d === 'saturday' ? 'Sat' : 'Sun'
                  )).join(', ')}
                </span>
              </Button>
              <CommandDialog open={daysPickerOpen} onOpenChange={setDaysPickerOpen}>
                <CommandInput placeholder="Select preferred days" />
                <CommandList>
                  <CommandGroup heading="Days">
                    {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((day) => (
                      <CommandItem
                        key={day}
                        onSelect={() => {
                          setFormData((prev) => {
                            const next = new Set(prev.preferredDays);
                            if (next.has(day)) next.delete(day); else next.add(day);
                            return { ...prev, preferredDays: Array.from(next) };
                          });
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Checkbox checked={formData.preferredDays.includes(day)} className="mt-0" />
                          <span className="text-xs">
                            {day === 'monday' ? 'Mon' : day === 'tuesday' ? 'Tue' : day === 'wednesday' ? 'Wed' : day === 'thursday' ? 'Thu' : day === 'friday' ? 'Fri' : day === 'saturday' ? 'Sat' : 'Sun'}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </CommandDialog>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">Patient</Label>
              <Button
                variant="outline"
                className="h-7 text-xs justify-between flex-1"
                onClick={() => setPatientPickerOpen(true)}
              >
                <span>{selectedPatient ? `${selectedPatient.name}${selectedPatient.gender ? ` (${selectedPatient.gender === 'male' ? 'm' : selectedPatient.gender === 'female' ? 'f' : 'o'})` : ''}` : "Select patient"}</span>
              </Button>
              <CommandDialog open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                <CommandInput placeholder="Search patient" />
                <CommandList>
                  <CommandEmpty>No patients found</CommandEmpty>
                  <CommandGroup heading="Patients">
                    {[...patients.filter((p) => {
                      const sDay = new Date(formData.startDate);
                      const eDay = new Date(formData.endDate);
                      const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
                      const pf = p.available_from ? dayOnly(new Date(p.available_from)) : null;
                      const pt = p.available_to ? dayOnly(new Date(p.available_to)) : null;
                      if (pf && dayOnly(sDay) < pf) return false;
                      if (pt && dayOnly(eDay) > pt) return false;
                      return true;
                    })].sort((a,b)=>a.name.localeCompare(b.name)).map((patient) => (
                      <CommandItem
                        key={patient.id}
                        onSelect={() => {
                          setFormData({ ...formData, patientId: patient.id });
                          setPatientPickerOpen(false);
                        }}
                      >
                        {`${patient.name} (${patient.gender === 'male' ? 'm' : patient.gender === 'female' ? 'f' : 'o'}) ${patient.phone || ''}`}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </CommandDialog>
            </div>

            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">Therapy</Label>
              <Button
                variant="outline"
                className="h-7 text-xs justify-between flex-1"
                onClick={() => setTherapyPickerOpen(true)}
              >
                <span>{selectedTherapy ? `${selectedTherapy.name} (${selectedTherapy.duration_minutes} min)` : "Select therapy"}</span>
              </Button>
              <CommandDialog open={therapyPickerOpen} onOpenChange={(o) => { setTherapyPickerOpen(o); setTherapyQuery(""); }}>
                <CommandInput placeholder="Search therapy" value={therapyQuery} onValueChange={setTherapyQuery} />
                <CommandList>
                  <CommandEmpty>No therapies found</CommandEmpty>
                  <CommandGroup heading="Therapies">
                    {[...therapiesFiltered.filter(therapyAvailableFilter)].sort((a,b)=>a.name.localeCompare(b.name)).map((therapy) => (
                      <CommandItem
                        key={therapy.id}
                        onSelect={() => {
                          setFormData({ ...formData, therapyId: therapy.id });
                          setTherapyPickerOpen(false);
                        }}
                      >
                        {therapy.name} ({therapy.duration_minutes} min)
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </CommandDialog>
            </div>

            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">Preferred Staff</Label>
              <Button
                variant="outline"
                className="h-7 text-xs justify-between flex-1"
                onClick={() => setStaffPickerOpen(true)}
              >
                <span>{formData.preferredStaffId ? `${selectedPreferredStaff?.name}${selectedPreferredStaff?.gender ? ` (${selectedPreferredStaff.gender === 'male' ? 'm' : selectedPreferredStaff.gender === 'female' ? 'f' : 'o'})` : ''}` : 'None'}</span>
              </Button>
              <CommandDialog open={staffPickerOpen} onOpenChange={setStaffPickerOpen}>
                <CommandInput placeholder="Search staff" />
                <CommandList>
                  <CommandEmpty>No staff found</CommandEmpty>
                  <CommandGroup heading="Staff">
                    <CommandItem
                      key="none"
                      onSelect={() => {
                        setFormData({ ...formData, preferredStaffId: "" });
                        setStaffPickerOpen(false);
                      }}
                    >
                      None
                    </CommandItem>
                    {[...staffFiltered].sort((a,b)=>a.name.localeCompare(b.name)).map((s) => (
                      <CommandItem
                        key={s.id}
                        onSelect={() => {
                          setFormData({ ...formData, preferredStaffId: s.id });
                          setStaffPickerOpen(false);
                        }}
                      >
                        {`${s.name}${s.gender ? ` (${s.gender === 'male' ? 'm' : s.gender === 'female' ? 'f' : 'o'})` : ''}`}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </CommandDialog>
            </div>

            <div className="flex items-center gap-1">
              <Label htmlFor="sessions" className="text-xs shrink-0">Total Sessions</Label>
              <Input
                id="sessions"
                type="number"
                min="1"
                max="30"
                value={formData.totalSessions}
                onChange={(e) => setFormData({ ...formData, totalSessions: e.target.value })}
                className="h-7 text-xs px-1.5 w-20"
              />
            </div>
          </div>

          

          <div className="space-y-2">
            {isProcessing ? (
              <div className="text-center py-4 space-y-2">
                <Clock className="w-10 h-10 text-primary mx-auto animate-pulse" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Finding optimal schedule...</p>
                  <p className="text-xs text-muted-foreground">Matching staff, rooms, and time slots</p>
                </div>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <p className="text-sm font-semibold">{`${suggestions.length} suggested slot${suggestions.length > 1 ? 's' : ''} found`}</p>
                </div>
                {preferredFallbackUsed && (
                  <div className="text-[11px] text-muted-foreground">
                    Preferred staff not available; showing alternate staff
                  </div>
                )}
                <div className="space-y-2">
                  {suggestions.map((s, idx) => (
                    <div key={idx} className={`p-2 rounded-md border ${selectedSuggestionIdx === idx ? 'border-primary' : 'border-border'} cursor-pointer`} onClick={() => setSelectedSuggestionIdx(idx)}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-success">{s.time}</span>
                        <span className="font-semibold text-xs">Option {idx + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div><span className="text-muted-foreground">Date:</span> {new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div><span className="text-muted-foreground">Staff:</span> {(() => { const st = staff.find((x) => x.id === s.staff_id); const g = st?.gender === 'male' ? 'm' : st?.gender === 'female' ? 'f' : st?.gender ? 'o' : ''; return `${s.staff}${g ? ` (${g})` : ''}`; })()}</div>
                        <div><span className="text-muted-foreground">Room:</span> {s.room}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : assignmentResult ? (
              <div className="p-2 rounded-md bg-muted/50">
                <div className="flex items-start gap-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">
                      {(() => {
                        switch (conflictReason) {
                          case 'CENTER_HOLIDAY': return 'Center holiday blocks all bookings for selected day';
                          case 'NO_ROOM_AVAILABLE': return 'No room meets therapy amenities within selected window';
                          case 'NO_STAFF_AVAILABLE': return selectedTherapy?.requires_gender_match && selectedPatient?.gender ? `No ${selectedPatient.gender} staff available in selected window` : 'No staff available in selected window';
                          case 'WINDOW_TOO_NARROW': return 'Time window too short for therapy duration';
                          case 'OUT_OF_RANGE': return 'Selected date outside patient availability';
                          case 'SCHEDULER_TIMEOUT': return 'Scheduling timed out — please try again';
                          case 'DB_TIMEOUT': return 'System busy — please retry shortly';
                          case 'SCHEDULER_ERROR': return 'Unexpected scheduling error';
                          default: return 'No slots available in the chosen window';
                        }
                      })()}
                    </p>
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      <p>
                        {(() => {
                          const tips: string[] = [];
                          if (conflictReason === 'CENTER_HOLIDAY') {
                            tips.push('Adjust center holiday in Time Off');
                          } else {
                            tips.push('Widen time range or change preferred days');
                            if (formData.preferredStaffId) tips.push('Remove preferred staff to consider alternatives');
                            if (selectedTherapy?.requires_gender_match && !selectedPatient?.gender) tips.push('Set patient gender for gender-matched therapies');
                            if (conflictDetails && (conflictDetails as { same_day_guard_applied?: boolean }).same_day_guard_applied) {
                              tips.push('Pick a later date or widen date range');
                            }
                          }
                          return tips.join(' • ');
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-1">
          {!assignmentResult && !isProcessing && (
          <Button onClick={() => {
            if (!formData.patientId || !formData.therapyId) {
              toast.error("Please select both patient and therapy");
              return;
            }
            if (new Date(formData.endDate) < new Date(formData.startDate)) {
              toast.error("End date cannot be before start date");
              return;
            }
            handleAssign();
          }} size="sm" className="h-8 text-xs px-3 min-w-[9rem]">
              <Sparkles className="w-4 h-4 mr-2" />
              Auto-Assign
            </Button>
          )}
          {suggestions.length > 0 && !isProcessing && (
            <Button onClick={handleConfirm} size="sm" className="h-8 text-xs px-3 min-w-[9rem]">
              <CheckCircle className="w-4 h-4 mr-2" />
              {selectedSuggestionIdx !== null ? 'Confirm Selected Slot' : 'Confirm Appointments'}
            </Button>
          )}
          {assignmentResult && !isProcessing && (
            <Button
              variant="outline"
              onClick={() => {
                if (!formData.patientId || !formData.therapyId) {
                  toast.error("Please select both patient and therapy");
                  return;
                }
                if (new Date(formData.endDate) < new Date(formData.startDate)) {
                  toast.error("End date cannot be before start date");
                  return;
                }
                handleAssign();
              }}
              size="sm"
              className="h-8 text-xs px-3 min-w-[9rem]"
            >
              Re-run Assignment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
