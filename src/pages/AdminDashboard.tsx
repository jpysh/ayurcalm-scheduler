import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTrial } from "@/lib/centreName";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { BottomBar, WeekStrip, SCREENS } from "@/components/BottomBar";
import { GuestRooms } from "@/components/GuestRooms";
import { TeamRooms } from "@/components/TeamRooms";
import { LogScreen } from "@/components/LogScreen";
import { AttentionSheet, type DayProblem, type ReplanBatch } from "@/components/AttentionSheet";
import { useStaffScreen } from "./tabs/StaffTab";
import { useRoomsScreen } from "./tabs/RoomsTab";
import { useTherapiesScreen } from "./tabs/TherapiesTab";
import { useTimeOffScreen } from "./tabs/TimeOffTab";
import { useEventsScreen } from "./tabs/EventsTab";
import { useDietScreen } from "./tabs/DietTab";
import { usePatientsScreen } from "./tabs/PatientsTab";
import { useScheduleScreen } from "./tabs/ScheduleTab";
import Settings from "./Settings";
import { RulesSheet } from "@/components/RulesSheet";
import { useAttention, type AttentionItem } from "@/lib/attention";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout, API_TOKEN, type ApiAppointment, type ApiProgramEvent, type Patient, type UiRoom, type UiStaff, type UiTherapy, type UiTimeOff } from "./tabs/shared";
import PageHead, { BackContext } from "@/components/PageHead";
import { BottomSheet } from "@/components/BottomBar";
import { Consequence, dayText, ListGroup, Row, SheetFoot } from "@/components/kit";

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

