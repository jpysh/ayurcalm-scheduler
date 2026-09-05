import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, Users, Home, CalendarDays, Plus, Edit, Trash2, Activity, AlertCircle, User, StopCircle, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AutoAssignDialog } from "@/components/AutoAssignDialog";
import { VerifyDialog } from "@/components/VerifyDialog";
import { AppointmentDialog } from "@/components/AppointmentDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import StaffTab from "./tabs/StaffTab";
import RoomsTab from "./tabs/RoomsTab";
import TherapiesTab from "./tabs/TherapiesTab";
import TimeOffTab from "./tabs/TimeOffTab";
import EventsTab from "./tabs/EventsTab";
import DietTab from "./tabs/DietTab";
import PatientsTab from "./tabs/PatientsTab";
import ScheduleTab from "./tabs/ScheduleTab";
import Ailments from "./Ailments";
import Settings from "./Settings";
import { API_BASE } from "@/lib/apiBase";

// Mock data
const mockAppointments = [
  { id: 1, time: "09:00", patient: "Sarah Smith", therapy: "Abhyanga Massage", staff: "Dr. Priya", room: "Room 1" },
  { id: 2, time: "10:00", patient: "Mike Johnson", therapy: "Shirodhara", staff: "Dr. Kumar", room: "Room 2" },
  { id: 3, time: "11:00", patient: "Emily Davis", therapy: "Panchakarma", staff: "Dr. Anjali", room: "Room 1" },
  { id: 4, time: "14:00", patient: "David Wilson", therapy: "Nasya Therapy", staff: "Dr. Priya", room: "Room 3" },
];

const mockStaff = [
  { id: 1, name: "Dr. Priya Kumar", gender: "Female", specializations: ["Abhyanga", "Nasya", "Shirodhara"], phone: "+1234567890", schedule: "Mon-Fri: 9AM-5PM" },
  { id: 2, name: "Dr. Raj Patel", gender: "Male", specializations: ["Panchakarma", "Abhyanga"], phone: "+1234567891", schedule: "Mon-Sat: 10AM-6PM" },
  { id: 3, name: "Dr. Anjali Sharma", gender: "Female", specializations: ["Shirodhara", "Panchakarma", "Pizhichil"], phone: "+1234567892", schedule: "Tue-Sat: 9AM-4PM" },
  { id: 4, name: "Dr. Kumar Singh", gender: "Male", specializations: ["Nasya", "Abhyanga", "Udvartana"], phone: "+1234567893", schedule: "Mon-Fri: 11AM-7PM" },
];

const mockRooms = [
  { id: 1, name: "Treatment Room 1", amenities: ["Massage Table", "Shower", "Steam"], schedule: "Mon-Sat: 9AM-6PM", status: "Active" },
  { id: 2, name: "Treatment Room 2", amenities: ["Massage Table", "Shower"], schedule: "Mon-Sat: 9AM-6PM", status: "Active" },
  { id: 3, name: "Ayurvedic Suite", amenities: ["Shirodhara Stand", "Steam", "Shower", "Massage Table"], schedule: "Mon-Fri: 9AM-5PM", status: "Active" },
  { id: 4, name: "Panchakarma Room", amenities: ["Steam", "Shower", "Specialized Equipment"], schedule: "Tue-Sat: 10AM-5PM", status: "Maintenance" },
];

const mockPatientsDetailed = [
  {
    id: "1",
    name: "Sarah Smith",
    phone: "+1111111111",
    email: "sarah@example.com",
    gender: "Female",
    dob: "1968-04-12",
    emergencyContact: "John Smith",
    emergencyPhone: "+1111111112",
    address: "123 Wellness Ave",
    medicalNotes: "Hypertension, mild",
    dietPlan: "Vegetarian, low salt",
    actualStart: "2024-11-01T09:00",
    actualEnd: "2025-03-31T17:00",
  },
  {
    id: "2",
    name: "Mike Johnson",
    phone: "+1222222222",
    email: "mike@example.com",
    gender: "Male",
    dob: "1970-09-05",
    emergencyContact: "Anna Johnson",
    emergencyPhone: "+1222222223",
    address: "456 Harmony Rd",
    medicalNotes: "Type 2 diabetes",
    dietPlan: "Low sugar, balanced",
    actualStart: "2024-10-01T08:00",
    actualEnd: "2025-02-28T12:00",
  },
  {
    id: "3",
    name: "Emily Davis",
    phone: "+1333333333",
    email: "emily@example.com",
    gender: "Female",
    dob: "1980-01-21",
    emergencyContact: "Mark Davis",
    emergencyPhone: "+1333333334",
    address: "789 Tranquil St",
    medicalNotes: "Migraine history",
    dietPlan: "Gluten-free",
    actualStart: "2024-11-10T10:00",
    actualEnd: "2025-01-15T16:00",
  },
  {
    id: "4",
    name: "David Wilson",
    phone: "+1444444444",
    email: "david@example.com",
    gender: "Male",
    dob: "1962-12-02",
    emergencyContact: "Laura Wilson",
    emergencyPhone: "+1444444445",
    address: "321 Calm Blvd",
    medicalNotes: "Arthritis",
    dietPlan: "Anti-inflammatory diet",
    actualStart: "2024-09-15T11:00",
    actualEnd: "2025-04-15T15:00",
  },
];

const mockTherapies = [
  { id: 1, name: "Abhyanga Massage", duration: 60, amenities: ["Massage Table", "Shower"], genderMatch: false },
  { id: 2, name: "Shirodhara", duration: 90, amenities: ["Shirodhara Stand", "Massage Table"], genderMatch: true },
  { id: 3, name: "Panchakarma", duration: 120, amenities: ["Specialized Equipment", "Steam", "Shower"], genderMatch: true },
  { id: 4, name: "Nasya Therapy", duration: 45, amenities: ["Massage Table"], genderMatch: false },
  { id: 5, name: "Pizhichil", duration: 75, amenities: ["Massage Table", "Shower"], genderMatch: true },
];

type UiTimeOff = { id: string; date?: string; startDate?: string; endDate?: string; startTime?: string; endTime?: string; recurrence?: 'weekly'; weekdays?: ('sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday')[]; type: "Center" | "Staff" | "Room" | "Therapy" | "Patient"; entity: string; description: string };

const timeSlots = Array.from({ length: ((18 * 60 - 9 * 60) / 30) + 1 }, (_, i) => {
  const mins = 9 * 60 + i * 30;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});
const fetchJsonWithTimeout = async <T = unknown>(url: string, ms = 6000): Promise<T> => {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try {
      return await attempt();
    } catch {
      return [] as T;
    }
  }
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

