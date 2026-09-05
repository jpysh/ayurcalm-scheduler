import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, Home, Sparkles, Edit, Trash2, X, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

interface Appointment {
  id: number;
  time: string;
  patient: string;
  therapy: string;
  staff: string;
  room: string;
  duration?: number;
  session?: string;
  notes?: string;
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
}

interface AppointmentDialogProps {
  appointment: (Appointment & { scheduledDate?: string; duration?: number; patientId?: string; therapyId?: string; staffId?: string; roomId?: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAssign?: () => void;
  onChanged?: () => void;
}

export const AppointmentDialog = ({ appointment, open, onOpenChange, onOpenAssign, onChanged }: AppointmentDialogProps) => {
  const [isEditing, setIsEditing] = useState(false);
  type ApiPatient = { id: string; name: string; gender?: string; phone?: string };
  type ApiTherapy = { id: string; name: string; duration_minutes?: number; required_amenities?: string[] };
  type ApiRoom = { id: string; name: string; amenities?: string[] };
  type ApiStaff = { id: string; name: string };
  type ApiAppointmentSimple = { id: string | number; start_time: string; duration_minutes: number };
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [therapies, setTherapies] = useState<ApiTherapy[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [staff, setStaff] = useState<ApiStaff[]>([]);
  const [form, setForm] = useState({
    patientId: appointment?.patientId || "",
    therapyId: appointment?.therapyId || "",
    staffId: appointment?.staffId || "",
    roomId: appointment?.roomId || "",
    duration: appointment?.duration || 60,
    time: appointment?.time || "09:00",
  });
  const [patientQuery, setPatientQuery] = useState("");
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false);
  const [deleteHintShown, setDeleteHintShown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const load = async () => {
      const [p, t, r, s] = await Promise.all([
        fetch(`${API_BASE}/patients`).then(res => res.json()).catch(() => []),
        fetch(`${API_BASE}/therapies`).then(res => res.json()).catch(() => []),
        fetch(`${API_BASE}/rooms`).then(res => res.json()).catch(() => []),
        fetch(`${API_BASE}/staff`).then(res => res.json()).catch(() => []),
      ]);
      setPatients(p);
      setTherapies(t);
      setRooms(r);
      setStaff(s);
    };
    load();
  }, []);
  useEffect(() => {
    if (!appointment) return;
    setForm({
      patientId: appointment.patientId || "",
      therapyId: appointment.therapyId || "",
      staffId: appointment.staffId || "",
      roomId: appointment.roomId || "",
      duration: appointment.duration || 60,
      time: appointment.time,
    });
  }, [appointment]);
  const patientsSorted = useMemo(() => [...patients].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [patients]);
  const therapiesSorted = useMemo(() => [...therapies].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [therapies]);
  const staffSorted = useMemo(() => [...staff].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [staff]);
  const roomsSorted = useMemo(() => [...rooms].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [rooms]);
  useEffect(() => {
    if (form.therapyId) {
      const tt = therapies.find((x) => x.id === form.therapyId);
      if (tt?.duration_minutes) setForm(f => ({ ...f, duration: tt.duration_minutes }));
    }
  }, [form.therapyId, therapies]);
  const selectedRoomAmenities = useMemo(() => {
    const rr = rooms.find((x) => x.id === form.roomId);
    return rr?.amenities || [];
  }, [form.roomId, rooms]);
  const selectedPatient = useMemo(() => patients.find((x) => x.id === form.patientId), [patients, form.patientId]);
  const timeToMinutes = (t:string) => {
    const [hh,mm] = t.split(":").map(Number);
    return hh*60+mm;
  };
  const overlaps = (startA:number, durA:number, startB:number, durB:number) => {
    const endA = startA+durA;
    const endB = startB+durB;
    return startA < endB && startB < endA;
  };
  const checkAvailability = async () => {
    const dateIso = appointment.scheduledDate || new Date().toISOString().slice(0,10);
    const [staffAppts, roomAppts] = await Promise.all([
      form.staffId ? fetch(`${API_BASE}/appointments?date=${dateIso}&staff_id=${form.staffId}`).then(r=>r.json()).catch(()=>[]) : Promise.resolve([] as ApiAppointmentSimple[]),
      form.roomId ? fetch(`${API_BASE}/appointments?date=${dateIso}&room_id=${form.roomId}`).then(r=>r.json()).catch(()=>[]) : Promise.resolve([] as ApiAppointmentSimple[]),
    ]);
    const startM = timeToMinutes(form.time);
    const conflictStaff = (staffAppts as ApiAppointmentSimple[]).some((a) => a.id !== (appointment?.id ?? -1) && overlaps(startM, form.duration, timeToMinutes(a.start_time), a.duration_minutes));
    const conflictRoom = (roomAppts as ApiAppointmentSimple[]).some((a) => a.id !== (appointment?.id ?? -1) && overlaps(startM, form.duration, timeToMinutes(a.start_time), a.duration_minutes));
    return { conflictStaff, conflictRoom };
  };
  const saveEdits = async () => {
    const conflicts = await checkAvailability();
    if (conflicts.conflictStaff || conflicts.conflictRoom) {
      alert("Selected staff or room unavailable at this time");
      return;
    }
    const body: Record<string, unknown> = {
      duration_minutes: form.duration,
      staff_id: form.staffId || null,
      room_id: form.roomId || null,
    };
    if (form.patientId) body.patient_id = form.patientId;
    if (form.therapyId) body.therapy_id = form.therapyId;
    if (!appointment) return;
    await fetch(`${API_BASE}/appointments/${appointment.id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(body) });
    setIsEditing(false);
    if (onChanged) onChanged();
  };
  const deleteAppointment = async () => {
    if (!appointment) return;
    await fetch(`${API_BASE}/appointments/${appointment.id}`, { method: "DELETE", headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
    onOpenChange(false);
    if (onChanged) onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-[92vw] sm:max-w-md md:max-w-2xl p-3 sm:p-5 gap-2 sm:gap-4 max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="sr-only">Appointment</DialogTitle>
        </DialogHeader>
        {appointment ? (
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Button variant="outline" size="icon" className="h-8 w-8 justify-self-start" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
          {isEditing ? (
            <Button size="icon" className="h-8 w-8 justify-self-center" aria-label="Save" onClick={saveEdits}>
              <Check className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="icon" className="h-8 w-8 justify-self-center" aria-label="Edit" onClick={() => setIsEditing(true)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
          {isEditing ? (
            <Button variant="destructive" size="icon" className="h-8 w-8 justify-self-end" aria-label="Cancel Edit" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 justify-self-end"
              aria-label="Delete"
              onClick={() => {
                if (!confirmDelete) {
                  if (!deleteHintShown) {
                    toast.message("Double click to delete");
                    setDeleteHintShown(true);
                    setTimeout(() => setDeleteHintShown(false), 3000);
                  }
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                  return;
                }
                setConfirmDelete(false);
                deleteAppointment();
              }}
              title="Double-click to delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        ) : null}
        
        
        <div className="space-y-3 sm:space-y-5">
          {appointment ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-4">
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Patient</span>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Popover open={patientPopoverOpen} onOpenChange={setPatientPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 min-w-[8rem] justify-between">
                        <span className="truncate">{selectedPatient?.name || "Select patient"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[90vw] sm:w-72 p-0" sideOffset={6} align="start">
                      <Command>
                        <CommandInput value={patientQuery} onValueChange={setPatientQuery} placeholder="Search patient" className="h-8" />
                        <CommandList className="max-h-[40vh] overflow-y-auto">
                          <CommandEmpty>No results.</CommandEmpty>
                          <CommandGroup heading="Patients">
                            {patientsSorted.filter(p => (p.name || "").toLowerCase().includes(patientQuery.toLowerCase())).map(p => (
                              <CommandItem key={p.id} onSelect={() => { setForm(f => ({ ...f, patientId: p.id })); setPatientPopoverOpen(false); }}>
                                {p.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                <p className="text-base sm:text-lg font-semibold">{appointment.patient}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Time</span>
              </div>
              <p className="text-base sm:text-lg font-semibold">{appointment.time}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Therapy</span>
              </div>
              {isEditing ? (
                <Select value={form.therapyId} onValueChange={(v:string) => setForm(f => ({ ...f, therapyId: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[45vh] w-[90vw] sm:w-auto">
                    {therapiesSorted.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-base sm:text-lg font-semibold">{appointment.therapy}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Staff</span>
              </div>
              {isEditing ? (
                <Select value={form.staffId} onValueChange={(v:string) => setForm(f => ({ ...f, staffId: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[45vh] w-[90vw] sm:w-auto">
                    {staffSorted.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="text-xs sm:text-sm px-2.5 py-0.5">{appointment.staff}</Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Home className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Room</span>
              </div>
              {isEditing ? (
                <Select value={form.roomId} onValueChange={(v:string) => setForm(f => ({ ...f, roomId: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[45vh] w-[90vw] sm:w-auto">
                    {roomsSorted.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-base sm:text-lg font-semibold">{appointment.room}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-5 h-5" />
                <span className="text-xs sm:text-sm">Duration</span>
              </div>
              {isEditing ? (
                <Select value={String(form.duration)} onValueChange={(v:string) => setForm(f => ({ ...f, duration: Number(v) }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30,45,60,75,90,120].map((d) => (<SelectItem key={d} value={String(d)}>{d} minutes</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-base sm:text-lg font-semibold">{appointment.duration || 60} minutes</p>
              )}
            </div>
          </div>
          ) : null}

          {appointment && appointment.roomAmenities && appointment.roomAmenities.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs sm:text-sm text-muted-foreground">Room Amenities</span>
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {(isEditing ? selectedRoomAmenities : appointment.roomAmenities).map((a, i) => (
                  <Badge key={i} variant="outline" className="text-xs sm:text-sm px-2.5 py-0.5">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {appointment && appointment.patientDetails && (
            <div className="space-y-1.5 sm:space-y-2.5">
              <span className="text-xs sm:text-sm text-muted-foreground">Patient Details</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 sm:gap-2.5 text-xs sm:text-sm">
                <div><span className="text-muted-foreground">Name:</span> {(isEditing ? selectedPatient?.name : appointment.patientDetails?.name) || ""}</div>
                <div><span className="text-muted-foreground">Phone:</span> {(isEditing ? selectedPatient?.phone : appointment.patientDetails?.phone) || ""}</div>
                <div><span className="text-muted-foreground">Email:</span> {(isEditing ? selectedPatient?.email : appointment.patientDetails?.email) || ""}</div>
                <div><span className="text-muted-foreground">Gender:</span> {(isEditing ? selectedPatient?.gender : appointment.patientDetails?.gender) || ""}</div>
                <div><span className="text-muted-foreground">Date of Birth:</span> {(isEditing ? selectedPatient?.dob : appointment.patientDetails?.dob) || ""}</div>
                <div><span className="text-muted-foreground">Emergency Contact:</span> {(isEditing ? selectedPatient?.emergencyContact : appointment.patientDetails?.emergencyContact) || ""}</div>
                <div><span className="text-muted-foreground">Emergency Phone:</span> {(isEditing ? selectedPatient?.emergencyPhone : appointment.patientDetails?.emergencyPhone) || ""}</div>
                <div className="md:col-span-2"><span className="text-muted-foreground">Address:</span> {(isEditing ? selectedPatient?.address : appointment.patientDetails?.address) || ""}</div>
                <div className="md:col-span-2"><span className="text-muted-foreground">Medical Notes:</span> {(isEditing ? selectedPatient?.medicalNotes : appointment.patientDetails?.medicalNotes) || ""}</div>
                <div className="md:col-span-2"><span className="text-muted-foreground">Diet Plan:</span> {(isEditing ? selectedPatient?.dietPlan : appointment.patientDetails?.dietPlan) || ""}</div>
              </div>
            </div>
          )}

          {appointment && appointment.session && (
            <div className="space-y-1 sm:space-y-2">
              <span className="text-xs sm:text-sm text-muted-foreground">Session Progress</span>
              <p className="text-sm sm:text-base font-semibold">{appointment.session}</p>
            </div>
          )}

          {appointment && appointment.notes && (
            <div className="space-y-1 sm:space-y-2">
              <span className="text-xs sm:text-sm text-muted-foreground">Notes</span>
              <p className="text-xs sm:text-sm">{appointment.notes}</p>
            </div>
          )}

          {isEditing && (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">If unavailable, auto-reschedule:</span>
              <Button variant="outline" size="sm" onClick={() => onOpenAssign && onOpenAssign()}>Assign</Button>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};
  const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || '';