type ApiTherapy = { id: string; name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean; staff_required?: number; once_per_course?: boolean; is_consultation?: boolean; checklist?: { text: string; required: boolean }[]; vitals?: string[] };
type ApiStaff = { id: string; name: string; gender: "male" | "female" | "other"; specializations: string[]; phone?: string; weekly_schedule?: UiStaff["hours"] };
type ApiRoom = { id: string; name: string; amenities: string[]; is_active: boolean };
type ApiTimeOffSimple = { id?: string; entity_type: 'center'|'staff'|'room'|'therapy'|'patient'; entity_id?: string | null };
type ApiPatient = { id: string; name: string; gender: "male" | "female" | "other"; phone?: string; email?: string | null; emergency_contact?: string | null; emergency_phone?: string | null; date_of_birth?: string | null; medical_notes?: string | null; Stays?: { start_date: string; end_date: string }[] };
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
        // Setup is a gate, not a suggestion (#60): an admin who never finished it goes back to it.
        if (s?.setup_complete === false && localStorage.getItem("authRole") === "Admin") { navigate("/setup"); return; }
        if (s?.opening_time && s?.closing_time) {
          setCentreHours({ opening_time: s.opening_time, closing_time: s.closing_time, slot_minutes: s.slot_minutes ?? 30, timezone: s.timezone || "Asia/Kolkata" });
        }
      })
      .catch(() => { /* falls back to the defaults above */ });
  }, []);
  const [activeTab, setActiveTab] = useState("schedule");
  const [showAttention, setShowAttention] = useState(false);
  // What needs you (#288): the rules and the patient and team items they raise; the rules sheet opens from Settings, the pill and the gear on Patients and Team.
  const attention = useAttention();
  const [rules, setRules] = useState<{ section: "Day" | "Patients" | "Team" | null } | null>(null);
  // A link on another screen to a Settings list ("Edit the list" on a picker).
  const [settingsSheet, setSettingsSheet] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  // Until the first load lands, an empty list means "not yet", not "a new centre" (#220).
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'staff'|'room'|'therapy'|'patient'|'timeoff'|'appointment'; id: string; name?: string; counts?: Record<string, number> } | null>(null);

  const TAB_ORDER = SCREENS.map(([key]) => key as string);
  const [staff, setStaff] = useState<UiStaff[]>([]);
  const [roomsList, setRoomsList] = useState<UiRoom[]>([]);
  const [therapies, setTherapies] = useState<UiTherapy[]>([]);
  const [timeOffs, setTimeOffs] = useState<UiTimeOff[]>([]);
  const [events, setEvents] = useState<ApiProgramEvent[]>([]);
  // An ended trial is read-only (#273 H3): + and Get started say so instead of offering what the server refuses.
  const readOnly = !!useTrial()?.read_only;
  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, ApiAppointment[]>>({});
  const therapyNameById = useMemo(() => Object.fromEntries(therapies.map((t: UiTherapy) => [String(t.id), t.name])), [therapies]);
  const staffNameById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const roomNameById = useMemo(() => Object.fromEntries(roomsList.map((r) => [r.id, r.name])), [roomsList]);
  const moves = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    const at = (iso: string) => m.get(iso) ?? m.set(iso, { in: 0, out: 0 }).get(iso)!;
    for (const p of patients) for (const s of p.stays ?? []) { at(s.start_date.slice(0, 10)).in++; at(s.end_date.slice(0, 10)).out++; }
    return m;
  }, [patients]);
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

  // The bar's search on the Team, Therapies and Events lists: it filters the list on screen.
  const [listQuery, setListQuery] = useState('');
  const [listSearching, setListSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const t: ApiTherapy[] = await fetchJsonWithTimeout(`${API_BASE}/therapies`);
        setTherapies(t.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1, once: !!x.once_per_course, consultation: !!x.is_consultation, checklist: x.checklist || [], vitals: x.vitals || ["bp"] })));
        const s: (ApiStaff & { is_active?: boolean; status?: string; role?: 'therapist' | 'doctor' })[] = await fetchJsonWithTimeout(`${API_BASE}/staff`);
        setStaff(s.map((x) => ({ id: x.id, name: x.name, role: x.role, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", specializations: x.specializations.map((id) => t.find((k) => k.id === id)?.name).filter((n): n is string => !!n), phone: x.phone ?? "", schedule: "", hours: x.weekly_schedule, status: (typeof x.is_active === 'boolean' ? (x.is_active ? 'Active' : 'Inactive') : (x.status === 'Active' ? 'Active' : 'Inactive')) })));
        const r: ApiRoom[] = await fetchJsonWithTimeout(`${API_BASE}/rooms`);
        setRoomsList(r.map((x) => ({ id: x.id, name: x.name, amenities: x.amenities, schedule: "", status: x.is_active ? "Active" : "Maintenance" })));
        const p: ApiPatient[] = await fetchJsonWithTimeout(`${API_BASE}/patients`);
        setPatients(p.map((x) => ({ id: x.id, name: x.name, phone: x.phone ?? "", email: x.email ?? "", gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", dob: x.date_of_birth ? new Date(x.date_of_birth).toISOString().slice(0,10) : "", emergencyContact: x.emergency_contact ?? "", emergencyPhone: x.emergency_phone ?? "", address: (x as { address?: string | null }).address ?? "", country: (x as { country?: string | null }).country ?? "", idNumber: (x as { id_number?: string | null }).id_number ?? "", visaNumber: (x as { visa_number?: string | null }).visa_number ?? "", visaValidUntil: (x as { visa_valid_until?: string | null }).visa_valid_until ?? "", registrationNumber: (x as { registration_number?: string | null }).registration_number ?? "", medicalNotes: x.medical_notes ?? "", actualStart: x.Stays?.[0]?.start_date || "", actualEnd: x.Stays?.[0]?.end_date || "", stays: x.Stays || [], preferredStaffId: (x as { preferred_staff_id?: string | null }).preferred_staff_id ?? null, requiresPreferredStaff: !!(x as { requires_preferred_staff?: boolean }).requires_preferred_staff })));
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
      // One call for the week, not seven: each is a round trip on a hill-station signal (#416).
      const week = await fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?from=${weekDates[0]}&to=${weekDates[6]}`);
      const map: Record<string, ApiAppointment[]> = Object.fromEntries(weekDates.map((d) => [d, []]));
      for (const a of week) map[String(a.scheduled_date).slice(0, 10)]?.push(a);
      setAppointmentsByDate(map);
      setLoaded(true);
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
          startDate: x.start_date ? new Date(x.start_date).toISOString() : undefined,
          endDate: x.end_date ? new Date(x.end_date).toISOString() : undefined,
          startTime: x.start_time || undefined,
          endTime: x.end_time || undefined,
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
        setTherapies(t2.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1, once: !!x.once_per_course, consultation: !!x.is_consultation, checklist: x.checklist || [], vitals: x.vitals || ["bp"] })));
        const s2: (ApiStaff & { is_active?: boolean; status?: string })[] = await fetchJsonWithTimeout(`${API_BASE}/staff`);
        setStaff(s2.map((x) => ({ id: x.id, name: x.name, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", specializations: x.specializations.map((tid) => t2.find((k) => k.id === tid)?.name).filter((n): n is string => !!n), phone: x.phone ?? "", schedule: "", hours: x.weekly_schedule, status: (typeof x.is_active === 'boolean' ? (x.is_active ? 'Active' : 'Inactive') : (x.status === 'Active' ? 'Active' : 'Inactive')) })));
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
  const [replans, setReplans] = useState<ReplanBatch[]>([]);
  // The centre's day, not the machine's. The warnings read appointments keyed
  // by the centre's timezone and absences by the machine's local date, which on
  // an evening in Europe is already tomorrow in Asia/Kolkata — a therapist read
  // as absent on a day they are working. Both sides use the centre's day.
  const exceptionDayKey = todayKey;
  const exceptionDay = useMemo(() => new Date(`${todayKey}T00:00:00`), [todayKey]);
  // Dismissed per day, in this browser: dismiss a note today and it is gone
  // today; mark someone else off and their move shows as new.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const loadReplans = useCallback(() => {
    fetch(`${API_BASE}/replan/summary?date=${exceptionDayKey}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ReplanBatch[]) => setReplans(Array.isArray(rows) ? rows : []))
      .catch(() => setReplans([]));
  }, [exceptionDayKey]);
  useEffect(() => { loadReplans(); }, [loadReplans]);
  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem(`attentionDismissed:${exceptionDayKey}`) || '[]')); } catch { setDismissed([]); }
  }, [exceptionDayKey]);
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(`attentionDismissed:${exceptionDayKey}`, JSON.stringify(next)); } catch { /* private window */ }
  };
  const undoReplanBatch = async (batch: ReplanBatch) => {
    const res = await fetch(`${API_BASE}/replan/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batch.batch_id }) });
    if (!res.ok) return false;
    loadReplans();
    await refreshAppointmentsForDate(todayKey, true);
    return true;
  };
  const visibleReplans = replans.filter((r) => !dismissed.includes(r.batch_id));

  // What is wrong with the day comes from the server, which is the same code
  // that refuses a booking. Two screens used to work this out in the browser and
  // both disagreed with it; #88 deleted them.
  const [dayCheck, setDayCheck] = useState<{ problems: DayProblem[]; headline: string | null; history?: Record<string, string> }>({ problems: [], headline: null });
  const loadDayCheck = useCallback(() => {
    fetch(`${API_BASE}/day-check?date=${exceptionDayKey}`)
      .then((r) => (r.ok ? r.json() : { problems: [], headline: null }))
      .then((d) => setDayCheck({ problems: Array.isArray(d.problems) ? d.problems : [], headline: d.headline ?? null, history: d.history || {} }))
      .catch(() => setDayCheck({ problems: [], headline: null }));
  }, [exceptionDayKey]);
  useEffect(() => { loadDayCheck(); }, [loadDayCheck, appointmentsByDate]);
  // Time off saved on another phone or tab, or on another screen here, leaves the
  // pill and row flags stale: re-read on coming back to the app and after any save (#188).
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') { loadDayCheck(); loadReplans(); } };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    window.addEventListener('timeoff-changed', again);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('timeoff-changed', again);
    };
  }, [loadDayCheck, loadReplans]);
  const fixReady = dayCheck.problems.filter((p) => p.problem_class === 'blocking' && p.fix).length;

  // The centre's timezone arrives after the first draw (#477): the day is read again then.
  const dayKeyMemo = useMemo(() => ymdInTZ(currentDate), [currentDate, ADMIN_TZ]);

  // After closing, the admin is checking tomorrow (#458): its things to fix count
  // too, so a treatment with no therapist does not wait for the morning to be seen.
  const nowHM = new Date().toLocaleTimeString("en-GB", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const realToday = ymdInTZ(new Date());
  const [ty, tm, td] = realToday.split('-').map(Number);
  const tomorrowKey = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
  const evening = dayKeyMemo === realToday && nowHM >= centreHours.closing_time;
  const [tomorrowFix, setTomorrowFix] = useState(0);
  useEffect(() => {
    if (!evening) { setTomorrowFix(0); return; }
    fetch(`${API_BASE}/day-check?date=${tomorrowKey}`)
      .then((r) => (r.ok ? r.json() : { problems: [] }))
      .then((d) => setTomorrowFix((Array.isArray(d.problems) ? d.problems : []).filter((p: DayProblem) => p.problem_class === 'blocking').length))
      .catch(() => setTomorrowFix(0));
  }, [evening, tomorrowKey, dayCheck]);

  const location = useLocation();
  const navigate = useNavigate();
  useServerHealth(API_BASE);
  useEffect(() => {
    const segs = location.pathname.split('/').filter(Boolean);
    const tabSeg = segs[1] || 'schedule';
    const next = TAB_ORDER.includes(tabSeg as any) ? tabSeg : 'schedule';
    if (next !== activeTab) {
      setActiveTab(next);
      // The phone's own back: keep ‹ in step with it.
      setTrail((t) => (t[t.length - 1] === next ? t.slice(0, -1) : t));
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

  // The screens the admin came through, for ‹ (#313). The day clears it.
  const [trail, setTrail] = useState<string[]>([]);
  const go = (v: string, back = false) => {
    if (v !== activeTab && !back) setTrail((t) => (v === 'schedule' ? [] : [...t.slice(-9), activeTab]));
    setActiveTab(v);
    if (v !== 'patients') patientsScreen.setSearching(false);
    setListSearching(false); setListQuery('');
    const uname = location.pathname.split('/').filter(Boolean)[0] || (localStorage.getItem('authUser') || 'admin');
    navigate(`/${uname}/${v}`);
    window.scrollTo(0, 0);
  };

  // Treatments the app moved off an absent therapist, for the list's "Was X's".
  const movedFrom = useMemo(() => Object.fromEntries(visibleReplans.flatMap((b) => b.moved.map((m) => [m.appointment_id, m.from.staff_name]))), [visibleReplans]);
  // The day is read against the clock: a redraw each minute moves the line
  // at now and the bar's time. Nothing is fetched.
  const [, setMinute] = useState(0);
  useEffect(() => { const t = setInterval(() => setMinute((m) => m + 1), 60000); return () => clearInterval(t); }, []);

  // Each screen keeps its own state and dialogs in its own file (#147).
  const scheduleScreen = useScheduleScreen({ ADMIN_TZ, ymdInTZ, appointmentsByDate, dayKeyMemo, patients, roomsList, staff, therapyNameById, closingTime: centreHours.closing_time, refreshDay: (iso: string) => refreshAppointmentsForDate(iso, true), movedFrom, problems: dayCheck.problems, history: dayCheck.history, showDay: (iso: string) => { setCurrentDate(new Date(`${iso}T00:00:00`)); refreshAppointmentsForDate(iso, true); }, openResident: (id: string) => residentOpener.current?.(id), staffCount: staff.length, addTherapist: (a: { gender?: string; therapy_id?: string }) => staffAdder.current?.(a), addPatient: (name: string, arriving: string, done: (p: { id: string; name: string }) => void) => patientAdder.current?.(name, arriving, done) });
  const staffScreen = useStaffScreen({ staff, setStaff, therapies, requestDelete, centre: { opening: centreHours.opening_time, closing: centreHours.closing_time } });
  const roomsScreen = useRoomsScreen({ roomsList, setRoomsList, amenityOptions, requestDelete });
  const therapiesScreen = useTherapiesScreen({ therapies, setTherapies, amenityOptions, requestDelete, q: listQuery });
  const timeOffScreen = useTimeOffScreen({ timeOffs, setTimeOffs, staff, roomsList, therapies, patients, staffNameById, roomNameById, therapyNameById, patientNameById, requestDelete, loadReplans, refreshAppointmentsForDate, todayKey, timeSlots, planDay: (iso) => { go('schedule'); setCurrentDate(new Date(`${iso}T00:00:00`)); refreshAppointmentsForDate(iso, true); setShowAttention(true); } });
  const eventsScreen = useEventsScreen({ events, setEvents, roomsList, staff, staffNameById, q: listQuery });
  // The treatment card opens the resident card, which the Residents screen holds.
  const residentOpener = useRef<((id: string) => void) | null>(null);
  // A booking short of a therapist opens the new-therapist form over the sheet, filled in with what it lacks (#330).
  const staffAdder = useRef<((a: { gender?: string; therapy_id?: string }) => void) | null>(null);
  staffAdder.current = (a) => staffScreen.openAdd({ gender: a.gender === 'male' ? 'Male' : a.gender === 'female' ? 'Female' : undefined, gives: therapies.filter((t) => t.id === a.therapy_id).map((t) => t.name), role: therapies.find((t) => t.id === a.therapy_id)?.consultation ? 'doctor' : undefined });
  const patientAdder = useRef<((name: string, arriving: string, done: (p: { id: string; name: string }) => void) => void) | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const patientsScreen = usePatientsScreen({ needs: attention.items.filter((i) => i.section === 'Patients' && i.kind === 'action' && i.patient_id), patients, setPatients, staff, therapyNameById, timezone: ADMIN_TZ,
    openTreatment: (a) => { go('schedule'); scheduleScreen.openCard(a); },
    // A day on the card books on that day (#350).
    book: (p) => { go('schedule'); if (p?.date) { setCurrentDate(new Date(`${p.date}T00:00:00`)); refreshAppointmentsForDate(p.date, true); } scheduleScreen.openBook(p); },
    // The same words, over every treatment: the day's own search.
    openCatalogue: (which) => { setSettingsSheet(which); go('settings'); },
    openRules: () => setRules({ section: 'Patients' }),
    searchEverything: (q) => { patientsScreen.setSearching(false); patientsScreen.setQuery(''); go('schedule'); scheduleScreen.setQuery(q); scheduleScreen.setSearching(true); } });
  residentOpener.current = patientsScreen.openResident;
  patientAdder.current = (name, arriving, done) => patientsScreen.openAdd({ name, arriving, done });
  // The adaptive + (#285): it adds what the screen is about. A trial that has ended adds nothing and says so.
  const guard = (adds: string, what: string, run: () => void) => ({ adds, run: () => { if (readOnly) { toast(`The free trial has ended, so nothing new can be ${what}. Nothing is deleted.`, { duration: 10000, action: { label: "Choose a plan", onClick: () => go('settings') } }); return; } run(); } });
  const dietScreen = useDietScreen({ active: activeTab === 'diet' });
  const plusFor = activeTab === 'schedule' ? guard('Book a treatment', 'booked', scheduleScreen.openBook)
    : activeTab === 'patients' ? guard('New patient', 'added', patientsScreen.openAdd)
    : activeTab === 'timeoff' ? guard('Add leave', 'added', timeOffScreen.openAdd)
    : activeTab === 'diet' ? guard('New diet plan', 'added', dietScreen.openAdd)
    : activeTab === 'team' ? guard('Add a therapist or doctor', 'added', () => staffScreen.openAdd())
    : activeTab === 'rooms' ? guard('Add a room', 'added', roomsScreen.openAdd)
    : activeTab === 'therapies' ? guard('Add therapy', 'added', therapiesScreen.openAdd)
    : activeTab === 'events' ? guard('Add event', 'added', eventsScreen.openAdd)
    : null;

  // Leave grows as the admin scrolls to the bottom; the other lists are short.
  useEffect(() => {
    if (activeTab !== 'timeoff') return;
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24) timeOffScreen.setVisibleRows((prev) => Math.min(prev + 20, timeOffScreen.totalRef.current));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  const signOut = () => {
    localStorage.removeItem("authRole");
    toast.success("Signed out");
    navigate("/login");
  };

  const cameFrom = trail[trail.length - 1] ?? 'schedule';
  const backTo = activeTab === 'schedule' ? null : {
    label: cameFrom === 'schedule' ? 'Day' : (SCREENS.find(([k]) => k === cameFrom)?.[1] ?? 'Day'),
    run: () => { setTrail((t) => t.slice(0, -1)); go(cameFrom, true); },
  };

  return (
    <BackContext.Provider value={backTo}>
    <div className="min-h-screen bg-background overflow-x-clip pb-28">
      {/* Main Content */}
      {/* The phone design widened on a desktop, never a second layout (#67): one centred column. */}
      {/* No top padding: each screen's own header carries the design's 12–14px (#193). */}
      <div className="mx-auto w-full max-w-xl px-3 pb-3">
        <Tabs value={activeTab} onValueChange={go} className="space-y-6 [&>[role=tabpanel]]:mt-0">
          {/* Swipe the day left and right, as the date sheet says (#67). */}
          <TabsContent value="schedule" className="space-y-6"
            onTouchStart={(e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const s = swipe.current; swipe.current = null;
              if (!s || scheduleScreen.searching) return;
              const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
              if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dx < 0 ? 1 : -1)));
              }
            }}>
            {/* A new centre's first steps, until it can book (#60): each row opens the screen that adds it. */}
            {!loaded || readOnly ? null : therapies.length === 0 || staff.length === 0 || roomsList.length === 0 || patients.length === 0 ? (
              <div aria-label="Get started">
                {/* Therapies first (#273 U1): a new trial has none, and nothing can be booked or given without them. */}
                <ListGroup title="Get started">
                  {([["therapies", "Add your therapies", therapies.length], ["rooms", "Add your rooms", roomsList.length], ["staff", "Add your therapists", staff.length], ["patients", "Add your first patient", patients.length]] as const).map(([tab, label, n]) => (
                    <Row key={tab} title={label} facts={n ? `${n} added` : "Not yet"} trailing={n ? "✓" : "Add ›"}
                      onClick={() => { if (tab === "rooms") { go("rooms"); roomsScreen.openAdd(); } else if (tab === "staff") { go("team"); staffScreen.openAdd(); } else if (tab === "patients") { go("patients"); patientsScreen.openAdd(); } else { go(tab); if (tab === "therapies" && !n) therapiesScreen.openLibrary(); } }} />
                  ))}
                </ListGroup>
                <p className="px-1 pt-2 text-sm text-muted-foreground">Then tap + to book the first treatment.</p>
              </div>
            ) : null}
            {loaded && !scheduleScreen.searching ? <WeekStrip day={dayKeyMemo} today={ymdInTZ(new Date())} moves={moves} setDay={(iso) => { const [y, m, d] = iso.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }} /> : null}
            {loaded && scheduleScreen.tab}
          </TabsContent>

          {eventsScreen.dialogs}

    {dietScreen.dialogs}

          <TabsContent value="guestrooms" data-testid="tabpanel-guestrooms">
            {activeTab === 'guestrooms' ? <GuestRooms today={ymdInTZ(new Date())} openPatient={(id) => patientsScreen.openResident(id)}
              newPatient={(p) => patientsScreen.openAdd(p)} openSettings={() => { setSettingsSheet('accommodation'); go('settings'); }} /> : null}
          </TabsContent>

          <TabsContent value="log" data-testid="tabpanel-log">
            <LogScreen timezone={ADMIN_TZ} refresh={() => refreshAppointmentsForDate(dayKeyMemo, true)} />
          </TabsContent>

          <TabsContent value="team" data-testid="tabpanel-team">
            <TeamRooms kind="team" staff={staff} rooms={roomsList} q={listQuery} today={ymdInTZ(new Date())}
              nowHM={new Date().toLocaleTimeString("en-GB", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              opening={centreHours.opening_time} closing={centreHours.closing_time}
              refresh={() => refreshAppointmentsForDate(ymdInTZ(new Date()), true)}
              openPerson={staffScreen.openEdit} openRoom={roomsScreen.openEdit} openScreen={go} openRules={() => setRules({ section: 'Team' })} />
          </TabsContent>
          <TabsContent value="rooms" data-testid="tabpanel-rooms">
            <TeamRooms kind="rooms" staff={staff} rooms={roomsList} q={listQuery} today={ymdInTZ(new Date())}
              nowHM={new Date().toLocaleTimeString("en-GB", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              opening={centreHours.opening_time} closing={centreHours.closing_time}
              refresh={() => refreshAppointmentsForDate(ymdInTZ(new Date()), true)}
              openPerson={staffScreen.openEdit} openRoom={roomsScreen.openEdit} openScreen={go} openRules={() => setRules({ section: 'Team' })} />
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
            <Settings signOut={signOut} openLog={() => go("log")} initialSheet={settingsSheet} sheetOpened={() => setSettingsSheet(null)}
              attention={attention} openRules={() => setRules({ section: null })} openHolidays={timeOffScreen.openHolidays} />
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
        activeTab={activeTab}
        go={go}
        day={dayKeyMemo}
        today={ymdInTZ(new Date())}
        now={new Date().toLocaleTimeString("en-GB", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        setDay={(iso) => { const [y, m, d] = iso.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }}
        printing={!!scheduleScreen.pdfLoading}
        // After closing on today the evening job is tomorrow's sheet (#459), so Print gives that day and says so.
        printDay={evening ? tomorrowKey : dayKeyMemo}
        print={async () => {
          const iso = evening ? tomorrowKey : dayKeyMemo;
          if (!(await scheduleScreen.printSheet('patient', iso))) return;
          // Still prints with problems open: the admin may be printing on purpose.
          // It just says so (#134). The rota is a second tap, a fresh gesture, so
          // the phone does not block its tab as a popup.
          const open = evening ? tomorrowFix : dayCheck.problems.filter((p) => p.problem_class === 'blocking').length;
          const fixFirst = () => { if (evening) setCurrentDate(new Date(`${tomorrowKey}T00:00:00`)); setShowAttention(true); };
          // The two other sheets under the words, not beside them: two buttons in a row squeezed the text to a word a line (#273 O2).
          const more = "min-h-11 rounded-full px-1 text-base font-bold text-on-dark";
          toast(<div className="w-full">
            <div>Patient sheet for {dayText(iso)} printed{open ? ` · ${open} still to fix` : ''}</div>
            <div className="mt-1 flex flex-wrap gap-x-4">
              {open ? <button type="button" className={more} onClick={fixFirst}>Fix {open} first</button> : null}
              <button type="button" className={more} onClick={() => scheduleScreen.printSheet('therapist', iso)}>Therapist sheet</button>
              <button type="button" className={more} onClick={() => scheduleScreen.printSheet('doctor', iso)}>Doctor sheet</button>
              <button type="button" className={more} onClick={() => scheduleScreen.printSheet('kitchen', iso)}>Kitchen sheet</button>
            </div>
          </div>, { duration: 10000 });
        }}
        plus={plusFor}
        // One search: on Patients it filters that list, anywhere else it searches the day.
        search={['team', 'rooms', 'therapies', 'events'].includes(activeTab)
          ? { query: listQuery, setQuery: setListQuery, on: listSearching, setOn: setListSearching, placeholder: activeTab === 'team' ? 'Search the team' : `Search ${activeTab}`, label: `Search ${activeTab === 'team' ? 'the team' : activeTab}`, start: () => setListSearching(true) }
          : activeTab === 'patients'
          ? { query: patientsScreen.query, setQuery: patientsScreen.setQuery, on: patientsScreen.searching, setOn: patientsScreen.setSearching, placeholder: 'Search patients', label: 'Search patients', start: () => patientsScreen.setSearching(true) }
          : { query: scheduleScreen.query, setQuery: scheduleScreen.setQuery, on: scheduleScreen.searching, setOn: scheduleScreen.setSearching, placeholder: 'Name, therapy or room', label: 'Search', hint: 'Patients, therapists, treatments, any day', start: () => { go('schedule'); scheduleScreen.setSearching(true); } }}
        // A patient with nothing booked is a rest day, not a note (#144).
        attention={{
          fix: dayCheck.problems.filter((p) => p.problem_class === 'blocking').length + tomorrowFix + new Set(attention.items.filter((i) => i.kind === 'action').map((i) => i.patient_id ?? i.id)).size,
          // What the app already fixed for the admin: a therapist's day moved.
          done: visibleReplans.length,
          note: dayCheck.problems.filter((p) => p.problem_class === 'worth_knowing' && p.kind !== 'IDLE_RESIDENT' && !dismissed.includes(p.id)).length,
          // Checked again on opening: a booking made since can have taken the answer's slot.
          open: () => { loadDayCheck(); loadReplans(); attention.reload(); setShowAttention(true); },
        }}
      />

            <AttentionSheet
        open={showAttention}
        onOpenChange={setShowAttention}
        apiBase={API_BASE}
        day={exceptionDayKey}
        today={ymdInTZ(new Date())}
        problems={dayCheck.problems}
        tomorrow={tomorrowFix ? { day: tomorrowKey, count: tomorrowFix, open: () => { const [y, m, d] = tomorrowKey.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); } } : null}
        replans={visibleReplans}
        dismissed={dismissed}
        dismiss={dismiss}
        undoReplan={undoReplanBatch}
        items={attention.items}
        openRules={() => setRules({ section: null })}
        addStaff={(a) => staffAdder.current?.(a)}
        onItem={(i: AttentionItem) => {
          setShowAttention(false);
          if (i.action === 'diet') patientsScreen.openMeals({ id: i.patient_id!, name: i.who });
          else patientsScreen.openResident(i.patient_id!);
        }}
        afterConsultation={(p, what) => {
          setShowAttention(false);
          dismiss(p.id);
          if (what === 'diet') patientsScreen.openMeals({ id: p.patient_id!, name: p.patient_name });
          else patientsScreen.openResident(p.patient_id!);
        }}
        onChanged={async () => { await refreshAppointmentsForDate(exceptionDayKey, true); loadDayCheck(); loadReplans(); }}
        seeIt={(id) => {
          setShowAttention(false);
          scheduleScreen.setView('time');
          scheduleScreen.setQuery('');
          // After the sheet has closed and the list has drawn by time.
          setTimeout(() => {
            const row = document.querySelector(`[data-appt="${id}"]`);
            row?.scrollIntoView({ block: 'center' });
            row?.animate?.([{ background: 'hsl(var(--destructive) / 0.12)' }, { background: 'hsl(var(--card))' }], { duration: 1400 });
          }, 350);
        }}
      />
      <RulesSheet open={!!rules} onOpenChange={(o) => { if (!o) setRules(null); }} section={rules?.section} attention={attention} reload={attention.reload} />
      {patientsScreen.dialogs}
      {staffScreen.dialogs}

      {roomsScreen.dialogs}

      {therapiesScreen.dialogs}

      {timeOffScreen.dialogs}
      {/* What a delete takes with it, in words, before it happens (it cannot be undone). */}
      <BottomSheet open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)} title={confirmDelete ? `Delete ${confirmDelete.name || `this ${confirmDelete.kind}`}?` : ''}
        note="This cannot be undone."
        foot={<SheetFoot save={executeDelete} label="Delete" tone="destructive" />}>
        {confirmDelete?.counts ? (
          <Consequence>{[
            confirmDelete.counts.appointments ? `${confirmDelete.counts.appointments} treatment${confirmDelete.counts.appointments === 1 ? '' : 's'} booked will go with it.` : '',
            confirmDelete.counts.timeoff ? `${confirmDelete.counts.timeoff} leave entr${confirmDelete.counts.timeoff === 1 ? 'y' : 'ies'} will go too.` : '',
            confirmDelete.counts.dietplans ? `${confirmDelete.counts.dietplans} diet plan${confirmDelete.counts.dietplans === 1 ? '' : 's'} will go too.` : '',
          ].filter(Boolean).join(' ') || 'Nothing else depends on it.'}</Consequence>
        ) : null}
      </BottomSheet>
    </div>
    </BackContext.Provider>
  );
};
export default AdminDashboard;