type AppointmentDetailed = (typeof mockAppointments)[number] & {
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

type Patient = typeof mockPatientsDetailed[number];
type ApiTherapy = { id: string; name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean };
type ApiStaff = { id: string; name: string; gender: "male" | "female" | "other"; specializations: string[]; phone?: string };
type ApiRoom = { id: string; name: string; amenities: string[]; is_active: boolean };
type ApiPatient = { id: string; name: string; gender: "male" | "female" | "other"; phone?: string; email?: string | null; emergency_contact?: string | null; emergency_phone?: string | null; medical_notes?: string | null; diet_plan?: string | null; available_from?: string | null; available_to?: string | null };
type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string | null; room_id: string | null; scheduled_date: string; start_time: string; duration_minutes: number; status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled' };
type ApiDietPlan = { id: string; patient_id: string; date: string; meal_time: 'breakfast'|'lunch'|'dinner'|'snacks'; description: string; instructions?: string };
type ApiStay = { id: string; patient_id: string; start_date: string; end_date: string; duration_days: number };
type UiStaff = { id: string | number; name: string; gender: "Male" | "Female" | "Other"; specializations: string[]; phone: string; schedule: string; status: "Active" | "Inactive" };
type UiRoom = { id: string | number; name: string; amenities: string[]; schedule: string; status: "Active" | "Maintenance" };
type UiTherapy = { id: string | number; name: string; duration: number; amenities: string[]; genderMatch: boolean };
const AdminDashboard = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("schedule");
  const [viewType, setViewType] = useState<"day" | "week">("day");
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const handleGenerateDailyPdf = async () => {
    setPdfLoading(true);
    try {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;
      const res = await fetch(`${API_BASE}/daily-schedule-pdf?date=${iso}`);
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ayurcalm-daily-schedule-${iso}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentDetailed | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [originalPatient, setOriginalPatient] = useState<Patient | null>(null);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<'name'|'phone'|'email'|'gender'|'diet_plan'|'available_from'|'available_to'>('diet_plan');
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkGender, setBulkGender] = useState<'Male'|'Female'|'Other'>('Male');
  const [editingStaffId, setEditingStaffId] = useState<string | number | null>(null);
  const [originalStaffEntry, setOriginalStaffEntry] = useState<UiStaff | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | number | null>(null);
  const [originalRoomEntry, setOriginalRoomEntry] = useState<UiRoom | null>(null);
  const [editingTherapyId, setEditingTherapyId] = useState<string | number | null>(null);
  const [originalTherapyEntry, setOriginalTherapyEntry] = useState<UiTherapy | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'staff'|'room'|'therapy'|'patient'|'timeoff'|'appointment'; id: string; name?: string; counts?: Record<string, number> } | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [weekCompact, setWeekCompact] = useState(true);
  const [newPatient, setNewPatient] = useState<Patient>({
    id: String(mockPatientsDetailed.length + 1),
    name: "",
    phone: "",
    email: "",
    gender: "Male",
    dob: "",
    emergencyContact: "",
    emergencyPhone: "",
    address: "",
    medicalNotes: "",
    dietPlan: "",
    actualStart: "",
    actualEnd: "",
  });

  const TAB_ORDER = ["schedule", "staff", "rooms", "therapies", "diet", "timeoff", "events", "patients", "ailments", "settings"] as const;
  const prevTab = () => {
    const idx = TAB_ORDER.indexOf(activeTab as typeof TAB_ORDER[number]);
    const nextIdx = Math.max(0, idx - 1);
    setActiveTab(TAB_ORDER[nextIdx]);
  };
  const nextTab = () => {
    const idx = TAB_ORDER.indexOf(activeTab as typeof TAB_ORDER[number]);
    const nextIdx = Math.min(TAB_ORDER.length - 1, idx + 1);
    setActiveTab(TAB_ORDER[nextIdx]);
  };

  const centerActiveTab = (behavior: ScrollBehavior = "smooth") => {
    const el = tabsListRef.current;
    if (!el) return;
    const active = el.querySelector('[data-state="active"]') as HTMLElement | null;
    if (!active) return;
    const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    const max = el.scrollWidth - el.clientWidth;
    const clamped = Math.max(0, Math.min(target, max));
    el.scrollTo({ left: clamped, behavior });
  };
  const [staff, setStaff] = useState<UiStaff[]>([]);
  const [roomsList, setRoomsList] = useState<UiRoom[]>([]);
  const [roomAmenityDrafts, setRoomAmenityDrafts] = useState<Record<string | number, string>>({});
  const [therapyAmenityDrafts, setTherapyAmenityDrafts] = useState<Record<string | number, string>>({});
  const [eventAmenityDrafts, setEventAmenityDrafts] = useState<Record<string | number, string>>({});
  const [newEventAmenityDraft, setNewEventAmenityDraft] = useState<string>("");
  const [therapies, setTherapies] = useState<UiTherapy[]>([]);
  const [timeOffs, setTimeOffs] = useState<UiTimeOff[]>([]);
  type ApiProgramEvent = { id: string; date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string; end_time: string; activity_name: string; room_id?: string | null; staff_id?: string | null; required_amenities?: string[]; notes?: string | null; recurrence?: string | null; weekdays: string[]; audience?: string | null };
  const [events, setEvents] = useState<ApiProgramEvent[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [originalEvent, setOriginalEvent] = useState<ApiProgramEvent | null>(null);
  const [newEvent, setNewEvent] = useState<{ date: string; start_time: string; end_time: string; activity_name: string; room_id: string; staff_id: string; required_amenities: string[]; notes: string; recurrence: string | null; weekdays: string[]; audience: string | null }>({ date: '', start_time: '07:30', end_time: '08:30', activity_name: '', room_id: '', staff_id: '', required_amenities: [], notes: '', recurrence: 'weekly', weekdays: ['monday'], audience: 'all' });
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [holidayTypeFilter, setHolidayTypeFilter] = useState<'all' | 'Center' | 'Staff' | 'Room' | 'Therapy' | 'Patient'>('all');
  const [holidayViewMode, setHolidayViewMode] = useState<'all'|'upcoming'|'past'>('upcoming');
  const [holidaySelectedDate, setHolidaySelectedDate] = useState<string>('');
  const [holidayRecurringFilter, setHolidayRecurringFilter] = useState<'all'|'weekly'|'none'>('all');
  const [holidayFullDayFilter, setHolidayFullDayFilter] = useState<'all'|'full'|'partial'>('all');
  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, ApiAppointment[]>>({});
  const [searchStaff, setSearchStaff] = useState("");
  const [searchRooms, setSearchRooms] = useState("");
  const [searchTherapies, setSearchTherapies] = useState("");
  const [searchHolidays, setSearchHolidays] = useState("");
  const [searchPatients, setSearchPatients] = useState("");
  const [patientGenderFilter, setPatientGenderFilter] = useState<'all'|'Male'|'Female'|'Other'>('all');
  const [patientDietFilter, setPatientDietFilter] = useState<'all'|'has'|'none'>('all');
  const [patientSelectedDate, setPatientSelectedDate] = useState<string>('');
  const [patientSortField, setPatientSortField] = useState<'name'|'gender'|'start'|'end'>('name');
  const [patientSortOrder, setPatientSortOrder] = useState<'asc'|'desc'>('asc');
  const [patientDatePickerOpen, setPatientDatePickerOpen] = useState(false);
  const patientFilterActive = patientGenderFilter !== 'all' || patientDietFilter !== 'all' || !!patientSelectedDate;
  const patientSortActive = !(patientSortField === 'name' && patientSortOrder === 'asc');
  const [infoPatient, setInfoPatient] = useState<Patient | null>(null);
  const [infoDraft, setInfoDraft] = useState<Patient | null>(null);
  const [infoDietPlans, setInfoDietPlans] = useState<ApiDietPlan[]>([]);
  const [infoAppointments, setInfoAppointments] = useState<ApiAppointment[]>([]);
  const [infoStays, setInfoStays] = useState<ApiStay[]>([]);
  const [infoEditing, setInfoEditing] = useState(false);
  const showPatientInfo = async (p: Patient) => {
    setInfoPatient(p);
    setInfoDraft({ ...p });
    try {
      const [diet, appts, stays] = await Promise.all([
        fetchJsonWithTimeout<ApiDietPlan[]>(`${API_BASE}/dietplans?patient_id=${p.id}`),
        fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?patient_id=${p.id}`),
        fetchJsonWithTimeout<ApiStay[]>(`${API_BASE}/patients/${p.id}/stays`),
      ]);
      setInfoDietPlans(Array.isArray(diet) ? diet : []);
      setInfoAppointments(Array.isArray(appts) ? appts : []);
      setInfoStays(Array.isArray(stays) ? stays : []);
    } catch {
      setInfoDietPlans([]);
      setInfoAppointments([]);
      setInfoStays([]);
    }
  };
  const therapyNameById = useMemo(() => Object.fromEntries(therapies.map((t: UiTherapy) => [String(t.id), t.name])), [therapies]);
  const staffNameById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const roomNameById = useMemo(() => Object.fromEntries(roomsList.map((r) => [r.id, r.name])), [roomsList]);
  const patientNameById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p.name])), [patients]);
  const roomIdsSet = useMemo(() => new Set(roomsList.map((r) => r.id)), [roomsList]);
  const amenityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of roomsList) for (const a of r.amenities) s.add(a);
    for (const t of therapies) for (const a of t.amenities) s.add(a);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [roomsList, therapies]);

  type DietPlanTemplate = {
    id: string;
    name: string;
    description?: string;
    breakfast: string;
    lunch: string;
    dinner: string;
    snacks: string;
    preTherapyNotes?: string;
    postTherapyNotes?: string;
    medication?: string;
    therapyIds: string[];
    applicability: 'daily' | 'therapyDays';
  };
  const [dietTemplates, setDietTemplates] = useState<DietPlanTemplate[]>([
    {
      id: 'tpl-std',
      name: 'Standard Ayurvedic Plan',
      description: 'Sattvic baseline plan for most patients',
      breakfast: 'Warm mung dal porridge, soaked almonds, herbal tea',
      lunch: 'Khichdi with seasonal vegetables, ghee, cumin rice, salad',
      dinner: 'Light vegetable soup, chapati with ghee, steamed greens',
      snacks: 'Fresh seasonal fruit, buttermilk (chaas) mid-afternoon',
      preTherapyNotes: '',
      postTherapyNotes: '',
      medication: 'As prescribed by physician; Trikatu after meals if advised',
      therapyIds: [],
      applicability: 'daily',
    },
    {
      id: 'tpl-ghee',
      name: 'Ghee Only Plan',
      description: 'Mock plan for last-day ghee regimen',
      breakfast: 'Warm ghee teaspoon, herbal tea',
      lunch: 'Warm ghee teaspoon, warm water',
      dinner: 'Warm ghee teaspoon, light broth',
      snacks: 'Warm water sips as advised',
      preTherapyNotes: 'Ensure no heavy meals prior; physician approval required',
      postTherapyNotes: 'Rest, warm water only; monitor comfort',
      medication: '',
      therapyIds: [],
      applicability: 'daily',
    },
  ]);
  const [selectedDietTemplateId, setSelectedDietTemplateId] = useState<string>('tpl-std');
  const [dietDraft, setDietDraft] = useState<DietPlanTemplate>(() => ({
    ...({} as DietPlanTemplate),
    id: 'new',
    name: 'Custom Plan',
    description: '',
    breakfast: '',
    lunch: '',
    dinner: '',
    snacks: '',
    preTherapyNotes: '',
    postTherapyNotes: '',
    medication: '',
    therapyIds: [],
    applicability: 'daily',
  }));
  const [dietSelectedPatientIds, setDietSelectedPatientIds] = useState<string[]>([]);
  const [dietSearchPatients, setDietSearchPatients] = useState<string>('');
  const [dietAssignTherapyIds, setDietAssignTherapyIds] = useState<string[]>([]);
  const [patientTherapyTags, setPatientTherapyTags] = useState<Record<string, string[]>>({});
  const [showAddDietDialog, setShowAddDietDialog] = useState(false);
  const [editAssignmentPatientId, setEditAssignmentPatientId] = useState<string | null>(null);
  const [assignmentTemplateId, setAssignmentTemplateId] = useState<string>('tpl-std');
  const [assignmentTherapyIds, setAssignmentTherapyIds] = useState<string[]>([]);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [dietSchedules, setDietSchedules] = useState<Record<string, { start: string; end: string; templateId: string; therapyIds: string[] }[]>>({});
  const [assignmentSegments, setAssignmentSegments] = useState<{ start: string; end: string; templateId: string }[]>([]);
  const [addDialogPatientId, setAddDialogPatientId] = useState<string | null>(null);
  type UiDietPartial = {
    name?: string;
    description?: string;
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    snacks?: string;
    medication?: string;
  };
  type TemplateLike = {
    name?: string;
    description?: string;
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    snacks?: string;
    preTherapyNotes?: string;
    postTherapyNotes?: string;
    medication?: string;
    therapyIds?: string[];
    applicability?: 'daily' | 'therapyDays';
  };
  type UiSegment = { start: string; end: string; templateId: string; therapyIds: string[]; done?: boolean; expanded?: boolean; locked?: boolean; customTemplate?: UiDietPartial; saveAsTemplate?: boolean };
  const [addDialogSegments, setAddDialogSegments] = useState<UiSegment[]>([]);
  const [addDialogPatientOpen, setAddDialogPatientOpen] = useState(false);
  const [addDialogPatientStays, setAddDialogPatientStays] = useState<{ start_date: string; end_date: string }[]>([]);
  const [addDialogPatientAppointments, setAddDialogPatientAppointments] = useState<ApiAppointment[]>([]);
  const [segmentDatePickerOpen, setSegmentDatePickerOpen] = useState<{ idx: number | null; field: 'start' | 'end' | null }>({ idx: null, field: null });
  const [templateSearch, setTemplateSearch] = useState<string>("");
  const [templatePickerOpenIdx, setTemplatePickerOpenIdx] = useState<number | null>(null);

  const resetAddDialog = () => {
    const fromAddPatient = addDialogPatientId === null;
    if (fromAddPatient) {
      let label = '';
      const segs = addDialogSegments;
      if (segs.length > 1) {
        label = 'Multiple plans';
      } else if (segs.length === 1) {
        const s = segs[0];
        if (s.templateId) {
          const tpl = dietTemplates.find((t) => t.id === s.templateId);
          label = tpl?.name || '';
        } else if (s.customTemplate?.name) {
          label = s.customTemplate.name || '';
        } else if (selectedDietTemplateId) {
          const tpl = dietTemplates.find((t) => t.id === selectedDietTemplateId);
          label = tpl?.name || (dietDraft.name || '');
        } else {
          label = dietDraft.name || '';
        }
      } else {
        if (selectedDietTemplateId) {
          const tpl = dietTemplates.find((t) => t.id === selectedDietTemplateId);
          label = tpl?.name || (dietDraft.name || '');
        } else {
          label = dietDraft.name || '';
        }
      }
      if (label) setNewPatient((prev) => ({ ...prev, dietPlan: label }));
    }
    setAddDialogPatientId(null);
    if (!fromAddPatient) {
      setAddDialogSegments([]);
      setSelectedDietTemplateId('');
      setDietDraft({ id: 'new', name: '', description: '', breakfast: '', lunch: '', dinner: '', snacks: '', preTherapyNotes: '', postTherapyNotes: '', medication: '', therapyIds: [], applicability: 'daily' });
    }
    setAddDialogPatientOpen(false);
    setAddDialogPatientStays([]);
    setAddDialogPatientAppointments([]);
    setSegmentDatePickerOpen({ idx: null, field: null });
  };
  const applyTemplateToDraft = (tplId: string) => {
    const tpl = dietTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setDietDraft({
      id: 'new',
      name: tpl.name,
      description: tpl.description || '',
      breakfast: tpl.breakfast,
      lunch: tpl.lunch,
      dinner: tpl.dinner,
      snacks: tpl.snacks,
      preTherapyNotes: tpl.preTherapyNotes || '',
      postTherapyNotes: tpl.postTherapyNotes || '',
      medication: tpl.medication || '',
      therapyIds: tpl.therapyIds || [],
      applicability: tpl.applicability,
    });
    setSelectedDietTemplateId(tplId);
  };
  const saveDietTemplate = () => {
    const id = `tpl-${Date.now()}`;
    const next: DietPlanTemplate = { ...dietDraft, id };
    setDietTemplates((prev) => [next, ...prev]);
    setSelectedDietTemplateId(id);
    toast.success('Diet template saved');
  };
  const assignDietToPatients = () => {
    if (dietSelectedPatientIds.length === 0) { toast.error('Select patients to assign'); return; }
    setPatients((prev) => prev.map((p) => {
      if (!dietSelectedPatientIds.includes(p.id)) return p;
      const label = dietDraft.name || 'Diet Plan';
      return { ...p, dietPlan: label };
    }));
    setPatientTherapyTags((prev) => {
      const next = { ...prev };
      for (const id of dietSelectedPatientIds) {
        next[id] = Array.from(new Set([...(next[id] || []), ...dietAssignTherapyIds]));
      }
      return next;
    });
    toast.success('Diet plan assigned to selected patients');
  };
  const generatedPreInstructions = (ids: string[]) => ids.map((tid) => `Take warm herbal kada 20–30 min before ${(therapyNameById[tid] || tid)}.`).join('\n');
  const generatedPostInstructions = (ids: string[]) => ids.map((tid) => `After ${(therapyNameById[tid] || tid)}, rest 30–45 min; warm water; avoid cold foods.`).join('\n');

  const toggleRoomAmenity = (roomId: string | number, amenity: string) => {
    setRoomsList((prev) => prev.map((r) => {
      if (r.id !== roomId) return r;
      const has = r.amenities.includes(amenity);
      const next = has ? r.amenities.filter((x) => x !== amenity) : [...r.amenities, amenity];
      return { ...r, amenities: [...new Set(next)].sort((a, b) => a.localeCompare(b)) };
    }));
  };

  const addAmenityToRoom = (roomId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    const current = roomsList.find((r) => r.id === roomId)?.amenities || [];
    if (current.includes(existing)) { setRoomAmenityDrafts((prev) => ({ ...prev, [roomId]: "" })); return; }
    setRoomsList((prev) => prev.map((r) => r.id === roomId ? { ...r, amenities: [...new Set([...r.amenities, existing])].sort((a, b) => a.localeCompare(b)) } : r));
    setRoomAmenityDrafts((prev) => ({ ...prev, [roomId]: "" }));
  };

  const toggleTherapyAmenity = (therapyId: string | number, amenity: string) => {
    setTherapies((prev) => prev.map((t) => {
      if (t.id !== therapyId) return t;
      const has = t.amenities.includes(amenity);
      const next = has ? t.amenities.filter((x) => x !== amenity) : [...t.amenities, amenity];
      return { ...t, amenities: [...new Set(next)].sort((a, b) => a.localeCompare(b)) };
    }));
  };

  const toggleStaffTherapy = (staffId: string | number, therapyName: string) => {
    setStaff((prev) => prev.map((s) => {
      if (s.id !== staffId) return s;
      const set = new Set<string>(s.specializations);
      if (set.has(therapyName)) set.delete(therapyName); else set.add(therapyName);
      return { ...s, specializations: Array.from(set).sort((a,b)=>a.localeCompare(b)) };
    }));
  };

  const addAmenityToTherapy = (therapyId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    const current = therapies.find((t) => t.id === therapyId)?.amenities || [];
    if (current.includes(existing)) { setTherapyAmenityDrafts((prev) => ({ ...prev, [therapyId]: "" })); return; }
    setTherapies((prev) => prev.map((t) => t.id === therapyId ? { ...t, amenities: [...new Set([...t.amenities, existing])].sort((a, b) => a.localeCompare(b)) } : t));
    setTherapyAmenityDrafts((prev) => ({ ...prev, [therapyId]: "" }));
  };

  const toggleEventAmenity = (eventId: string | number, amenity: string) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const current = Array.isArray(e.required_amenities) ? e.required_amenities : [];
      const has = current.includes(amenity);
      const next = has ? current.filter((x) => x !== amenity) : [...current, amenity];
      const sorted = [...new Set(next)].sort((a, b) => a.localeCompare(b));
      const eligibleRoomIds = roomsList.filter((r) => sorted.every((a) => r.amenities.includes(a))).map((r) => String(r.id));
      const roomOk = e.room_id ? eligibleRoomIds.includes(String(e.room_id)) : true;
      return { ...e, required_amenities: sorted, room_id: roomOk ? e.room_id : '' } as any;
    }));
  };

  const addAmenityToEvent = (eventId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const current = Array.isArray(e.required_amenities) ? e.required_amenities : [];
      if (current.includes(existing)) { setEventAmenityDrafts((d) => ({ ...d, [eventId]: "" })); return e; }
      const next = [...new Set([...current, existing])].sort((a, b) => a.localeCompare(b));
      const eligibleRoomIds = roomsList.filter((r) => next.every((a) => r.amenities.includes(a))).map((r) => String(r.id));
      const roomOk = e.room_id ? eligibleRoomIds.includes(String(e.room_id)) : true;
      setEventAmenityDrafts((d) => ({ ...d, [eventId]: "" }));
      return { ...e, required_amenities: next, room_id: roomOk ? e.room_id : '' } as any;
    }));
  };

  const autosaveTimers = useRef<Record<string, number>>({});
  const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || '';
  const patientAutosaveTimers = useRef<Record<string, number>>({});
  const scheduleEventAutosave = (id: string | number, columnLabel: string = 'updated', entityLabel: string = 'Event') => {
    const key = String(id);
    const t = autosaveTimers.current[key];
    if (t) {
      clearTimeout(t);
    }
    autosaveTimers.current[key] = window.setTimeout(async () => {
      delete autosaveTimers.current[key];
      const curr = events.find((x) => String(x.id) === key);
      if (!curr) return;
      const payload: any = {
        activity_name: curr.activity_name,
        start_time: curr.start_time || null,
        end_time: curr.end_time || null,
        date: curr.date || null,
        start_date: curr.start_date || null,
        end_date: curr.end_date || null,
        room_id: curr.room_id || null,
        staff_id: curr.staff_id || null,
        required_amenities: curr.required_amenities || [],
        patients_scope: (curr as any).patients_scope || null,
        patient_ids: (curr as any).patient_ids || [],
        staff_scope: (curr as any).staff_scope || null,
        staff_ids: (curr as any).staff_ids || [],
        recurrence: (curr.weekdays && curr.weekdays.length) ? 'weekly' : null,
        weekdays: curr.weekdays || [],
      };
      try {
        const res = await fetch(`${API_BASE}/program-events/${curr.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
        if (!res.ok) return;
        // Do not mutate local events on autosave to avoid clearing in-progress inputs
      } catch {}
    }, 400);
  };
  const schedulePatientAutosave = (id: string, columnLabel: string = 'updated') => {
    const key = String(id);
    const t = patientAutosaveTimers.current[key];
    if (t) {
      clearTimeout(t);
    }
    patientAutosaveTimers.current[key] = window.setTimeout(async () => {
      delete patientAutosaveTimers.current[key];
      const curr = patients.find((x) => String(x.id) === key);
      if (!curr) return;
      const payload: any = {
        name: curr.name,
        gender: curr.gender.toLowerCase(),
        phone: curr.phone || undefined,
        email: curr.email || undefined,
        emergency_contact: curr.emergencyContact || undefined,
        emergency_phone: curr.emergencyPhone || undefined,
        medical_notes: curr.medicalNotes || undefined,
        diet_plan: curr.dietPlan || undefined,
        available_from: curr.actualStart || undefined,
        available_to: curr.actualEnd || undefined,
      };
      try {
        const res = await fetch(`${API_BASE}/patients/${curr.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
        if (!res.ok) return;
        toast.success(`Patient ${columnLabel} edited`);
      } catch {}
    }, 400);
  };
  const ADMIN_TZ = ((import.meta as unknown as { env?: { VITE_ADMIN_TZ?: string } }).env?.VITE_ADMIN_TZ as string | undefined) || 'Asia/Kolkata';
  const ymdInTZ = (date: Date) => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value || String(date.getFullYear());
    const m = parts.find((p) => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
    const d = parts.find((p) => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const ymdInTZFromISO = (iso?: string) => (iso ? ymdInTZ(new Date(iso)) : '');
  const formatIndianDMY = (iso: string) => {
    const ddmmyyyy = new Intl.DateTimeFormat('en-IN', { timeZone: ADMIN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
    return ddmmyyyy;
  };
  const formatIndianDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', { timeZone: ADMIN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const formatIndianDateTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const dateStr = new Intl.DateTimeFormat('en-IN', { timeZone: ADMIN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    const timeStr = new Intl.DateTimeFormat('en-IN', { timeZone: ADMIN_TZ, hour: '2-digit', minute: '2-digit' }).format(d);
    return `${dateStr}, ${timeStr}`;
  };
  const setTimeHM = (iso: string, hh: number, mm: number) => {
    const d = new Date(iso);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  const toHHMM = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };
  const isFullDay = (h: UiTimeOff) => {
    const sT = h.startTime || toHHMM(h.startDate || h.date);
    const eT = h.endTime || toHHMM(h.endDate || h.date);
    return sT === '09:00' && eT === '18:00';
  };
  const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const weeklyLabel = (weekdays?: UiTimeOff['weekdays']) => {
    if (!weekdays || weekdays.length === 0) return 'none';
    const map: Record<string, string> = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
    return `Weekly: ${weekdays.map((w) => map[w] || w).join(', ')}`;
  };
  const toLocalInput = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const toLocalDisplayNoSeconds = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { timeZone: ADMIN_TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const calcHotelDays = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return '';
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const eDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    const ms = eDay.getTime() - sDay.getTime();
    const days = Math.max(1, Math.floor(ms / 86400000) + 1);
    return String(days);
  };
  const toMinutes = (t: string) => {
    const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
    return hh * 60 + mm;
  };
  const formatIndianLong = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { timeZone: ADMIN_TZ, day: '2-digit', month: 'short', year: 'numeric' });
  };
  const calRange = useMemo(() => {
    const t = new Date();
    const min = new Date(t.getFullYear() - 3, t.getMonth(), t.getDate());
    const max = new Date(t.getFullYear() + 3, t.getMonth(), t.getDate());
    return { min, max };
  }, []);

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddTherapy, setShowAddTherapy] = useState(false);
  const [showAddTimeOff, setShowAddTimeOff] = useState(false);
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  const timeHeaderRef = useRef<HTMLDivElement | null>(null);
  const [dayScrollProgress, setDayScrollProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const DEFAULT_PAGE_SIZE = isMobile ? 20 : 40;
  const [visibleStaffRows, setVisibleStaffRows] = useState(DEFAULT_PAGE_SIZE);
  const [visibleRoomsRows, setVisibleRoomsRows] = useState(DEFAULT_PAGE_SIZE);
  const [visibleTherapiesRows, setVisibleTherapiesRows] = useState(DEFAULT_PAGE_SIZE);
  const [visibleTimeOffRows, setVisibleTimeOffRows] = useState(DEFAULT_PAGE_SIZE);
  const [visibleEventsRows, setVisibleEventsRows] = useState(DEFAULT_PAGE_SIZE);
  const staffTotalRef = useRef(0);
  const roomsTotalRef = useRef(0);
  const therapiesTotalRef = useRef(0);
  const timeoffTotalRef = useRef(0);
  const eventsTotalRef = useRef(0);
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const calendarTriggerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { setVisibleStaffRows(isMobile ? 20 : 40); }, [searchStaff, staff, isMobile]);
  useEffect(() => { setVisibleRoomsRows(isMobile ? 20 : 40); }, [searchRooms, roomsList, isMobile]);
  useEffect(() => { setVisibleTherapiesRows(isMobile ? 20 : 40); }, [searchTherapies, therapies, isMobile]);
  useEffect(() => { setVisibleTimeOffRows(isMobile ? 20 : 40); }, [searchHolidays, timeOffs, holidayTypeFilter, holidayViewMode, holidayRecurringFilter, holidayFullDayFilter, holidaySelectedDate, isMobile]);
  useEffect(() => { setVisibleEventsRows(isMobile ? 20 : 40); }, [events, isMobile]);

  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
      if (!nearBottom) return;
      const batch = isMobile ? 20 : 40;
      if (activeTab === 'staff') setVisibleStaffRows((prev) => Math.min(prev + batch, staffTotalRef.current));
      else if (activeTab === 'rooms') setVisibleRoomsRows((prev) => Math.min(prev + batch, roomsTotalRef.current));
      else if (activeTab === 'therapies') setVisibleTherapiesRows((prev) => Math.min(prev + batch, therapiesTotalRef.current));
      else if (activeTab === 'timeoff') setVisibleTimeOffRows((prev) => Math.min(prev + batch, timeoffTotalRef.current));
      else if (activeTab === 'events') setVisibleEventsRows((prev) => Math.min(prev + batch, eventsTotalRef.current));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeTab, isMobile]);

  useEffect(() => {
    if (!showCalendar) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (calendarRef.current && calendarRef.current.contains(t)) return;
      if (calendarTriggerRef.current && calendarTriggerRef.current.contains(t)) return;
      setShowCalendar(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCalendar]);
  const dayGridCols = useMemo(() => {
    const dayKey = ymdInTZ(currentDate);
    const dayAppointments = Array.isArray(appointmentsByDate[dayKey]) ? appointmentsByDate[dayKey] : [];
    const roomsForDay = roomsList.filter((r) => dayAppointments.some((a: ApiAppointment) => a.room_id === r.id));
    const fullCount = viewType === "day" ? roomsForDay.length : roomsList.length;
    const count = fullCount;
    if (isMobile) {
      return `minmax(56px,72px) repeat(${count}, minmax(200px, 200px))`;
    }
    return `minmax(56px,72px) repeat(${count}, minmax(160px, 1fr))`;
  }, [roomsList, currentDate, appointmentsByDate, viewType, isMobile]);

  const [newStaff, setNewStaff] = useState({
    name: "",
    gender: "Female",
    specializationsText: "",
    phone: "",
    schedule: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [newRoom, setNewRoom] = useState({
    name: "",
    amenitiesText: "",
    schedule: "",
    status: "Active",
  });
  const [newTherapy, setNewTherapy] = useState({
    name: "",
    duration: 60,
    amenitiesText: "",
    genderMatch: false,
  });
  const [newTimeOff, setNewTimeOff] = useState({
    date: "",
    endDate: "",
    type: "Center" as "Center" | "Staff" | "Room" | "Therapy" | "Patient",
    entity: "",
    fullDay: false,
    description: "",
  });

  const [editingTimeOffId, setEditingTimeOffId] = useState<string | null>(null);
  const [originalTimeOff, setOriginalTimeOff] = useState<UiTimeOff | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const t: ApiTherapy[] = await fetchJsonWithTimeout(`${API_BASE}/therapies`);
        setTherapies(t.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match })));
        const s: (ApiStaff & { is_active?: boolean; status?: string })[] = await fetchJsonWithTimeout(`${API_BASE}/staff`);
        setStaff(s.map((x) => ({ id: x.id, name: x.name, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", specializations: x.specializations.map((id) => t.find((k) => k.id === id)?.name).filter((n): n is string => !!n), phone: x.phone ?? "", schedule: "", status: (typeof x.is_active === 'boolean' ? (x.is_active ? 'Active' : 'Inactive') : (x.status === 'Active' ? 'Active' : 'Inactive')) })));
        const r: ApiRoom[] = await fetchJsonWithTimeout(`${API_BASE}/rooms`);
        setRoomsList(r.map((x) => ({ id: x.id, name: x.name, amenities: x.amenities, schedule: "", status: x.is_active ? "Active" : "Maintenance" })));
        const p: ApiPatient[] = await fetchJsonWithTimeout(`${API_BASE}/patients`);
        setPatients(p.map((x) => ({ id: x.id, name: x.name, phone: x.phone ?? "", email: x.email ?? "", gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other", dob: x.date_of_birth ? new Date(x.date_of_birth as unknown as string).toISOString().slice(0,10) : "", emergencyContact: x.emergency_contact ?? "", emergencyPhone: x.emergency_phone ?? "", address: "", medicalNotes: x.medical_notes ?? "", dietPlan: x.diet_plan ?? "", actualStart: x.available_from || "", actualEnd: x.available_to || "" })));
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

  const startEditPatient = (p: Patient) => {
    setEditingPatientId(p.id);
    setOriginalPatient({ ...p });
  };

  const saveEditPatient = async () => {
    if (!editingPatientId) return;
    const p = patients.find((x) => x.id === editingPatientId);
    if (!p) return;
    try {
      await fetch(`${API_BASE}/patients/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) },
        body: JSON.stringify({
          name: p.name,
          gender: p.gender.toLowerCase() as 'male'|'female'|'other',
          phone: p.phone || undefined,
          email: p.email || undefined,
          emergency_contact: p.emergencyContact || undefined,
          emergency_phone: p.emergencyPhone || undefined,
          medical_notes: p.medicalNotes || undefined,
          diet_plan: p.dietPlan || undefined,
          available_from: p.actualStart || undefined,
          available_to: p.actualEnd || undefined,
        }),
      });
      toast.success('Patient updated');
    } catch {
      toast.error('Failed to update patient');
    }
    setEditingPatientId(null);
    setOriginalPatient(null);
  };

  const cancelEditPatient = () => {
    if (originalPatient) {
      setPatients((prev) => prev.map((x) => (x.id === originalPatient.id ? originalPatient : x)));
    }
    setEditingPatientId(null);
    setOriginalPatient(null);
  };

  const startEditTimeOff = (h: UiTimeOff) => {
    setEditingTimeOffId(h.id);
    setOriginalTimeOff({ ...h });
  };

  const saveEditTimeOff = async () => {
    if (!editingTimeOffId) return;
    const h = timeOffs.find((x) => x.id === editingTimeOffId);
    if (!h) return;
    const payload = {
      entity_type: h.type.toLowerCase(),
      entity_id: h.type === 'Center' ? null : h.entity,
      date: h.date,
      start_date: h.startDate,
      end_date: h.endDate,
      start_time: toHHMM(h.startDate || h.date),
      end_time: toHHMM(h.endDate || h.date),
      recurrence: h.recurrence,
      weekdays: h.weekdays,
      description: h.description,
    };
    try {
      const res = await fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
      const updated = await res.json();
      setTimeOffs((prev) => prev.map((x) => x.id === h.id ? { ...x, date: updated.date ? new Date(updated.date).toISOString() : undefined, startDate: updated.start_date ? new Date(updated.start_date).toISOString() : undefined, endDate: updated.end_date ? new Date(updated.end_date).toISOString() : undefined, startTime: updated.start_time || undefined, endTime: updated.end_time || undefined, recurrence: updated.recurrence || undefined, weekdays: updated.weekdays || undefined } : x));
      setEditingTimeOffId(null);
      setOriginalTimeOff(null);
    } catch {
      toast.error('Failed to save time off');
    }
  };

  const cancelEditTimeOff = () => {
    if (originalTimeOff) {
      setTimeOffs((prev) => prev.map((x) => (x.id === originalTimeOff.id ? originalTimeOff : x)));
    }
    setEditingTimeOffId(null);
    setOriginalTimeOff(null);
  };

  const deleteTimeOff = async (id: string) => {
    await fetch(`${API_BASE}/timeoff/${id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
    setTimeOffs((prev) => prev.filter((h) => h.id !== id));
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
        setTherapies(t2.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match })));
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToPreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    const el = dayScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const timeW = timeHeaderRef.current?.offsetWidth ?? 0;
      const maxRooms = Math.max(0, el.scrollWidth - el.clientWidth - timeW);
      const leftRooms = Math.max(0, el.scrollLeft - timeW);
      const pct = maxRooms > 0 ? Math.min(1, leftRooms / maxRooms) : 0;
      setDayScrollProgress(pct);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [currentDate, roomsList.length]);

  // Calculate stats for overview
  const monday = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(currentDate.getDate() - currentDate.getDay() + 1);
    return d;
  }, [currentDate]);
  const weekDatesKeys = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return ymdInTZ(d);
  }), [monday]);
  const todayKey = ymdInTZ(currentDate);
  const dayStartMin = timeSlots.length ? toMinutes(timeSlots[0]) : 9 * 60;
  const dayEndMin = timeSlots.length ? toMinutes(timeSlots[timeSlots.length - 1]) : 18 * 60;
  const todayAppointmentsVisible = (Array.isArray(appointmentsByDate[todayKey]) ? appointmentsByDate[todayKey] : []).filter((a) => {
    const m = toMinutes(a.start_time);
    return m >= dayStartMin && m <= dayEndMin && (a.status ? a.status !== "cancelled" : true);
  }).length;
  const weekTotal = weekDatesKeys.reduce((sum, k) => {
    const items = (Array.isArray(appointmentsByDate[k]) ? appointmentsByDate[k] : []).filter((a) => {
      const m = toMinutes(a.start_time);
      return m >= dayStartMin && m <= dayEndMin && (a.status ? a.status !== "cancelled" : true);
    });
    return sum + items.length;
  }, 0);
  const capacityWeek = Math.max(1, roomsList.length) * timeSlots.length * weekDatesKeys.length;
  const utilizationRate = Math.min(100, Math.round((weekTotal / capacityWeek) * 100));
  const availableSlots = Math.max(0, (roomsList.length * timeSlots.length) - todayAppointmentsVisible);
  const todayPatientsCount = (() => {
    const items = (Array.isArray(appointmentsByDate[todayKey]) ? appointmentsByDate[todayKey] : []).filter((a) => {
      const m = toMinutes(a.start_time);
      return m >= dayStartMin && m <= dayEndMin && (a.status ? a.status !== "cancelled" : true);
    });
    const set = new Set(items.map((a) => String(a.patient_id)));
    return set.size;
  })();
  const todayStaffActive = (() => {
    const wd = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date(currentDate).getDay()];
    const centerClosed = (timeOffs || []).some((t) => {
      if (t.type !== "Center") return false;
    const d = new Date(currentDate);
    const s = t.startDate ? new Date(t.startDate) : undefined;
    const e = t.endDate ? new Date(t.endDate) : undefined;
    const isoEq = t.date ? ymdInTZFromISO(t.date) === todayKey : false;
      const inRange = s || e ? (!s || d >= s) && (!e || d <= e) : false;
      const weekly = (t.recurrence === "weekly") && Array.isArray(t.weekdays) && t.weekdays.includes(wd);
      return isoEq || inRange || weekly;
    });
    if (centerClosed) return 0;
    const active = staff.filter((s) => s.status === "Active");
    const offSet = new Set(
      (timeOffs || [])
        .filter((t) => t.type === "Staff")
        .filter((t) => {
          const d = new Date(currentDate);
          const s = t.startDate ? new Date(t.startDate) : undefined;
          const e = t.endDate ? new Date(t.endDate) : undefined;
          const isoEq = t.date ? new Date(t.date).toISOString().slice(0,10) === todayKey : false;
          const inRange = s || e ? (!s || d >= s) && (!e || d <= e) : false;
          const weekly = (t.recurrence === "weekly") && Array.isArray(t.weekdays) && t.weekdays.includes(wd);
          return isoEq || inRange || weekly;
        })
        .map((t) => String(t.entity))
    );
    return active.filter((s) => !offSet.has(String(s.id)) && String(s.id) !== "All").length;
  })();
  const todayEventsCount = (() => {
    const d = new Date(currentDate);
    const wd = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][d.getDay()];
    const iso = todayKey;
    return (events || []).filter((ev) => {
      const exact = ev.date ? ymdInTZFromISO(ev.date) === iso : false;
      const s = ev.start_date ? new Date(ev.start_date) : undefined;
      const e = ev.end_date ? new Date(ev.end_date) : undefined;
      const inRange = s || e ? (!s || d >= s) && (!e || d <= e) : true;
      const weekly = Array.isArray(ev.weekdays) ? ev.weekdays.includes(wd) : false;
      return exact || (weekly && inRange);
    }).length;
  })();
  const compareRoomNames = (aName: string, bName: string) => {
    const ax = String(aName).trim();
    const bx = String(bName).trim();
    const am = ax.match(/^rm\s*(\d+)$/i);
    const bm = bx.match(/^rm\s*(\d+)$/i);
    if (am && bm) {
      const an = Number(am[1]);
      const bn = Number(bm[1]);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return ax.toLowerCase().localeCompare(bx.toLowerCase());
    }
    return ax.toLowerCase().localeCompare(bx.toLowerCase());
  };
  const roomsSortedAZ = useMemo(() => {
    return [...roomsList].sort((a, b) => {
      const an = typeof a === "string" ? a : a.name;
      const bn = typeof b === "string" ? b : b.name;
      return compareRoomNames(an, bn);
    });
  }, [roomsList]);

  const dayKeyMemo = useMemo(() => ymdInTZ(currentDate), [currentDate]);
  const dayRoomsSortedAZ = useMemo(() => {
    const dayAppointments = Array.isArray(appointmentsByDate[dayKeyMemo]) ? appointmentsByDate[dayKeyMemo] : [];
    const knownRoomsWithAppts = roomsList.filter((r) => dayAppointments.some((a: ApiAppointment) => a.room_id === r.id));
    const unknownRoomIds = Array.from(new Set(dayAppointments.map((a: ApiAppointment) => a.room_id))).filter((id) => !roomIdsSet.has(id));
    const syntheticRooms = unknownRoomIds.map((id) => ({ id, name: id, amenities: [], schedule: "", status: "Maintenance" as UiRoom["status"] }));
    const base = viewType === "day" ? [...knownRoomsWithAppts, ...syntheticRooms] : roomsList;
    return [...base].sort((a, b) => {
      const an = typeof a === "string" ? a : a.name;
      const bn = typeof b === "string" ? b : b.name;
      return compareRoomNames(an, bn);
    });
  }, [roomsList, appointmentsByDate, dayKeyMemo, viewType, roomIdsSet]);
  const dayRoomsSet = useMemo(() => new Set(dayRoomsSortedAZ.map((r) => r.id)), [dayRoomsSortedAZ]);
  const roomsToRender = useMemo(() => {
    return dayRoomsSortedAZ;
  }, [dayRoomsSortedAZ]);
  const prevRoom = () => {
    const el = dayScrollRef.current;
    if (!el) return;
    const step = isMobile ? 200 : 0;
    if (step) el.scrollBy({ left: -step, behavior: "smooth" });
    setActiveRoomIndex((i) => Math.max(0, i - 1));
  };
  const nextRoom = () => {
    const el = dayScrollRef.current;
    if (!el) return;
    const step = isMobile ? 200 : 0;
    if (step) el.scrollBy({ left: step, behavior: "smooth" });
    setActiveRoomIndex((i) => Math.min(dayRoomsSortedAZ.length - 1, i + 1));
  };

  useEffect(() => {
    if (!isMobile || viewType !== "day") return;
    const len = dayRoomsSortedAZ.length;
    setDayScrollProgress(len > 1 ? Math.min(1, activeRoomIndex / (len - 1)) : 0);
  }, [isMobile, viewType, activeRoomIndex, dayRoomsSortedAZ.length]);

  const metricsRef = useRef<HTMLDivElement | null>(null);
  const [metricIndex, setMetricIndex] = useState(0);

  useEffect(() => {
    const el = metricsRef.current;
    if (el) el.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  const prevMetric = () => {
    const next = (metricIndex - 1 + 4) % 4;
    setMetricIndex(next);
    const el = metricsRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const nextMetric = () => {
    const next = (metricIndex + 1) % 4;
    setMetricIndex(next);
    const el = metricsRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const onMetricsScroll = () => {
    const el = metricsRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setMetricIndex(idx);
  };

  useEffect(() => {
    const el = tabsListRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    requestAnimationFrame(() => {
      centerActiveTab("auto");
      requestAnimationFrame(() => centerActiveTab("auto"));
      setTimeout(() => centerActiveTab("auto"), 60);
    });
  }, []);

  useEffect(() => {
    centerActiveTab("smooth");
  }, [activeTab]);

  useEffect(() => {
    const onResize = () => centerActiveTab("auto");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const location = useLocation();
  const navigate = useNavigate();
  const role = location.pathname.startsWith('/staff')
    ? 'Staff'
    : location.pathname.startsWith('/patient')
    ? 'Patient'
    : 'Admin';
  useServerHealth(API_BASE);
  useEffect(() => {
    const segs = location.pathname.split('/').filter(Boolean);
    const tabSeg = segs[1] || 'schedule';
    const next = TAB_ORDER.includes(tabSeg as any) ? tabSeg : 'schedule';
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [location.pathname]);
  useEffect(() => {
    if (activeTab !== 'events') return;
    (async () => {
      try {
        const list = await fetch(`${API_BASE}/program-events`, { cache: 'no-store' }).then(r => r.json());
        setEvents(Array.isArray(list) ? list : []);
      } catch (e) { void e; }
    })();
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-muted/30 overflow-x-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-3 py-2 md:px-3 md:py-3">
          <div className="grid grid-cols-3 items-center">
            <h1 className="text-sm md:text-lg font-bold justify-self-start">{`Ayur-${role}`}</h1>
            <p className="text-xs md:text-sm font-medium tracking-tight text-center whitespace-nowrap">
            {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <div className="justify-self-end">
              <Button
                variant="outline"
                size="icon"
                aria-label="Sign out"
                className="h-7 w-7"
                onClick={() => {
                  localStorage.removeItem("authRole");
                  toast.success("Signed out");
                  navigate("/login");
                }}
              >
                <StopCircle className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-3 md:px-4 py-3 md:py-6">
        <div className="md:hidden relative mb-2 h-11">
          <div className="pointer-events-none absolute inset-0 z-50">
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-3 w-3 absolute left-1 top-1/2 -translate-y-1/2"
              onClick={prevMetric}
            >
              <ChevronLeft className="w-2.5 h-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2"
              onClick={nextMetric}
            >
              <ChevronRight className="w-2.5 h-2.5" />
            </Button>
          </div>
          <div
            ref={metricsRef}
            onScroll={onMetricsScroll}
            className="flex items-center overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth gap-0 px-0 h-full rounded-md bg-muted text-muted-foreground p-1"
          >
            <div className="min-w-full snap-center flex items-center justify-center">
              <Card className="w-[90%] rounded-md bg-background text-foreground border shadow-sm">
                <CardContent className="p-0 h-9 px-2 flex items-center justify-center">
                  <p className="text-sm text-center"><span className="text-muted-foreground">Appointments</span>: <span className="font-bold">{todayAppointmentsVisible}</span></p>
                </CardContent>
              </Card>
            </div>
            <div className="min-w-full snap-center flex items-center justify-center">
              <Card className="w-[90%] rounded-md bg-background text-foreground border shadow-sm">
                <CardContent className="p-0 h-9 px-2 flex items-center justify-center">
                  <p className="text-sm text-center"><span className="text-muted-foreground">Patients</span>: <span className="font-bold">{todayPatientsCount}</span></p>
                </CardContent>
              </Card>
            </div>
            <div className="min-w-full snap-center flex items-center justify-center">
              <Card className="w-[90%] rounded-md bg-background text-foreground border shadow-sm">
                <CardContent className="p-0 h-9 px-2 flex items-center justify-center">
                  <p className="text-sm text-center"><span className="text-muted-foreground">Staff</span>: <span className="font-bold">{todayStaffActive}</span></p>
                </CardContent>
              </Card>
            </div>
            <div className="min-w-full snap-center flex items-center justify-center">
              <Card className="w-[90%] rounded-md bg-background text-foreground border shadow-sm">
                <CardContent className="p-0 h-9 px-2 flex items-center justify-center">
                  <p className="text-sm text-center"><span className="text-muted-foreground">Events</span>: <span className="font-bold">{todayEventsCount}</span></p>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex justify-center mt-2 gap-2">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${metricIndex === i ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            ))}
          </div>
        </div>
        <div className="hidden md:grid md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-1 h-20 text-center">
                <p className="text-sm text-muted-foreground">Appointments</p>
                <p className="text-3xl font-bold">{todayAppointmentsVisible}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-1 h-20 text-center">
                <p className="text-sm text-muted-foreground">Patients</p>
                <p className="text-3xl font-bold">{todayPatientsCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-1 h-20 text-center">
                <p className="text-sm text-muted-foreground">Staff</p>
                <p className="text-3xl font-bold">{todayStaffActive}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-1 h-20 text-center">
                <p className="text-sm text-muted-foreground">Events</p>
                <p className="text-3xl font-bold">{todayEventsCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          const uname = location.pathname.split('/').filter(Boolean)[0] || (typeof window !== 'undefined' ? (localStorage.getItem('authUser') || 'admin') : 'admin');
          const base = `/${uname}`;
          const path = v === 'schedule' ? `${base}/schedule` : `${base}/${v}`;
          navigate(path);
        }} className="space-y-6">
          <div className="relative h-11">
            <div className="pointer-events-none absolute inset-0 z-50 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-3 w-3 absolute left-1 top-1/2 -translate-y-1/2"
                onClick={prevTab}
              >
                <ChevronLeft className="w-2.5 h-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2"
                onClick={nextTab}
              >
                <ChevronRight className="w-2.5 h-2.5" />
              </Button>
            </div>
            <TabsList ref={tabsListRef} className="flex justify-start md:justify-between w-full h-auto p-1 md:p-1 gap-1 overflow-x-auto md:overflow-x-hidden whitespace-nowrap scroll-smooth">
              <TabsTrigger value="schedule" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <CalendarIcon className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-schedule">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="staff" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <Users className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-staff">Staff</span>
              </TabsTrigger>
              <TabsTrigger value="rooms" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <Home className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-rooms">Rooms</span>
              </TabsTrigger>
              <TabsTrigger value="therapies" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-therapies">Therapies</span>
              </TabsTrigger>
              <TabsTrigger value="diet" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-diet">Diet</span>
              </TabsTrigger>
              <TabsTrigger value="timeoff" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <CalendarDays className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-timeoff">TimeOff</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <Activity className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-events">Events</span>
              </TabsTrigger>
              <TabsTrigger value="patients" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <User className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-patients">Patients</span>
              </TabsTrigger>
              <TabsTrigger value="ailments" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-ailments">Ailments</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="h-9 md:h-10 text-sm flex items-center justify-center gap-1 px-1 py-2 md:px-2 shrink-0 md:shrink md:flex-1 md:basis-0 min-w-[90px] md:min-w-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary rounded-md">
                <Info className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="tab-settings">Settings</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="schedule" className="space-y-6">
            <ScheduleTab
              currentDate={currentDate}
              viewType={viewType}
              setCurrentDate={setCurrentDate}
              goToPreviousWeek={goToPreviousWeek}
              goToNextWeek={goToNextWeek}
              goToPreviousDay={goToPreviousDay}
              goToNextDay={goToNextDay}
              showCalendar={showCalendar}
              setShowCalendar={setShowCalendar}
              calRange={calRange}
              ymdInTZ={ymdInTZ}
              appointmentsByDate={appointmentsByDate}
              timeSlots={timeSlots}
              roomsToRender={roomsToRender}
              dayGridCols={dayGridCols}
              dayKeyMemo={dayKeyMemo}
              dayRoomsSet={dayRoomsSet}
              dayScrollRef={dayScrollRef}
              timeHeaderRef={timeHeaderRef}
              dayScrollProgress={dayScrollProgress}
              prevRoom={prevRoom}
              nextRoom={nextRoom}
              weekCompact={weekCompact}
              setWeekCompact={setWeekCompact}
              patients={patients}
              roomsList={roomsList}
              staff={staff}
              therapyNameById={therapyNameById}
              setSelectedAppointment={setSelectedAppointment}
              pdfLoading={pdfLoading}
              handleGenerateDailyPdf={handleGenerateDailyPdf}
              setShowAutoAssign={setShowAutoAssign}
              setShowVerify={setShowVerify}
              calendarTriggerRef={calendarTriggerRef}
              calendarRef={calendarRef}
            />
          </TabsContent>

          <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Add Event</DialogTitle>
                <DialogDescription>Add a program event. Fields marked optional can be left blank.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input placeholder="Activity" value={newEvent.activity_name} onChange={(e) => setNewEvent({ ...newEvent, activity_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1 items-center">
                    <Input placeholder="Start" type="time" step="900" value={newEvent.start_time} onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })} />
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setNewEvent({ ...newEvent, start_time: '' })}>Clear</Button>
                  </div>
                  <div className="flex gap-1 items-center">
                    <Input placeholder="End" type="time" step="900" value={newEvent.end_time} onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })} />
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setNewEvent({ ...newEvent, end_time: '' })}>Clear</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Start Date (optional)" type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                  <Input placeholder="End Date (optional)" type="date" value={(newEvent as any).end_date || ''} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value } as any)} />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Select value={newEvent.room_id} onValueChange={(v) => setNewEvent({ ...newEvent, room_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Room" /></SelectTrigger>
                    <SelectContent>
                      {roomsList.filter((r) => (newEvent.required_amenities || []).every((a) => r.amenities.includes(a))).map(r => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Select Required Amenities</Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-2 w-72">
                      <Command>
                        <CommandInput placeholder="Search amenities" />
                        <CommandList>
                          <CommandEmpty>No results</CommandEmpty>
                          <CommandGroup heading="Amenities">
                            {amenityOptions.map((opt) => (
                              <CommandItem key={opt} onSelect={() => setNewEvent({ ...newEvent, required_amenities: (newEvent.required_amenities || []).includes(opt) ? newEvent.required_amenities.filter((x) => x !== opt) : [...new Set([...(newEvent.required_amenities || []), opt])].sort((a,b)=>a.localeCompare(b)) })}>
                                <Checkbox size="sm" checked={(newEvent.required_amenities || []).includes(opt)} className="mr-2" />
                                <span>{opt}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <div className="mt-2 flex gap-2">
                        <Input placeholder="Add amenity" className="h-8" value={newEventAmenityDraft} onChange={(e) => setNewEventAmenityDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') {
                          const value = (newEventAmenityDraft || '').trim();
                          if (!value) return;
                          const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
                          if ((newEvent.required_amenities || []).includes(existing)) { setNewEventAmenityDraft(''); return; }
                          const next = [...new Set([...(newEvent.required_amenities || []), existing])].sort((a,b)=>a.localeCompare(b));
                          setNewEvent({ ...newEvent, required_amenities: next });
                          setNewEventAmenityDraft('');
                        } }} />
                        <Button size="sm" className="h-8" onClick={() => {
                          const value = (newEventAmenityDraft || '').trim();
                          if (!value) return;
                          const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
                          if ((newEvent.required_amenities || []).includes(existing)) { setNewEventAmenityDraft(''); return; }
                          const next = [...new Set([...(newEvent.required_amenities || []), existing])].sort((a,b)=>a.localeCompare(b));
                          setNewEvent({ ...newEvent, required_amenities: next });
                          setNewEventAmenityDraft('');
                        }}>Add</Button>
                        <Button size="sm" variant="secondary" className="h-8" onClick={() => { setNewEvent({ ...newEvent, required_amenities: [] }); }}>Clear</Button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(newEvent.required_amenities || []).map((amenity, index) => (
                          <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input placeholder="Notes (optional)" value={newEvent.notes} onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })} />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-between">
                      {(() => {
                        const d = (newEvent.weekdays || []);
                        if (d.length === 0) return 'None';
                        if (d.length === 7) return 'All';
                        return d.map(w => w.slice(0,3).toUpperCase()).join(',');
                      })()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 w-64">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => setNewEvent({ ...newEvent, weekdays: [], recurrence: null })}>None</Button>
                      <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => setNewEvent({ ...newEvent, weekdays: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], recurrence: 'weekly' })}>All</Button>
                      {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                        const selected = (newEvent.weekdays || []).includes(wd);
                        return (
                          <Button key={wd} variant="ghost" className="justify-start h-7 text-xs"
                            onClick={() => {
                              const set = new Set(newEvent.weekdays);
                              if (set.has(wd)) set.delete(wd); else set.add(wd);
                              const arr = Array.from(set);
                              setNewEvent({ ...newEvent, weekdays: arr, recurrence: arr.length ? 'weekly' : null });
                            }}
                          >
                            <span className="mr-2">{selected ? '☑︎' : '☐'}</span>{wd.slice(0,3).toUpperCase()}
                          </Button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="grid grid-cols-2 gap-2 items-start">
                  <div className="space-y-2">
                    <span className="text-xs font-medium">Patients</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between">
                          {(() => { const scope = (newEvent as any).patients_scope || 'all'; if (scope === 'all') return 'All'; if (scope === 'none') return 'None'; const pid = Array.isArray((newEvent as any).patient_ids) ? (newEvent as any).patient_ids[0] : undefined; const p = patients.find(pp => String(pp.id) === String(pid)); return p ? p.name : 'Select…'; })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-64">
                        <Command>
                          <CommandInput placeholder="Search patients" />
                          <CommandList>
                            <CommandGroup>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'all', patient_ids: [] } as any)}>All</CommandItem>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'none', patient_ids: [] } as any)}>None</CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Patients">
                              {patients.map(p => (
                                <CommandItem key={p.id} onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'custom', patient_ids: [String(p.id)] } as any)}>
                                  {p.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium">Staff</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between">
                          {(() => { const scope = (newEvent as any).staff_scope || 'none'; if (scope === 'all') return 'All'; if (scope === 'none') { const host = staff.find(s => String(s.id) === String(newEvent.staff_id)); return host ? `Host: ${host.name}` : 'None'; } const sid = Array.isArray((newEvent as any).staff_ids) ? (newEvent as any).staff_ids[0] : undefined; const s = staff.find(ss => String(ss.id) === String(sid)); return s ? s.name : 'Select…'; })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-64">
                        <Command>
                          <CommandInput placeholder="Search staff" />
                          <CommandList>
                            <CommandGroup>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'all', staff_ids: [], staff_id: '' } as any)}>All</CommandItem>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'none', staff_ids: [], staff_id: '' } as any)}>None</CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Staff">
                              {staff.map(s => (
                                <CommandItem key={s.id} onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'none', staff_ids: [], staff_id: String(s.id) } as any)}>
                                  {s.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
                <Button onClick={async () => {
                  const st = (newEvent.start_time || '').trim();
                  const et = (newEvent.end_time || '').trim();
                  if (!st || !et) { toast.error('Please enter start and end time'); return; }
                  const payload: any = {
                    activity_name: newEvent.activity_name,
                    start_time: st,
                    end_time: et,
                    date: newEvent.date || undefined,
                    end_date: (newEvent as any).end_date || undefined,
                    room_id: newEvent.room_id || undefined,
                    staff_id: newEvent.staff_id || undefined,
                    required_amenities: newEvent.required_amenities,
                    notes: newEvent.notes || undefined,
                    recurrence: (newEvent.weekdays && newEvent.weekdays.length) ? 'weekly' : null,
                    weekdays: newEvent.weekdays,
                    patients_scope: (newEvent as any).patients_scope || 'all',
                    patient_ids: (newEvent as any).patient_ids || [],
                    staff_scope: (newEvent as any).staff_scope || 'none',
                    staff_ids: (newEvent as any).staff_ids || [],
                  };
                  const res = await fetch(`${API_BASE}/program-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                  if (!res.ok) { toast.error('Failed to add'); return; }
                  const all = await fetch(`${API_BASE}/program-events`).then(r => r.json());
                  setEvents(all);
                  const name = (newEvent.activity_name || '').trim();
                  toast.success(name ? `Event ${name} added` : 'Event added');
                  setShowAddEvent(false);
                  setNewEvent({ date: '', start_time: '07:30', end_time: '08:30', activity_name: '', room_id: '', staff_id: '', required_amenities: [], notes: '', recurrence: 'weekly', weekdays: ['monday'], audience: 'all' });
                }}>Add</Button>
              </DialogFooter>
            </DialogContent>
  </Dialog>

    <Dialog open={showTemplatesDialog} onOpenChange={setShowTemplatesDialog}>
      <DialogContent className="max-w-3xl max-h-[85vh] sm:max-h-[90vh] overflow-auto p-4">
        <DialogHeader>
          <DialogTitle className="text-base">Templates</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-2">
            <Input placeholder="Search templates" className="h-8" onChange={(e) => {
              const q = e.target.value.toLowerCase();
              const first = dietTemplates.find(t => t.name.toLowerCase().includes(q));
              if (first) setSelectedDietTemplateId(first.id);
            }} />
            <div className="space-y-1 max-h-[320px] overflow-auto">
              {dietTemplates.map((tpl) => (
                <Card key={tpl.id} className={`cursor-pointer ${selectedDietTemplateId === tpl.id ? 'border-primary' : ''}`} onClick={() => setSelectedDietTemplateId(tpl.id)}>
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{tpl.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{tpl.description || '—'}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); applyTemplateToDraft(tpl.id); setShowAddDietDialog(true); }}>Edit</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setAssignmentTemplateId(tpl.id); setAssignmentTherapyIds(tpl.therapyIds || []); }}>Select</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Selected Template</div>
            {(() => {
              const tpl = dietTemplates.find(t => t.id === selectedDietTemplateId);
              if (!tpl) return <div className="text-xs text-muted-foreground">None selected</div>;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div><span className="font-semibold">Name:</span> {tpl.name}</div>
                    <div><span className="font-semibold">Applicability:</span> {tpl.applicability}</div>
                    <div className="col-span-2"><span className="font-semibold">Therapies:</span> {tpl.therapyIds.map(id => therapyNameById[id] || id).join(', ') || '—'}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Card><CardContent className="p-2"><div className="font-semibold text-xs mb-1">Breakfast</div><div className="text-xs whitespace-pre-wrap">{tpl.breakfast}</div></CardContent></Card>
                    <Card><CardContent className="p-2"><div className="font-semibold text-xs mb-1">Lunch</div><div className="text-xs whitespace-pre-wrap">{tpl.lunch}</div></CardContent></Card>
                    <Card><CardContent className="p-2"><div className="font-semibold text-xs mb-1">Dinner</div><div className="text-xs whitespace-pre-wrap">{tpl.dinner}</div></CardContent></Card>
                    <Card><CardContent className="p-2"><div className="font-semibold text-xs mb-1">Snacks</div><div className="text-xs whitespace-pre-wrap">{tpl.snacks}</div></CardContent></Card>
                    <Card className="col-span-2"><CardContent className="p-2"><div className="font-semibold text-xs mb-1">Medication</div><div className="text-xs whitespace-pre-wrap">{tpl.medication || '—'}</div></CardContent></Card>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowTemplatesDialog(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

          {/* Staff Tab */}
          <TabsContent value="staff" data-testid="tabpanel-staff">
            <StaffTab
              staff={staff}
              therapies={therapies}
              searchStaff={searchStaff}
              setSearchStaff={setSearchStaff}
              visibleStaffRows={visibleStaffRows}
              setVisibleStaffRows={setVisibleStaffRows}
              staffTotalRef={staffTotalRef}
              editingStaffId={editingStaffId}
              setEditingStaffId={setEditingStaffId}
              originalStaffEntry={originalStaffEntry}
              setOriginalStaffEntry={setOriginalStaffEntry}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              setShowAddStaff={setShowAddStaff}
              toggleStaffTherapy={toggleStaffTherapy}
              requestDelete={requestDelete}
              setStaff={setStaff}
            />
          </TabsContent>

          {/* Rooms Tab */}
          <TabsContent value="rooms" data-testid="tabpanel-rooms">
            <RoomsTab
              roomsList={roomsList}
              searchRooms={searchRooms}
              setSearchRooms={setSearchRooms}
              visibleRoomsRows={visibleRoomsRows}
              setVisibleRoomsRows={setVisibleRoomsRows}
              roomsTotalRef={roomsTotalRef}
              editingRoomId={editingRoomId}
              setEditingRoomId={setEditingRoomId}
              originalRoomEntry={originalRoomEntry}
              setOriginalRoomEntry={setOriginalRoomEntry}
              isMobile={isMobile}
              compareRoomNames={compareRoomNames}
              amenityOptions={amenityOptions}
              roomAmenityDrafts={roomAmenityDrafts}
              setRoomAmenityDrafts={setRoomAmenityDrafts}
              toggleRoomAmenity={toggleRoomAmenity}
              addAmenityToRoom={addAmenityToRoom}
              requestDelete={requestDelete}
              API_BASE={API_BASE}
              setRoomsList={setRoomsList}
              setShowAddRoom={setShowAddRoom}
            />
          </TabsContent>

          {/* Therapies Tab */}
          <TabsContent value="therapies" data-testid="tabpanel-therapies">
            <TherapiesTab
              therapies={therapies}
              searchTherapies={searchTherapies}
              setSearchTherapies={setSearchTherapies}
              visibleTherapiesRows={visibleTherapiesRows}
              setVisibleTherapiesRows={setVisibleTherapiesRows}
              therapiesTotalRef={therapiesTotalRef}
              editingTherapyId={editingTherapyId}
              setEditingTherapyId={setEditingTherapyId}
              originalTherapyEntry={originalTherapyEntry}
              setOriginalTherapyEntry={setOriginalTherapyEntry}
              amenityOptions={amenityOptions}
              therapyAmenityDrafts={therapyAmenityDrafts}
              setTherapyAmenityDrafts={setTherapyAmenityDrafts}
              toggleTherapyAmenity={toggleTherapyAmenity}
              addAmenityToTherapy={addAmenityToTherapy}
              setTherapies={setTherapies}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              isMobile={isMobile}
              requestDelete={requestDelete}
              setShowAddTherapy={setShowAddTherapy}
            />
          </TabsContent>

          <TabsContent value="timeoff" data-testid="tabpanel-timeoff">
            <TimeOffTab
              timeOffs={timeOffs}
              searchHolidays={searchHolidays}
              setSearchHolidays={setSearchHolidays}
              holidayTypeFilter={holidayTypeFilter}
              setHolidayTypeFilter={setHolidayTypeFilter}
              holidayViewMode={holidayViewMode}
              setHolidayViewMode={setHolidayViewMode}
              holidayRecurringFilter={holidayRecurringFilter}
              setHolidayRecurringFilter={setHolidayRecurringFilter}
              holidayFullDayFilter={holidayFullDayFilter}
              setHolidayFullDayFilter={setHolidayFullDayFilter}
              holidaySelectedDate={holidaySelectedDate}
              setHolidaySelectedDate={setHolidaySelectedDate}
              visibleTimeOffRows={visibleTimeOffRows}
              timeoffTotalRef={timeoffTotalRef}
              editingTimeOffId={editingTimeOffId}
              startEditTimeOff={startEditTimeOff}
              cancelEditTimeOff={cancelEditTimeOff}
              saveEditTimeOff={saveEditTimeOff}
              setTimeOffs={setTimeOffs}
              staff={staff}
              roomsList={roomsList}
              therapies={therapies}
              patients={patients}
              staffNameById={staffNameById}
              roomNameById={roomNameById}
              therapyNameById={therapyNameById}
              patientNameById={patientNameById}
              isFullDay={isFullDay}
              weeklyLabel={weeklyLabel}
              toLocalInput={toLocalInput}
              requestDelete={requestDelete}
              setShowAddTimeOff={setShowAddTimeOff}
            />
          </TabsContent>

          <TabsContent value="events" data-testid="tabpanel-events">
            <EventsTab
              events={events}
              visibleEventsRows={visibleEventsRows}
              eventsTotalRef={eventsTotalRef}
              editingEventId={editingEventId}
              setEditingEventId={setEditingEventId}
              originalEvent={originalEvent}
              setOriginalEvent={setOriginalEvent}
              scheduleEventAutosave={scheduleEventAutosave}
              roomsList={roomsList}
              staff={staff}
              patients={patients}
              amenityOptions={amenityOptions}
              eventAmenityDrafts={eventAmenityDrafts}
              setEventAmenityDrafts={setEventAmenityDrafts}
              toggleEventAmenity={toggleEventAmenity}
              addAmenityToEvent={addAmenityToEvent}
              isMobile={isMobile}
              staffNameById={staffNameById}
              patientNameById={patientNameById}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              setShowAddEvent={setShowAddEvent}
              setEvents={setEvents}
            />
          </TabsContent>

          <TabsContent value="ailments" data-testid="tabpanel-ailments">
            <Ailments />
          </TabsContent>

          <TabsContent value="settings" data-testid="tabpanel-settings">
            <Settings />
          </TabsContent>

          <TabsContent value="diet" className="space-y-6" forceMount>
            <DietTab
              patients={patients}
              setPatients={setPatients}
              dietTemplates={dietTemplates}
              setDietTemplates={setDietTemplates}
              dietDraft={dietDraft}
              setDietDraft={setDietDraft}
              selectedDietTemplateId={selectedDietTemplateId}
              setSelectedDietTemplateId={setSelectedDietTemplateId}
              dietSchedules={dietSchedules}
              setDietSchedules={setDietSchedules}
              patientTherapyTags={patientTherapyTags}
              setPatientTherapyTags={setPatientTherapyTags}
              showAddDietDialog={showAddDietDialog}
              setShowAddDietDialog={setShowAddDietDialog}
              addDialogSegments={addDialogSegments}
              setAddDialogSegments={setAddDialogSegments}
              addDialogPatientId={addDialogPatientId}
              setAddDialogPatientId={setAddDialogPatientId}
              addDialogPatientStays={addDialogPatientStays}
              setAddDialogPatientStays={setAddDialogPatientStays}
              addDialogPatientAppointments={addDialogPatientAppointments}
              setAddDialogPatientAppointments={setAddDialogPatientAppointments}
              assignmentSegments={assignmentSegments}
              setAssignmentSegments={setAssignmentSegments}
              assignmentTemplateId={assignmentTemplateId}
              setAssignmentTemplateId={setAssignmentTemplateId}
              assignmentTherapyIds={assignmentTherapyIds}
              setAssignmentTherapyIds={setAssignmentTherapyIds}
              editAssignmentPatientId={editAssignmentPatientId}
              setEditAssignmentPatientId={setEditAssignmentPatientId}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              fetchJsonWithTimeout={fetchJsonWithTimeout}
              therapies={therapies}
              therapyNameById={therapyNameById}
              ymdInTZ={ymdInTZ}
              segmentDatePickerOpen={segmentDatePickerOpen}
              setSegmentDatePickerOpen={setSegmentDatePickerOpen}
              templateSearch={templateSearch}
              setTemplateSearch={setTemplateSearch}
              templatePickerOpenIdx={templatePickerOpenIdx}
              setTemplatePickerOpenIdx={setTemplatePickerOpenIdx}
              resetAddDialog={resetAddDialog}
              addDialogPatientOpen={addDialogPatientOpen}
              setAddDialogPatientOpen={setAddDialogPatientOpen}
              setAddPatientDietPlanLabel={(label: string) => setNewPatient((prev) => ({ ...prev, dietPlan: label }))}
              dietTabActive={activeTab === 'diet'}
            />
          </TabsContent>

  
  <TabsContent value="patients">
    <PatientsTab
      patients={patients}
      searchPatients={searchPatients}
      setSearchPatients={setSearchPatients}
      showAddPatient={showAddPatient}
      setShowAddPatient={setShowAddPatient}
      onShowInfo={showPatientInfo}
      onEditDiet={(patientId) => {
        const pid = String(patientId);
        setAddDialogPatientId(pid);
        setShowAddDietDialog(true);
        (async () => {
          try {
            const [stays, appts] = await Promise.all([
              fetchJsonWithTimeout<{ start_date: string; end_date: string }[]>(`${API_BASE}/patients/${pid}/stays`),
              fetchJsonWithTimeout<any[]>(`${API_BASE}/appointments?patient_id=${pid}`),
            ]);
            const listStays = Array.isArray(stays) ? stays : [];
            setAddDialogPatientStays(listStays);
            setAddDialogPatientAppointments(Array.isArray(appts) ? appts : []);
            const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate())}`;
            let startISO = '';
            let endISO = '';
            if (listStays.length > 0) {
              startISO = listStays.map(s => s.start_date).sort()[0] || '';
              endISO = listStays.map(s => s.end_date).sort().slice(-1)[0] || '';
            } else {
              const found = patients.find((x) => String(x.id) === pid);
              startISO = (found)?.actualStart || '';
              endISO = (found)?.actualEnd || '';
            }
            try {
              const existing: any[] = await fetchJsonWithTimeout(`${API_BASE}/dietplans/segments?patient_id=${pid}`);
              if (Array.isArray(existing) && existing.length > 0) {
                const valid = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
                const segments = existing.map((x: any) => ({
                  start: valid(x.start_date) ? x.start_date : '',
                  end: valid(x.end_date) ? x.end_date : '',
                  templateId: '',
                  therapyIds: Array.isArray(x.therapy_ids) ? x.therapy_ids.map(String) : [],
                  expanded: false,
                  locked: true,
                  saveAsTemplate: false,
                  customTemplate: x.template ? {
                    name: x.template.name || x.template_label || '',
                    description: x.template.description || '',
                    breakfast: x.template.breakfast || '',
                    lunch: x.template.lunch || '',
                    dinner: x.template.dinner || '',
                    snacks: x.template.snacks || '',
                    medication: x.template.medication || '',
                  } : (x.template_label ? { name: x.template_label } : undefined),
                }));
                setAddDialogSegments(segments);
              } else {
                const segStart = startISO ? toIso(new Date(startISO)) : '';
                const segEnd = endISO ? toIso(new Date(endISO)) : '';
                setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: [], expanded: false, locked: true, saveAsTemplate: false }]);
              }
            } catch {
              const segStart = startISO ? toIso(new Date(startISO)) : '';
              const segEnd = endISO ? toIso(new Date(endISO)) : '';
              setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: [], expanded: false, locked: true, saveAsTemplate: false }]);
            }
          } catch {
            setAddDialogPatientStays([]);
            setAddDialogPatientAppointments([]);
          }
        })();
      }}
    />
  </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <AutoAssignDialog open={showAutoAssign} onOpenChange={setShowAutoAssign} defaultDateISO={ymdInTZ(currentDate)} onAssigned={async (dates) => {
        const d = dates[0];
        if (d) {
          setViewType("day");
          setCurrentDate(new Date(d));
          for (const iso of dates) {
            await refreshAppointmentsForDate(iso, true);
          }
        }
      }} />
      <VerifyDialog
        open={showVerify}
        onOpenChange={setShowVerify}
        apiBase={API_BASE}
        currentDate={currentDate}
        patients={patients.map(p => ({ id: p.id, name: p.name, gender: p.gender }))}
        staff={staff.map(s => ({ id: s.id, name: s.name, gender: s.gender, specializations: s.specializations, schedule: s.schedule, status: s.status }))}
        rooms={roomsList.map(r => ({ id: r.id, name: r.name, amenities: r.amenities, status: r.status }))}
        therapies={therapies.map(t => ({ id: String(t.id), name: t.name, required_amenities: t.amenities, duration_minutes: t.duration, requires_gender_match: t.genderMatch }))}
        timeoff={timeOffs.map(h => ({ id: h.id, entity_type: (h.type === 'Center' ? 'center' : h.type === 'Staff' ? 'staff' : h.type === 'Room' ? 'room' : h.type === 'Therapy' ? 'therapy' : 'patient'), entity_id: h.entity, date: h.date, start_date: h.startDate, end_date: h.endDate, start_time: h.startTime, end_time: h.endTime, recurrence: h.recurrence, weekdays: h.weekdays }))}
        onOpenAppointment={(a) => {
          const roomInfo = roomsList.find((r) => r.id === a.room_id);
          const patientInfo = patients.find((p) => p.id === a.patient_id);
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
            staff: staff.find((s) => s.id === a.staff_id)?.name || a.staff_id,
            room: roomInfo?.name || a.room_id,
            roomAmenities: roomInfo?.amenities || [],
            patientDetails: patientInfo,
          });
        }}
        onRefresh={async (datesISO) => {
          for (const iso of datesISO) {
            await refreshAppointmentsForDate(iso, true);
          }
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
      <Dialog open={showAddPatient} onOpenChange={(open) => { setShowAddPatient(open); if (!open) { setNewPatient({ id: '', name: '', phone: '', email: '', gender: 'Male', dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: '', dietPlan: '', actualStart: '', actualEnd: '' }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Patient</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Name</Label>
            <Input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} />
            <Label>Phone</Label>
            <Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} />
            <Label>Email</Label>
            <Input value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} />
            <Label>Gender</Label>
            <Select value={newPatient.gender} onValueChange={(v: string) => setNewPatient({ ...newPatient, gender: v })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
            <Label>Start</Label>
            <Input type="datetime-local" value={newPatient.actualStart || ""} onChange={(e) => setNewPatient({ ...newPatient, actualStart: e.target.value })} />
            <Label>End</Label>
            <Input type="datetime-local" value={newPatient.actualEnd || ""} onChange={(e) => setNewPatient({ ...newPatient, actualEnd: e.target.value })} />
            <Label>Diet Plan</Label>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground truncate max-w-[60%]">
                {newPatient.dietPlan || 'No diet plan selected'}
              </div>
              <Button
                size="sm"
                className="h-8 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setAddDialogPatientId(null);
                  setAddDialogSegments((prev) => prev.length > 0 ? prev : [{ start: '', end: '', templateId: '', therapyIds: [], expanded: false, locked: true }]);
                  setShowAddDietDialog(true);
                }}
                aria-label="Edit Diet Plan"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowAddPatient(false); setNewPatient({ id: '', name: '', phone: '', email: '', gender: 'Male', dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: '', dietPlan: '', actualStart: '', actualEnd: '' }); }}>Cancel</Button>
              <Button onClick={async () => {
                const payload: { name: string; gender: 'male'|'female'|'other'; phone: string; email?: string; diet_plan?: string; available_from?: string; available_to?: string } = {
                  name: newPatient.name,
                  gender: newPatient.gender.toLowerCase() as 'male'|'female'|'other',
                  phone: newPatient.phone || '',
                  email: newPatient.email || undefined,
                  diet_plan: newPatient.dietPlan || undefined,
                  available_from: newPatient.actualStart || undefined,
                  available_to: newPatient.actualEnd || undefined,
                };
                try {
                  const res = await fetch(`${API_BASE}/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setPatients((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      phone: created.phone || '',
                      email: created.email || '',
                      gender: created.gender === 'male' ? 'Male' : created.gender === 'female' ? 'Female' : 'Other',
                      dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: created.medical_notes || '', dietPlan: created.diet_plan || '', actualStart: created.available_from || '', actualEnd: created.available_to || '',
                    },
                  ]);
                  setShowAddPatient(false);
                  setNewPatient({ id: '', name: '', phone: '', email: '', gender: 'Male', dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: '', dietPlan: '', actualStart: '', actualEnd: '' });
                } catch {
                  toast.error('Failed to save patient');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!infoPatient} onOpenChange={(open) => { if (!open) { setInfoPatient(null); setInfoEditing(false); } }}>
        <DialogContent hideClose className="max-w-[92vw] sm:max-w-md md:max-w-2xl p-3 sm:p-5 gap-2 sm:gap-4 max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Patient Details</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Button variant="outline" size="icon" className="h-8 w-8 justify-self-start" aria-label="Close" onClick={() => { setInfoPatient(null); setInfoEditing(false); }}>
              <X className="w-4 h-4" />
            </Button>
            <div />
            <div className="justify-self-end"></div>
          </div>
          {infoPatient && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={infoEditing ? (infoDraft?.name || '') : infoPatient.name} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, name: e.target.value } : prev)} />
                <Label>Phone</Label>
                <Input value={infoEditing ? (infoDraft?.phone || '') : (infoPatient.phone || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, phone: e.target.value } : prev)} />
                <Label>Date of Birth</Label>
                <Input type="date" value={infoEditing ? (infoDraft?.dob || '') : (infoPatient.dob || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, dob: e.target.value } : prev)} />
                <Label>Email</Label>
                <Input value={infoEditing ? (infoDraft?.email || '') : (infoPatient.email || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, email: e.target.value } : prev)} />
                <Label>Emergency Contact</Label>
                <Input value={infoEditing ? (infoDraft?.emergencyContact || '') : (infoPatient.emergencyContact || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, emergencyContact: e.target.value } : prev)} />
                <Label>Emergency Phone</Label>
                <Input value={infoEditing ? (infoDraft?.emergencyPhone || '') : (infoPatient.emergencyPhone || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, emergencyPhone: e.target.value } : prev)} />
              </div>
              <div className="space-y-2">
                <Label>Medical Notes</Label>
                <Input value={infoEditing ? (infoDraft?.medicalNotes || '') : (infoPatient.medicalNotes || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, medicalNotes: e.target.value } : prev)} />
                <Label>Diet Plan</Label>
                <Input value={infoEditing ? (infoDraft?.dietPlan || '') : (infoPatient.dietPlan || '')} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, dietPlan: e.target.value } : prev)} />
                <Label>Availability Start</Label>
                <Input type="datetime-local" value={infoEditing ? toLocalInput(infoDraft?.actualStart) : toLocalInput(infoPatient.actualStart)} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, actualStart: e.target.value } : prev)} />
                <div className="text-xs text-muted-foreground">{infoEditing ? (infoDraft?.actualStart ? toLocalDisplayNoSeconds(infoDraft.actualStart) : '') : (infoPatient.actualStart ? toLocalDisplayNoSeconds(infoPatient.actualStart) : '')}</div>
                <Label>Availability End</Label>
                <Input type="datetime-local" value={infoEditing ? toLocalInput(infoDraft?.actualEnd) : toLocalInput(infoPatient.actualEnd)} onChange={(e) => infoEditing && setInfoDraft((prev) => prev ? { ...prev, actualEnd: e.target.value } : prev)} />
                <div className="text-xs text-muted-foreground">{infoEditing ? (infoDraft?.actualEnd ? toLocalDisplayNoSeconds(infoDraft.actualEnd) : '') : (infoPatient.actualEnd ? toLocalDisplayNoSeconds(infoPatient.actualEnd) : '')}</div>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 pt-2">
                <div>
                  <p className="text-sm font-medium">Diet Plans</p>
                  <div className="mt-1 space-y-1">
                    {infoDietPlans.map((dp) => (
                      <div key={dp.id} className="text-xs">
                        <span className="font-semibold">{String(dp.meal_time)}</span> • <span>{dp.description}</span>
                      </div>
                    ))}
                    {infoDietPlans.length === 0 && <p className="text-xs text-muted-foreground">No diet plans</p>}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Appointments</p>
                  <div className="mt-1 space-y-1">
                    {infoAppointments.map((a) => (
                      <div key={a.id} className="text-xs">
                        <span>{new Date(a.scheduled_date).toLocaleDateString('en-IN')}</span> • <span>{a.start_time}</span> • <span>{therapyNameById[String(a.therapy_id)] || a.therapy_id}</span>
                      </div>
                    ))}
                    {infoAppointments.length === 0 && <p className="text-xs text-muted-foreground">No appointments</p>}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Stays</p>
                  <div className="mt-1 space-y-1">
                    {infoStays.map((s) => (
                      <div key={s.id} className="text-xs">
                        <span>{new Date(s.start_date).toLocaleDateString('en-IN')}</span> – <span>{new Date(s.end_date).toLocaleDateString('en-IN')}</span> • <span>{String(s.duration_days)} days</span>
                      </div>
                    ))}
                    {infoStays.length === 0 && <p className="text-xs text-muted-foreground">No stays</p>}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                {infoEditing ? (
                  <>
                    <Button variant="outline" onClick={() => { setInfoEditing(false); setInfoDraft(infoPatient ? { ...infoPatient } : null); }}>Cancel</Button>
                    <Button onClick={async () => {
                      if (!infoDraft) return;
                      try {
                        const payload = { phone: infoDraft.phone || undefined, email: infoDraft.email || undefined, emergency_contact: infoDraft.emergencyContact || undefined, emergency_phone: infoDraft.emergencyPhone || undefined, medical_notes: infoDraft.medicalNotes || undefined, diet_plan: infoDraft.dietPlan || undefined, available_from: infoDraft.actualStart || undefined, available_to: infoDraft.actualEnd || undefined, date_of_birth: infoDraft.dob || undefined };
                        const res = await fetch(`${API_BASE}/patients/${infoDraft.id}` , { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                        const updated = await res.json();
                        setPatients((prev) => prev.map((x) => x.id === infoDraft.id ? { ...x, phone: updated.phone || '', email: updated.email || '', emergencyContact: updated.emergency_contact || '', emergencyPhone: updated.emergency_phone || '', medicalNotes: updated.medical_notes || '', dietPlan: updated.diet_plan || '', actualStart: updated.available_from || '', actualEnd: updated.available_to || '', dob: updated.date_of_birth ? new Date(updated.date_of_birth).toISOString().slice(0,10) : '' } : x));
                        setInfoPatient((prev) => prev ? { ...prev, phone: updated.phone || '', email: updated.email || '', emergencyContact: updated.emergency_contact || '', emergencyPhone: updated.emergency_phone || '', medicalNotes: updated.medical_notes || '', dietPlan: updated.diet_plan || '', actualStart: updated.available_from || '', actualEnd: updated.available_to || '', dob: updated.date_of_birth ? new Date(updated.date_of_birth).toISOString().slice(0,10) : '' } : prev);
                        toast.success('Patient updated');
                        setInfoEditing(false);
                      } catch {
                        toast.error('Failed to update patient');
                      }
                    }}>Save</Button>
                  </>
                ) : (
                  <Button onClick={() => setInfoEditing(true)}>Edit</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showAddStaff} onOpenChange={setShowAddStaff}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Staff</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Name</Label>
            <Input value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
            <Label>Gender</Label>
            <Select value={newStaff.gender} onValueChange={(v) => setNewStaff({ ...newStaff, gender: v })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
            <Label>Specializations (comma-separated)</Label>
            <Input value={newStaff.specializationsText} onChange={(e) => setNewStaff({ ...newStaff, specializationsText: e.target.value })} />
            <Label>Phone</Label>
            <Input value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} />
            <Label>Schedule</Label>
            <Input value={newStaff.schedule} onChange={(e) => setNewStaff({ ...newStaff, schedule: e.target.value })} />
            <Label>Status</Label>
            <Select value={newStaff.status} onValueChange={(v) => setNewStaff({ ...newStaff, status: v as 'Active'|'Inactive' })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddStaff(false)}>Cancel</Button>
              <Button onClick={async () => {
                const specsInput = newStaff.specializationsText.split(',').map((s) => s.trim()).filter(Boolean);
                const specIds = specsInput.map((name) => therapies.find((t) => t.name === name)?.id || name);
                const payload: { name: string; gender: 'male'|'female'|'other'; specializations: (string | number)[]; phone: string; weekly_schedule: Record<string, unknown>; is_active: boolean } = { name: newStaff.name, gender: newStaff.gender.toLowerCase() as 'male'|'female'|'other', specializations: specIds, phone: newStaff.phone || '', weekly_schedule: {}, is_active: newStaff.status === 'Active' };
                try {
                  const res = await fetch(`${API_BASE}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setStaff((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      gender: created.gender === 'male' ? 'Male' : created.gender === 'female' ? 'Female' : 'Other',
                      specializations: (created.specializations || []).map((id: string) => therapies.find((k) => k.id === id)?.name ?? id),
                      phone: created.phone || '',
                      schedule: '',
                      status: (typeof created.is_active === 'boolean' ? (created.is_active ? 'Active' : 'Inactive') : newStaff.status),
                    },
                  ]);
                  setShowAddStaff(false);
                  setNewStaff({ name: '', gender: 'Female', specializationsText: '', phone: '', schedule: '', status: 'Active' });
                } catch {
                  toast.error('Failed to save staff');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Room</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Room Name</Label>
            <Input value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} />
            <Label>Amenities (comma-separated)</Label>
            <Input value={newRoom.amenitiesText} onChange={(e) => setNewRoom({ ...newRoom, amenitiesText: e.target.value })} />
            <Label>Schedule</Label>
            <Input value={newRoom.schedule} onChange={(e) => setNewRoom({ ...newRoom, schedule: e.target.value })} />
            <Label>Status</Label>
            <Select value={newRoom.status} onValueChange={(v) => setNewRoom({ ...newRoom, status: v })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddRoom(false)}>Cancel</Button>
              <Button onClick={async () => {
                const amenities = newRoom.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean);
                const payload: { name: string; amenities: string[]; weekly_schedule: Record<string, unknown> } = { name: newRoom.name, amenities, weekly_schedule: {} };
                try {
                  const res = await fetch(`${API_BASE}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setRoomsList((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      amenities: created.amenities || [],
                      schedule: newRoom.schedule,
                      status: created.is_active ? 'Active' : 'Maintenance',
                    },
                  ]);
                  setShowAddRoom(false);
                  setNewRoom({ name: '', amenitiesText: '', schedule: '', status: 'Active' });
                } catch {
                  toast.error('Failed to save room');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTherapy} onOpenChange={setShowAddTherapy}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Therapy</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Therapy Name</Label>
            <Input value={newTherapy.name} onChange={(e) => setNewTherapy({ ...newTherapy, name: e.target.value })} />
            <Label>Duration (min)</Label>
            <Input type="number" min={15} value={String(newTherapy.duration)} onChange={(e) => setNewTherapy({ ...newTherapy, duration: Number(e.target.value) })} />
            <Label>Required Amenities (comma-separated)</Label>
            <Input value={newTherapy.amenitiesText} onChange={(e) => setNewTherapy({ ...newTherapy, amenitiesText: e.target.value })} />
            <Label>Gender Match Required</Label>
            <Select value={newTherapy.genderMatch ? 'true' : 'false'} onValueChange={(v) => setNewTherapy({ ...newTherapy, genderMatch: v === 'true' })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Required</SelectItem>
                <SelectItem value="false">Not Required</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddTherapy(false)}>Cancel</Button>
              <Button onClick={async () => {
                const required_amenities = newTherapy.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean);
                const payload: { name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean } = { name: newTherapy.name, required_amenities, duration_minutes: newTherapy.duration, requires_gender_match: newTherapy.genderMatch };
                try {
                  const res = await fetch(`${API_BASE}/therapies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setTherapies((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      duration: created.duration_minutes,
                      amenities: created.required_amenities || [],
                      genderMatch: !!created.requires_gender_match,
                    },
                  ]);
                  setShowAddTherapy(false);
                  setNewTherapy({ name: '', duration: 60, amenitiesText: '', genderMatch: false });
                } catch {
                  toast.error('Failed to save therapy');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTimeOff} onOpenChange={setShowAddTimeOff}>
        <DialogContent className="max-w-sm p-3">
          <DialogHeader>
            <DialogTitle className="text-lg">Add TimeOff</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            <Label>Type</Label>
            <Select value={newTimeOff.type} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, type: v as "Center" | "Staff" | "Room" | "Therapy" | "Patient", entity: v === 'Center' ? 'All' : '' })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Center">Center</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="Room">Room</SelectItem>
                <SelectItem value="Therapy">Therapy</SelectItem>
                <SelectItem value="Patient">Patient</SelectItem>
              </SelectContent>
            </Select>
            <Label>Entity</Label>
            {newTimeOff.type === 'Center' ? (
              <Input className="h-8" value="All" readOnly />
            ) : newTimeOff.type === 'Staff' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : newTimeOff.type === 'Room' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {roomsList.map((r) => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : newTimeOff.type === 'Therapy' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select therapy" /></SelectTrigger>
                <SelectContent>
                  {therapies.map((t) => (<SelectItem key={String(t.id ?? t.name)} value={String(t.id ?? t.name)}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            <Label>Full day</Label>
            <Select value={newTimeOff.fullDay ? 'yes' : 'no'} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, fullDay: v === 'yes' })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
            <Label>Start</Label>
            {newTimeOff.fullDay ? (
              <Input type="date" className="h-8" value={newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, date: e.target.value })} />
            ) : (
              <Input type="datetime-local" step="60" className="h-8" value={newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, date: e.target.value })} />
            )}
            <Label>End</Label>
            {newTimeOff.fullDay ? (
              <Input type="date" className="h-8" value={newTimeOff.endDate || newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })} />
            ) : (
              <Input type="datetime-local" step="60" className="h-8" value={newTimeOff.endDate || newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })} />
            )}
            <Label>Recurring</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={newTimeOff.recurrence || 'none'} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, recurrence: (v === 'none' ? undefined : 'weekly'), weekdays: v === 'weekly' ? (newTimeOff.weekdays || ['sunday']) : undefined })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {newTimeOff.recurrence === 'weekly' && (
                <div className="flex gap-1 flex-wrap">
                  {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                    const selected = (newTimeOff.weekdays || []).includes(wd);
                    return (
                      <Button key={wd} type="button" variant={selected ? 'default' : 'outline'} className="h-7 px-2 py-0 text-xs"
                        onClick={() => {
                          const set = new Set(newTimeOff.weekdays || []);
                          if (set.has(wd)) set.delete(wd); else set.add(wd);
                          setNewTimeOff({ ...newTimeOff, weekdays: Array.from(set) as UiTimeOff['weekdays'] });
                        }}
                      >
                        {wd.slice(0,3).toUpperCase()}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
            <Label htmlFor="newTimeOffDescription">Description</Label>
            <Input id="newTimeOffDescription" className="h-8" value={newTimeOff.description} onChange={(e) => setNewTimeOff({ ...newTimeOff, description: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddTimeOff(false)}>Cancel</Button>
              <Button onClick={async () => {
                if (newTimeOff.type !== 'Center' && !newTimeOff.entity) {
                  toast.error('Select an entity for the chosen type');
                  return;
                }
                const entity_type = newTimeOff.type.toLowerCase();
                const tempId = `temp-${Date.now()}`;
                const baseStart = newTimeOff.date;
                const baseEnd = newTimeOff.endDate || newTimeOff.date;
                const startIso = newTimeOff.fullDay ? setTimeHM(baseStart, 9, 0) : baseStart;
                const endIso = newTimeOff.fullDay ? setTimeHM(baseEnd, 18, 0) : baseEnd;
                const optimistic: UiTimeOff = { id: tempId, startDate: startIso, endDate: endIso, recurrence: newTimeOff.recurrence, weekdays: newTimeOff.weekdays as UiTimeOff['weekdays'], type: newTimeOff.type, entity: newTimeOff.type === 'Center' ? 'All' : (newTimeOff.entity || ''), description: newTimeOff.description };
                setTimeOffs((prev) => [...prev, optimistic]);
                setShowAddTimeOff(false);
                setNewTimeOff({ date: '', endDate: '', type: 'Center', entity: '', fullDay: false, description: '', recurrence: undefined, weekdays: undefined });
                toast.success('Time off saved');
                try {
                  const res = await fetch(`${API_BASE}/timeoff`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      entity_type,
                      entity_id: optimistic.entity === 'All' ? null : (optimistic.entity || null),
                      start_date: optimistic.startDate,
                      end_date: optimistic.endDate,
                      start_time: newTimeOff.fullDay ? '09:00' : toHHMM(optimistic.startDate),
                      end_time: newTimeOff.fullDay ? '18:00' : toHHMM(optimistic.endDate),
                      recurrence: optimistic.recurrence,
                      weekdays: optimistic.weekdays,
                      description: optimistic.description,
                    }),
                  });
                  const created = await res.json();
                  setTimeOffs((prev) => prev.map((h) => h.id === tempId ? { id: created.id, startDate: created.start_date ? new Date(created.start_date).toISOString() : undefined, endDate: created.end_date ? new Date(created.end_date).toISOString() : undefined, recurrence: created.recurrence || undefined, weekdays: created.weekdays || undefined, type: optimistic.type, entity: created.entity_id ?? optimistic.entity, description: created.description ?? optimistic.description } : h));
                } catch {
                  toast.error('Failed to save time off');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
