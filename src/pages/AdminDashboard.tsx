import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { BottomBar, SCREENS } from "@/components/BottomBar";
import { AutoAssignDialog } from "@/components/AutoAssignDialog";
import { VerifyDialog } from "@/components/VerifyDialog";
import { AppointmentDialog } from "@/components/AppointmentDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStaffScreen } from "./tabs/StaffTab";
import { useRoomsScreen } from "./tabs/RoomsTab";
import { useTherapiesScreen } from "./tabs/TherapiesTab";
import { useTimeOffScreen } from "./tabs/TimeOffTab";
import { useEventsScreen } from "./tabs/EventsTab";
import { useDietScreen } from "./tabs/DietTab";
import { usePatientsScreen } from "./tabs/PatientsTab";
import { useScheduleScreen } from "./tabs/ScheduleTab";
import Settings from "./Settings";
import { API_BASE } from "@/lib/apiBase";
import { useCentreName } from "@/lib/centreName";
import { fetchJsonWithTimeout, API_TOKEN, type ApiAppointment, type ApiProgramEvent, type Patient, type UiRoom, type UiStaff, type UiTherapy, type UiTimeOff } from "./tabs/shared";

/** Builds the schedule's time rows from the centre's opening hours. */
const buildTimeSlots = (openingTime: string, closingTime: string, slotMinutes: number) => {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(openingTime);
  const end = toMin(closingTime);
  const step = slotMinutes > 0 ? slotMinutes : 30;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => {
    const mins = start + i * step;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  });
};
const useServerHealth = (base: string) => {
  const [serverOk, setServerOk] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const ping = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${base}/health`, { cache: "no-store", signal: controller.signal });
        let ok = res.ok;
        const j = await res.clone().json().catch(() => null as unknown);
        ok = j ? !!(j as { ok?: boolean }).ok : ok;
        if (!cancel) setServerOk(ok);
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        if (!cancel) setServerOk(false);
      } finally {
        clearTimeout(timer);
      }
    };
    ping();
    const intervalMs = serverOk ? 240000 : 15000;
    const id = setInterval(ping, intervalMs);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [base, serverOk]);

  return { serverOk, isOnline };
};

type AppointmentDetailed = { id: number; time: string; patient: string; therapy: string; staff: string; room: string } & {
  roomAmenities?: string[];
  patientDetails?: {
    id: string;
    name: string;
    phone: string;
    email: string;
    gender: string;
    dob: string;
    emergencyContact: string;
    emergencyPhone: string;
    address: string;
    medicalNotes: string;
    dietPlan: string;
  };
};

type ApiTherapy = { id: string; name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean; staff_required?: number };
type ApiStaff = { id: string; name: string; gender: "male" | "female" | "other"; specializations: string[]; phone?: string };
type ApiRoom = { id: string; name: string; amenities: string[]; is_active: boolean };
type ApiPatient = { id: string; name: string; gender: "male" | "female" | "other"; phone?: string; email?: string | null; emergency_contact?: string | null; emergency_phone?: string | null; medical_notes?: string | null; diet_plan?: string | null; Stays?: { start_date: string; end_date: string }[] };
const AdminDashboard = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  // Opening hours drive the schedule's time rows. Defaults match the old
  // hardcoded 09:00-18:00 grid so the page renders before settings arrive.
  const [centreHours, setCentreHours] = useState({ opening_time: "09:00", closing_time: "18:00", slot_minutes: 30, timezone: "Asia/Kolkata" });
  const timeSlots = useMemo(
    () => buildTimeSlots(centreHours.opening_time, centreHours.closing_time, centreHours.slot_minutes),
    [centreHours],
  );
  useEffect(() => {
    fetch(`${API_BASE}/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.opening_time && s?.closing_time) {
          setCentreHours({ opening_time: s.opening_time, closing_time: s.closing_time, slot_minutes: s.slot_minutes ?? 30, timezone: s.timezone || "Asia/Kolkata" });
        }
      })
      .catch(() => { /* falls back to the defaults above */ });
  }, []);
  const [activeTab, setActiveTab] = useState("schedule");
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentDetailed | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'staff'|'room'|'therapy'|'patient'|'timeoff'|'appointment'; id: string; name?: string; counts?: Record<string, number> } | null>(null);

  const TAB_ORDER = SCREENS.map(([key]) => key as string);
  const [staff, setStaff] = useState<UiStaff[]>([]);
  const [roomsList, setRoomsList] = useState<UiRoom[]>([]);
  const [therapies, setTherapies] = useState<UiTherapy[]>([]);
  const [timeOffs, setTimeOffs] = useState<UiTimeOff[]>([]);
  const [events, setEvents] = useState<ApiProgramEvent[]>([]);
  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, ApiAppointment[]>>({});
  const therapyNameById = useMemo(() => Object.fromEntries(therapies.map((t: UiTherapy) => [String(t.id), t.name])), [therapies]);
  const staffNameById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const roomNameById = useMemo(() => Object.fromEntries(roomsList.map((r) => [r.id, r.name])), [roomsList]);
  const patientNameById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p.name])), [patients]);
  const amenityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of roomsList) for (const a of r.amenities) s.add(a);
    for (const t of therapies) for (const a of t.amenities) s.add(a);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [roomsList, therapies]);

  // The centre's timezone, set once in Settings. Never the machine's: an admin
  // on a laptop abroad, or a browser with the wrong clock, must still see the
  // centre's day — the day sheet is printed from it.
  const ADMIN_TZ = centreHours.timezone;
  const ymdInTZ = (date: Date) => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value || String(date.getFullYear());
    const m = parts.find((p) => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
    const d = parts.find((p) => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const t: ApiTherapy[] = await fetchJsonWithTimeout(`${API_BASE}/therapies`);
        setTherapies(t.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1 })));
        const s: (ApiStaff & { is_active?: boolean; status?: string })[] = await fetchJsonWithTimeout(`${API_BASE}/staff`);
        setStaff(s.map((x) => ({ id: x.id, name: x.name, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", specializations: x.specializations.map((id) => t.find((k) => k.id === id)?.name).filter((n): n is string => !!n), phone: x.phone ?? "", schedule: "", status: (typeof x.is_active === 'boolean' ? (x.is_active ? 'Active' : 'Inactive') : (x.status === 'Active' ? 'Active' : 'Inactive')) })));
        const r: ApiRoom[] = await fetchJsonWithTimeout(`${API_BASE}/rooms`);
        setRoomsList(r.map((x) => ({ id: x.id, name: x.name, amenities: x.amenities, schedule: "", status: x.is_active ? "Active" : "Maintenance" })));
        const p: ApiPatient[] = await fetchJsonWithTimeout(`${API_BASE}/patients`);
        setPatients(p.map((x) => ({ id: x.id, name: x.name, phone: x.phone ?? "", email: x.email ?? "", gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", dob: x.date_of_birth ? new Date(x.date_of_birth as unknown as string).toISOString().slice(0,10) : "", emergencyContact: x.emergency_contact ?? "", emergencyPhone: x.emergency_phone ?? "", address: "", medicalNotes: x.medical_notes ?? "", dietPlan: x.diet_plan ?? "", actualStart: x.Stays?.[0]?.start_date || "", actualEnd: x.Stays?.[0]?.end_date || "", preferredStaffId: (x as { preferred_staff_id?: string | null }).preferred_staff_id ?? null, requiresPreferredStaff: !!(x as { requires_preferred_staff?: boolean }).requires_preferred_staff })));
      } catch {
        setTherapies([]);
        setStaff([]);
        setRoomsList([]);
        setPatients([]);
      }
      const monday = new Date(currentDate);
      const day = currentDate.getDay();
      const offset = day === 0 ? -6 : 1 - day;
      monday.setDate(currentDate.getDate() + offset);
      const weekDates: string[] = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return ymdInTZ(d);
      });
      const appts: ApiAppointment[][] = await Promise.all(weekDates.map((d) => fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?date=${d}`)));
      const map: Record<string, ApiAppointment[]> = {};
      weekDates.forEach((d, i) => { map[d] = appts[i]; });
      setAppointmentsByDate(map);
      try {
        type ApiTimeOff = { id?: string; entity_type: 'center'|'staff'|'room'|'therapy'|'patient'; entity_id?: string | null; date?: string | null; start_date?: string | null; end_date?: string | null; start_time?: string | null; end_time?: string | null; recurrence?: 'weekly' | null; weekdays?: string[] | null; description?: string | null };
        const [tOff, hol] = await Promise.all([
          fetchJsonWithTimeout<ApiTimeOff[]>(`${API_BASE}/timeoff`),
          fetchJsonWithTimeout<ApiTimeOff[]>(`${API_BASE}/holidays`),
        ]);
        const list1 = Array.isArray(tOff) ? tOff : [];
        const list2 = Array.isArray(hol) ? hol : [];
        const mergedKeys = new Map<string, ApiTimeOff>();
        [...list1, ...list2].forEach((x) => {
          const key = String(x.id ?? `${x.entity_type}-${x.entity_id ?? 'All'}-${x.date ?? x.start_date ?? ''}-${x.end_date ?? ''}-${x.start_time ?? ''}-${x.end_time ?? ''}`);
          if (!mergedKeys.has(key)) mergedKeys.set(key, x);
        });
        const merged = Array.from(mergedKeys.values());
        setTimeOffs((merged || []).map((x) => ({
          id: x.id,
          date: x.date ? new Date(x.date).toISOString() : undefined,
          startDate: (x.start_date || x.startDate) ? new Date(x.start_date || x.startDate).toISOString() : undefined,
          endDate: (x.end_date || x.endDate) ? new Date(x.end_date || x.endDate).toISOString() : undefined,
          startTime: x.start_time || x.startTime || undefined,
          endTime: x.end_time || x.endTime || undefined,
          recurrence: x.recurrence || undefined,
          weekdays: (x.weekdays || undefined) as UiTimeOff['weekdays'],
          type:
            x.entity_type === "center" ? "Center" :
            x.entity_type === "staff" ? "Staff" :
            x.entity_type === "room" ? "Room" :
            x.entity_type === "therapy" ? "Therapy" : "Patient",
          entity: x.entity_id ?? "All",
          description: x.description ?? "",
        })));
      } catch {
        toast.error("Failed to load time off");
      }
    };
    load();
  }, [currentDate]);

  const refreshAppointmentsForDate = async (iso: string, silent?: boolean) => {
    try {
      const list: ApiAppointment[] = await fetchJsonWithTimeout(`${API_BASE}/appointments?date=${iso}`, 6000);
      setAppointmentsByDate((prev) => ({ ...prev, [iso]: list }));
    } catch {
      if (!silent) toast.error("Failed to refresh appointments");
    }
  };

  const requestDelete = async (kind: 'staff'|'room'|'therapy'|'patient'|'timeoff'|'appointment', id: string, name?: string) => {
    const counts: Record<string, number> = {};
    try {
      if (kind === 'staff') {
        const appts = await fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?staff_id=${id}`);
        const weeklyCount = Object.keys(appointmentsByDate).reduce((sum, k) => {
          const list = Array.isArray(appointmentsByDate[k]) ? appointmentsByDate[k] : [];
          return sum + list.filter((a) => a.staff_id === id).length;
        }, 0);
        counts.appointments = weeklyCount;
        type ApiTimeOffSimple = { entity_type: 'center'|'staff'|'room'|'therapy'|'patient'; entity_id?: string | null };
        const timeoff = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        counts.timeoff = (timeoff || []).filter(x => x.entity_type === 'staff' && x.entity_id === id).length;
      } else if (kind === 'room') {
        const appts = await fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?room_id=${id}`);
        const weeklyCount = Object.keys(appointmentsByDate).reduce((sum, k) => {
          const list = Array.isArray(appointmentsByDate[k]) ? appointmentsByDate[k] : [];
          return sum + list.filter((a) => a.room_id === id).length;
        }, 0);
        counts.appointments = weeklyCount;
        const timeoff = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        counts.timeoff = (timeoff || []).filter(x => x.entity_type === 'room' && x.entity_id === id).length;
      } else if (kind === 'therapy') {
        const appts = await fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?therapy_id=${id}`);
        const weeklyCount = Object.keys(appointmentsByDate).reduce((sum, k) => {
          const list = Array.isArray(appointmentsByDate[k]) ? appointmentsByDate[k] : [];
          return sum + list.filter((a) => String(a.therapy_id) === String(id)).length;
        }, 0);
        counts.appointments = weeklyCount;
        const timeoff = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        counts.timeoff = (timeoff || []).filter(x => x.entity_type === 'therapy' && x.entity_id === id).length;
      } else if (kind === 'patient') {
        const appts = await fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?patient_id=${id}`);
        const weeklyCount = Object.keys(appointmentsByDate).reduce((sum, k) => {
          const list = Array.isArray(appointmentsByDate[k]) ? appointmentsByDate[k] : [];
          return sum + list.filter((a) => a.patient_id === id).length;
        }, 0);
        counts.appointments = weeklyCount;
        type ApiDietPlanSimple = { id: string }[];
        const diet = await fetchJsonWithTimeout<ApiDietPlanSimple>(`${API_BASE}/dietplans?patient_id=${id}`);
        counts.dietplans = diet.length;
        const timeoff = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        counts.timeoff = (timeoff || []).filter(x => x.entity_type === 'patient' && x.entity_id === id).length;
      }
      } catch { return; }
    setConfirmDelete({ kind, id, name, counts });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    try {
      if (kind === 'staff') {
        await fetch(`${API_BASE}/staff/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
        const all = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        await Promise.all((all || []).filter(x => x.entity_type === 'staff' && x.entity_id === id).map(h => fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } })));
        setStaff(prev => prev.filter(s => s.id !== id));
        setTimeOffs(prev => prev.filter(h => !(h.type === 'Staff' && h.entity === id)));
        setAppointmentsByDate(prev => {
          const next: Record<string, ApiAppointment[]> = {};
          for (const [key, list] of Object.entries(prev)) {
            next[key] = (Array.isArray(list) ? list : []).filter((a) => a.staff_id !== id);
          }
          return next;
        });
      } else if (kind === 'room') {
        await fetch(`${API_BASE}/rooms/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
        const all = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        await Promise.all((all || []).filter(x => x.entity_type === 'room' && x.entity_id === id).map(h => fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } })));
        setRoomsList(prev => prev.filter(r => r.id !== id));
        setTimeOffs(prev => prev.filter(h => !(h.type === 'Room' && h.entity === id)));
        setAppointmentsByDate(prev => {
          const next: Record<string, ApiAppointment[]> = {};
          for (const [key, list] of Object.entries(prev)) {
            next[key] = (Array.isArray(list) ? list : []).filter((a) => a.room_id !== id);
          }
          return next;
        });
      } else if (kind === 'therapy') {
        const res = await fetch(`${API_BASE}/therapies/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
        if (!res.ok) {
          let msg = 'Failed to delete therapy';
          try {
            const body = await res.json();
            if (body && body.error) msg = body.error;
    } catch { return; }
          throw new Error(msg);
        }
        const all = await fetchJsonWithTimeout<ApiTimeOffSimple[]>(`${API_BASE}/timeoff`);
        await Promise.all((all || []).filter(x => x.entity_type === 'therapy' && x.entity_id === id).map(h => fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } })));
        setTimeOffs(prev => prev.filter(h => !(h.type === 'Therapy' && h.entity === id)));
        setAppointmentsByDate(prev => {
          const next: Record<string, ApiAppointment[]> = {};
          for (const [key, list] of Object.entries(prev)) {
            next[key] = (Array.isArray(list) ? list : []).filter((a) => String(a.therapy_id) !== String(id));
          }
          return next;
        });
        const t2: ApiTherapy[] = await fetchJsonWithTimeout(`${API_BASE}/therapies`);
        setTherapies(t2.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1 })));
        const s2: (ApiStaff & { is_active?: boolean; status?: string })[] = await fetchJsonWithTimeout(`${API_BASE}/staff`);
        setStaff(s2.map((x) => ({ id: x.id, name: x.name, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", specializations: x.specializations.map((tid) => t2.find((k) => k.id === tid)?.name).filter((n): n is string => !!n), phone: x.phone ?? "", schedule: "", status: (typeof x.is_active === 'boolean' ? (x.is_active ? 'Active' : 'Inactive') : (x.status === 'Active' ? 'Active' : 'Inactive')) })));
      } else if (kind === 'patient') {
        await fetch(`${API_BASE}/patients/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
        setPatients(prev => prev.filter(p => p.id !== id));
        setTimeOffs(prev => prev.filter(h => !(h.type === 'Patient' && h.entity === id)));
        setAppointmentsByDate(prev => {
          const next: Record<string, ApiAppointment[]> = {};
          for (const [key, list] of Object.entries(prev)) {
            next[key] = (Array.isArray(list) ? list : []).filter((a) => a.patient_id !== id);
          }
          return next;
        });
      } else if (kind === 'timeoff') {
        await fetch(`${API_BASE}/timeoff/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
        setTimeOffs(prev => prev.filter(h => h.id !== id));
      }
      toast.success('Deleted');
    } catch (e) {
      const msg = (e as { message?: string }).message || '';
      if (msg && msg.includes('ERR_ABORTED')) {
      } else {
        toast.error('Failed to delete');
      }
    } finally {
      setConfirmDelete(null);
    }
  };

  const todayKey = ymdInTZ(currentDate);

  // What the replan did when a therapist was marked off, in the words the admin
  // would use. It is the only place those moves are reported, so it is dismissed
  // per day rather than switched off: mark someone else off and it comes back.
  type ReplanMove = { patient_name: string; therapy_name: string; tier: 1 | 2 | 3; appointment_id: string; from: { staff_name: string; start_time: string }; to: { staff_id: string | null; staff_name: string; start_time: string; date: string; room_id: string | null } };
  type ReplanBatch = { batch_id: string; staff_name: string; moved: ReplanMove[]; proposed: ReplanMove[]; unplaced: { patient_name: string; therapy_name: string; start_time: string; reason: string }[] };
  const [replans, setReplans] = useState<ReplanBatch[]>([]);
  // The centre's day, not the machine's. The warnings read appointments keyed
  // by the centre's timezone and absences by the machine's local date, which on
  // an evening in Europe is already tomorrow in Asia/Kolkata — a therapist read
  // as absent on a day they are working. Both sides use the centre's day.
  const exceptionDayKey = todayKey;
  const exceptionDay = useMemo(() => new Date(`${todayKey}T00:00:00`), [todayKey]);
  const [replanDismissed, setReplanDismissed] = useState<string[]>([]);
  const [undone, setUndone] = useState<string | null>(null);
  const loadReplans = useCallback(() => {
    fetch(`${API_BASE}/replan/summary?date=${exceptionDayKey}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ReplanBatch[]) => setReplans(Array.isArray(rows) ? rows : []))
      .catch(() => setReplans([]));
  }, [exceptionDayKey]);
  useEffect(() => { loadReplans(); }, [loadReplans]);
  useEffect(() => {
    try { setReplanDismissed(JSON.parse(localStorage.getItem(`replanDismissed:${exceptionDayKey}`) || '[]')); } catch { setReplanDismissed([]); }
  }, [exceptionDayKey]);
  const dismissReplan = (id: string) => {
    const next = [...replanDismissed, id];
    setReplanDismissed(next);
    try { localStorage.setItem(`replanDismissed:${exceptionDayKey}`, JSON.stringify(next)); } catch { /* private window */ }
  };
  const undoReplanBatch = async (batch: ReplanBatch) => {
    const res = await fetch(`${API_BASE}/replan/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batch.batch_id }) });
    if (!res.ok) return;
    const out = await res.json().catch(() => ({ restored: batch.moved.length }));
    setUndone(`Undone: ${batch.staff_name} reinstated, ${out.restored} treatment${out.restored === 1 ? '' : 's'} back as they were.`);
    loadReplans();
    refreshAppointmentsForDate(todayKey, true);
  };
  const visibleReplans = replans.filter((r) => !replanDismissed.includes(r.batch_id));

  // What is wrong with the day comes from the server, which is the same code
  // that refuses a booking. Two screens used to work this out in the browser and
  // both disagreed with it; #88 deleted them.
  type DayProblem = {
    id: string; kind: string; problem_class: 'blocking' | 'worth_knowing'; who: string; what: string;
    appointment_id: string | null; patient_id: string | null; patient_name: string; staff_id: string | null;
    fix: unknown; no_fix_reason: string | null;
  };
  const [dayCheck, setDayCheck] = useState<{ problems: DayProblem[]; headline: string | null }>({ problems: [], headline: null });
  const loadDayCheck = useCallback(() => {
    fetch(`${API_BASE}/day-check?date=${exceptionDayKey}`)
      .then((r) => (r.ok ? r.json() : { problems: [], headline: null }))
      .then((d) => setDayCheck({ problems: Array.isArray(d.problems) ? d.problems : [], headline: d.headline ?? null }))
      .catch(() => setDayCheck({ problems: [], headline: null }));
  }, [exceptionDayKey]);
  useEffect(() => { loadDayCheck(); }, [loadDayCheck, appointmentsByDate]);
  const fixReady = dayCheck.problems.filter((p) => p.problem_class === 'blocking' && p.fix).length;

  const dayKeyMemo = useMemo(() => ymdInTZ(currentDate), [currentDate]);

  const location = useLocation();
  const navigate = useNavigate();
  const centreName = useCentreName();
  useServerHealth(API_BASE);
  useEffect(() => {
    const segs = location.pathname.split('/').filter(Boolean);
    const tabSeg = segs[1] || 'schedule';
    const next = TAB_ORDER.includes(tabSeg as any) ? tabSeg : 'schedule';
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [location.pathname]);
  // Loaded on every tab, not only Events: the headline card counts them too and
  // read 0 until the Events tab had been opened.
  useEffect(() => {
    (async () => {
      try {
        const list = await fetch(`${API_BASE}/program-events`, { cache: 'no-store' }).then(r => r.json());
        setEvents(Array.isArray(list) ? list : []);
      } catch (e) { void e; }
    })();
  }, [activeTab]);

  const go = (v: string) => {
    setActiveTab(v);
    const uname = location.pathname.split('/').filter(Boolean)[0] || (localStorage.getItem('authUser') || 'admin');
    navigate(`/${uname}/${v}`);
    window.scrollTo(0, 0);
  };

  // Each screen keeps its own state and dialogs in its own file (#147).
  const scheduleScreen = useScheduleScreen({ ADMIN_TZ, ymdInTZ, appointmentsByDate, timeSlots, dayKeyMemo, patients, roomsList, staff, therapyNameById, setSelectedAppointment, setShowVerify });
  const staffScreen = useStaffScreen({ staff, setStaff, therapies, isMobile, requestDelete });
  const roomsScreen = useRoomsScreen({ roomsList, setRoomsList, amenityOptions, isMobile, requestDelete });
  const therapiesScreen = useTherapiesScreen({ therapies, setTherapies, amenityOptions, isMobile, requestDelete });
  const timeOffScreen = useTimeOffScreen({ timeOffs, setTimeOffs, staff, roomsList, therapies, patients, staffNameById, roomNameById, therapyNameById, patientNameById, isMobile, requestDelete, loadReplans, refreshAppointmentsForDate, todayKey });
  const eventsScreen = useEventsScreen({ events, setEvents, roomsList, staff, patients, amenityOptions, isMobile, staffNameById, patientNameById });
  // The Residents screen opens the Diet screen's dialog for one resident.
  const dietOpeners = useRef<{ openFor: (id: string | number) => void } | null>(null);
  const patientsScreen = usePatientsScreen({ patients, setPatients, staff, therapyNameById, timezone: ADMIN_TZ, openDietFor: (id) => dietOpeners.current?.openFor(id) });
  const dietScreen = useDietScreen({ patients, setPatients, therapies, therapyNameById, ymdInTZ, active: activeTab === 'diet' });
  dietOpeners.current = dietScreen;

  // The list screens grow as the admin scrolls to the bottom.
  const listScreens: Record<string, { setVisibleRows: React.Dispatch<React.SetStateAction<number>>; totalRef: React.MutableRefObject<number> }> = {
    staff: staffScreen, rooms: roomsScreen, therapies: therapiesScreen, timeoff: timeOffScreen, events: eventsScreen,
  };
  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
      if (!nearBottom) return;
      const batch = isMobile ? 20 : 40;
      const list = listScreens[activeTab];
      if (list) list.setVisibleRows((prev) => Math.min(prev + batch, list.totalRef.current));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isMobile]);


  return (
    <div className="min-h-screen bg-background overflow-x-clip pb-28">
      {/* Main Content */}
      <div className="container mx-auto px-3 md:px-4 py-3 md:py-6">
        {undone ? (
          <div className="mb-2 rounded-md border bg-card px-3 py-2 text-sm">{undone}</div>
        ) : null}
        {visibleReplans.map((batch) => {
          const needsDecision = batch.proposed.length + batch.unplaced.length;
          return (
            <div key={batch.batch_id} className="mb-2 rounded-md border bg-card px-3 py-2">
              {/* One line and Undo. Everything else about the day — what moved,
                  what still needs a decision, giving a whole day away — is
                  Verify's, so the admin has one place to act. */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">
                  {batch.staff_name} is off — {batch.moved.length} rebooked{needsDecision > 0 ? `, ${needsDecision} needs a decision` : ''}
                </span>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => undoReplanBatch(batch)}>Undo</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowVerify(true)}>
                  <AlertCircle className="w-3 h-3 mr-1 text-amber-600" />Fix
                </Button>
                <button type="button" className="text-xs text-muted-foreground ml-auto" onClick={() => dismissReplan(batch.batch_id)}>Done with this</button>
              </div>
            </div>
          );
        })}
        {/* Only what must be fixed. A clear day shows nothing: phone space is
            short, and notes (a resident with nothing booked) live in Verify. */}
        {dayCheck.headline ? (
          <div className="mb-3 md:mb-6 rounded-md border bg-card px-3 py-2">
            {/* The worst problem by name, with the residents in it: a count tells
               the admin to open something, a name tells them what happened. */}
            <div className="flex flex-wrap items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold">{dayCheck.headline}</p>
              {/* Says what tapping gets you: the plan is ready, Accept all applies it. */}
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowVerify(true)}>
                {fixReady ? `Fix · ${fixReady} ready` : 'Fix'}
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab !== 'schedule' ? (
          <button type="button" className="mb-2 h-11 text-base font-semibold text-primary" onClick={() => go('schedule')}>‹ The day</button>
        ) : null}
        <Tabs value={activeTab} onValueChange={go} className="space-y-6">
          <TabsContent value="schedule" className="space-y-6">
            {scheduleScreen.tab}
          </TabsContent>

          {eventsScreen.dialogs}

    {dietScreen.dialogs}

          {/* Staff Tab */}
          <TabsContent value="staff" data-testid="tabpanel-staff">
            {staffScreen.tab}
          </TabsContent>

          {/* Rooms Tab */}
          <TabsContent value="rooms" data-testid="tabpanel-rooms">
            {roomsScreen.tab}
          </TabsContent>

          {/* Therapies Tab */}
          <TabsContent value="therapies" data-testid="tabpanel-therapies">
            {therapiesScreen.tab}
          </TabsContent>

          <TabsContent value="timeoff" data-testid="tabpanel-timeoff">
            {timeOffScreen.tab}
          </TabsContent>

          <TabsContent value="events" data-testid="tabpanel-events">
            {eventsScreen.tab}
          </TabsContent>

          <TabsContent value="settings" data-testid="tabpanel-settings">
            <Settings />
          </TabsContent>

          <TabsContent value="diet" className="space-y-6" forceMount>
            {dietScreen.tab}
          </TabsContent>

  
  <TabsContent value="patients">
    {patientsScreen.tab}
  </TabsContent>
        </Tabs>
      </div>

      <BottomBar
        centreName={centreName}
        activeTab={activeTab}
        go={go}
        signOut={() => {
          localStorage.removeItem("authRole");
          toast.success("Signed out");
          navigate("/login");
        }}
        day={dayKeyMemo}
        today={ymdInTZ(new Date())}
        now={new Date().toLocaleTimeString("en-GB", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        setDay={(iso) => { const [y, m, d] = iso.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }}
        printing={!!scheduleScreen.pdfLoading}
        print={async () => {
          if (!(await scheduleScreen.printSheet('patient'))) return;
          // Still prints with problems open: the admin may be printing on purpose.
          // It just says so (#134). The rota is a second tap, a fresh gesture, so
          // the phone does not block its tab as a popup.
          const open = dayCheck.problems.filter((p) => p.problem_class === 'blocking').length;
          toast(`Resident sheet printed${open ? ` · ${open} still to fix` : ''}`, {
            action: { label: 'Therapist sheet', onClick: () => scheduleScreen.printSheet('therapist') },
          });
        }}
        book={() => setShowAutoAssign(true)}
      />

      {/* Dialogs */}
      <AutoAssignDialog open={showAutoAssign} onOpenChange={setShowAutoAssign} defaultDateISO={ymdInTZ(currentDate)} onAssigned={async (dates) => {
        const d = dates[0];
        if (d) {
          setCurrentDate(new Date(d));
          for (const iso of dates) {
            await refreshAppointmentsForDate(iso, true);
          }
        }
      }} />
      {/* Verify works out its own dates from currentDate in the browser's
          timezone, so it is handed the centre's day rather than the machine's. */}
      {/* Verify checks the day the schedule is on — no date question, and the
          centre's day rather than the machine's. */}
      <VerifyDialog
        open={showVerify}
        onOpenChange={setShowVerify}
        apiBase={API_BASE}
        currentDate={exceptionDay}
        timezone={ADMIN_TZ}
        staff={staff.filter((s) => s.status === 'Active').map((s) => ({ id: String(s.id), name: s.name }))}
        rooms={roomsList.filter((r) => r.status === 'Active').map((r) => ({ id: String(r.id), name: r.name }))}
        treatments={(Array.isArray(appointmentsByDate[exceptionDayKey]) ? appointmentsByDate[exceptionDayKey] : []).map((a) => ({
          id: String(a.id), start_time: a.start_time, status: a.status || 'pending', notes: a.notes ?? null,
          label: `${patients.find((p) => p.id === a.patient_id)?.name || 'Resident'} — ${therapyNameById[a.therapy_id] || 'Treatment'}`,
        }))}
        openingTime={centreHours.opening_time}
        closingTime={centreHours.closing_time}
        onOpenAppointment={(appointmentId) => {
          const a = (Array.isArray(appointmentsByDate[exceptionDayKey]) ? appointmentsByDate[exceptionDayKey] : []).find((x) => String(x.id) === String(appointmentId));
          if (!a) return;
          const roomInfo = roomsList.find((r) => r.id === a.room_id);
          const patientInfo = patients.find((p) => p.id === a.patient_id);
          setShowVerify(false);
          setSelectedAppointment({
            id: a.id,
            scheduledDate: a.scheduled_date,
            time: a.start_time,
            duration: a.duration_minutes,
            patientId: a.patient_id,
            therapyId: a.therapy_id,
            staffId: a.staff_id,
            roomId: a.room_id,
            patient: patientInfo?.name || a.patient_id,
            therapy: therapyNameById[a.therapy_id] || a.therapy_id,
            staff: staff.find((x) => x.id === a.staff_id)?.name || a.staff_id,
            room: roomInfo?.name || a.room_id,
            roomAmenities: roomInfo?.amenities || [],
            patientDetails: patientInfo,
          });
        }}
        onAssignFor={() => { setShowVerify(false); setShowAutoAssign(true); }}
        onJumpToDate={(iso) => { setCurrentDate(new Date(`${iso}T00:00:00`)); refreshAppointmentsForDate(iso, true); }}
        onRefresh={async (datesISO) => {
          for (const iso of datesISO) {
            await refreshAppointmentsForDate(iso, true);
          }
          loadDayCheck();
          loadReplans();
        }}
      />
      <AppointmentDialog 
        appointment={selectedAppointment} 
        open={!!selectedAppointment} 
        onOpenChange={(open) => !open && setSelectedAppointment(null)}
        onOpenAssign={() => setShowAutoAssign(true)}
        onChanged={async () => {
      const iso = ymdInTZ(currentDate);
          await refreshAppointmentsForDate(iso, true);
        }}
      />
      {patientsScreen.dialogs}
      {staffScreen.dialogs}

      {roomsScreen.dialogs}

      {therapiesScreen.dialogs}

      {timeOffScreen.dialogs}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-sm p-3">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Confirm Delete</div>
            {confirmDelete && (
              <div className="text-xs text-muted-foreground">
                <div>Type: {confirmDelete.kind}</div>
                {confirmDelete.name ? <div>Name: {confirmDelete.name}</div> : null}
                {typeof confirmDelete.counts?.appointments === 'number' ? (
                  <div className="mt-1">Affected appointments to be deleted: {confirmDelete.counts.appointments}</div>
                ) : null}
                {confirmDelete.counts ? (
                  <div className="mt-1">
                    {Object.entries(confirmDelete.counts).filter(([k]) => k !== 'appointments').map(([k,v]) => (
                      <div key={k}>{k}: {v}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex items-center justify-end mt-2">
              <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={executeDelete}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default AdminDashboard;
