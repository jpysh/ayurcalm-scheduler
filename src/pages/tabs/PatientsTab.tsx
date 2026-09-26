import { useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Trash2, Info, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, fetchJsonWithTimeout, toLocalInput, type ApiAppointment, type ApiDietPlan, type ApiStay, type Patient as PatientRow, type UiStaff } from "./shared";
// removed dialog import to avoid dev parse error

type Patient = { id: string | number; name: string; phone?: string; gender: string; actualStart?: string; actualEnd?: string; dietPlan?: string; preferredStaffId?: string | null; requiresPreferredStaff?: boolean };

type PatientsTabProps = {
  patients: Patient[];
  searchPatients: string;
  setSearchPatients: (v: string) => void;
  showAddPatient: boolean;
  setShowAddPatient: (v: boolean) => void;
  onShowInfo: (p: Patient) => void;
  onEditDiet: (patientId: string | number) => void;
  staff: { id: string | number; name: string }[];
};

const PatientsTab = ({ patients, searchPatients, setSearchPatients, showAddPatient, setShowAddPatient, onShowInfo, onEditDiet, staff }: PatientsTabProps) => {
  const [localPatients, setLocalPatients] = useState<Patient[]>(patients);
  const [editingPatientId, setEditingPatientId] = useState<string | number | null>(null);
  const [originalPatient, setOriginalPatient] = useState<Patient | null>(null);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  // removed info dialog state to avoid dev parse error

  const [genderFilter, setGenderFilter] = useState<'all'|'Male'|'Female'|'Other'>('all');
  const [dietFilter, setDietFilter] = useState<'all'|'has'|'none'>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [sortField, setSortField] = useState<'name'|'gender'|'start'|'end'>('name');
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('asc');

  const filterActive = genderFilter !== 'all' || dietFilter !== 'all' || !!selectedDate;
  const sortActive = !(sortField === 'name' && sortOrder === 'asc');

  const toLocalDisplayNoSeconds = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString('en-IN', opts);
  };

  const calcHotelDays = (start?: string, end?: string) => {
    if (!start || !end) return '';
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return '';
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((e - s) / msPerDay));
  };

  useEffect(() => {
    setLocalPatients(patients);
  }, [patients]);

  const filteredSorted = useMemo(() => {
    const q = (searchPatients || '').trim().toLowerCase();
    const bySearch = (p: Patient) => !q || p.name.toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q) || p.gender.toLowerCase().includes(q);
    const byGender = (p: Patient) => genderFilter === 'all' || p.gender === genderFilter;
    const byDiet = (p: Patient) => dietFilter === 'all' || (dietFilter === 'has' ? !!p.dietPlan : !p.dietPlan);
    const byDate = (p: Patient) => {
      if (!selectedDate) return true;
      const d = new Date(selectedDate);
      const start = p.actualStart ? new Date(p.actualStart) : null;
      const end = p.actualEnd ? new Date(p.actualEnd) : null;
      const covers = start && end ? start <= d && end >= d : start && !end ? start <= d : false;
      return covers;
    };
    const list = localPatients.filter((p) => bySearch(p) && byGender(p) && byDiet(p) && byDate(p));
    const sorted = [...list].sort((a, b) => {
      let result = 0;
      if (sortField === 'name') result = a.name.localeCompare(b.name);
      else if (sortField === 'gender') result = a.gender.localeCompare(b.gender);
      else if (sortField === 'start') {
        const av = a.actualStart ? new Date(a.actualStart).getTime() : 0;
        const bv = b.actualStart ? new Date(b.actualStart).getTime() : 0;
        result = av - bv;
      } else if (sortField === 'end') {
        const av = a.actualEnd ? new Date(a.actualEnd).getTime() : 0;
        const bv = b.actualEnd ? new Date(b.actualEnd).getTime() : 0;
        result = av - bv;
      }
      return sortOrder === 'asc' ? result : -result;
    });
    return sorted;
  }, [localPatients, searchPatients, genderFilter, dietFilter, selectedDate, sortField, sortOrder]);

  const startEditPatient = (p: Patient) => {
    setEditingPatientId(p.id);
    setOriginalPatient({ ...p });
  };
  const cancelEditPatient = () => {
    if (editingPatientId && originalPatient) {
      setLocalPatients((prev) => prev.map((x) => (x.id === editingPatientId ? { ...originalPatient } : x)));
    }
    setEditingPatientId(null);
    setOriginalPatient(null);
  };
  const saveEditPatient = () => {
    setEditingPatientId(null);
    setOriginalPatient(null);
  };

  return (
    <>
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Patient Management</CardTitle>
          <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Patient" onClick={() => setShowAddPatient(true)}>
            <Plus />
          </Button>
        </div>
        <div className="mt-0.5 flex items-center justify-center gap-2">
          <Input placeholder="Search patients" value={searchPatients} onChange={(e) => setSearchPatients(e.target.value)} className="h-8 md:h-10 text-center max-w-xs" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={`h-8 px-2 text-xs ${filterActive ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent' : ''}`}>Filter</Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-[320px] md:w-[520px]">
              <div className="flex items-center gap-1 flex-nowrap">
                <Select value={genderFilter} onValueChange={(v: 'all'|'Male'|'Female'|'Other') => setGenderFilter(v)}>
                  <SelectTrigger className="h-8 px-2 text-xs w-[92px] truncate"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dietFilter} onValueChange={(v: 'all'|'has'|'none') => setDietFilter(v)}>
                  <SelectTrigger className="h-8 px-2 text-xs w-[116px] truncate"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Diet Plans</SelectItem>
                    <SelectItem value="has">Has Diet Plan</SelectItem>
                    <SelectItem value="none">No Diet Plan</SelectItem>
                  </SelectContent>
                </Select>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Input
                      type="date"
                      lang="en-IN"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      onFocus={() => setDatePickerOpen(true)}
                      onClick={() => setDatePickerOpen(true)}
                      className="h-8 text-xs w-[140px]"
                    />
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" sideOffset={4} collisionPadding={8} className="p-1 w-fit max-w-[calc(100vw-1rem)]">
                    <Calendar
                      mode="single"
                      selected={selectedDate ? new Date(selectedDate) : undefined}
                      onSelect={(d) => { setSelectedDate(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''); setDatePickerOpen(false); }}
                      showOutsideDays={false}
                      className="p-0"
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { setGenderFilter('all'); setDietFilter('all'); setSelectedDate(''); }}>Clear</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={`h-8 px-2 text-xs ${sortActive ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent' : ''}`}>Sort</Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-64">
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <Select value={sortField} onValueChange={(v: 'name'|'gender'|'start'|'end') => setSortField(v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="gender">Gender</SelectItem>
                      <SelectItem value="start">Start</SelectItem>
                      <SelectItem value="end">End</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={sortOrder} onValueChange={(v: 'asc'|'desc') => setSortOrder(v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">
                <Checkbox
                  checked={(() => {
                    const visibleIds = filteredSorted.map((p) => p.id);
                    return visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
                  })()}
                  onCheckedChange={(v) => {
                    const visibleIds = filteredSorted.map((p) => p.id);
                    setSelectedIds((prev) => {
                      const set = new Set(prev);
                      if (v) visibleIds.forEach((id) => set.add(id));
                      else visibleIds.forEach((id) => set.delete(id));
                      return Array.from(set);
                    });
                  }}
                  className="h-6 w-6"
                />
              </TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Name</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Phone</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Gender</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Therapist</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Diet Plan</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Start</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">End</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Duration (days)</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1 pr-1 md:py-0 md:px-3 w-7">
                  <Checkbox
                    checked={selectedIds.includes(p.id)}
                    onCheckedChange={(v) => {
                      setSelectedIds((prev) => {
                        const set = new Set(prev);
                        if (v) set.add(p.id); else set.delete(p.id);
                        return Array.from(set);
                      });
                    }}
                    className="h-6 w-6"
                  />
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <Input value={p.name} onChange={(e) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
                  ) : (
                    p.name
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <Input value={p.phone || ''} onChange={(e) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, phone: e.target.value } : x)))} />
                  ) : (
                    p.phone || ''
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <Select value={p.gender} onValueChange={(v) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, gender: v as typeof p.gender } : x)))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    p.gender
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <div className="space-y-1">
                      <Select value={p.preferredStaffId || 'none'} onValueChange={(v) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, preferredStaffId: v === 'none' ? null : v, requiresPreferredStaff: v === 'none' ? false : x.requiresPreferredStaff } : x)))}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Anyone" /></SelectTrigger>
                        <SelectContent className="max-h-[45vh]">
                          <SelectItem value="none">Anyone</SelectItem>
                          {staff.map((sm) => (<SelectItem key={String(sm.id)} value={String(sm.id)}>{sm.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      {p.preferredStaffId ? (
                        <label className="flex items-center gap-1.5 text-[11px]">
                          <Checkbox
                            className="h-4 w-4"
                            checked={!!p.requiresPreferredStaff}
                            onCheckedChange={(v) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, requiresPreferredStaff: !!v } : x)))}
                          />
                          Must be this therapist
                        </label>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[11px] md:text-sm text-muted-foreground">
                      {p.preferredStaffId ? `${staff.find((sm) => String(sm.id) === String(p.preferredStaffId))?.name || ''}${p.requiresPreferredStaff ? ' (only)' : ''}` : ''}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <div
                      className="text-[11px] md:text-sm truncate cursor-pointer"
                      title={p.dietPlan || 'No diet plan selected'}
                      onClick={() => onEditDiet(p.id)}
                    >
                      {p.dietPlan || 'No diet plan selected'}
                    </div>
                  ) : (
                    <div
                      className="text-[11px] md:text-sm text-muted-foreground truncate"
                      title={p.dietPlan || ''}
                    >
                      {p.dietPlan || ''}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <Input type="datetime-local" value={p.actualStart || ''} onChange={(e) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, actualStart: e.target.value } : x)))} />
                  ) : (
                    toLocalDisplayNoSeconds(p.actualStart)
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                  {editingPatientId === p.id ? (
                    <Input type="datetime-local" value={p.actualEnd || ''} onChange={(e) => setLocalPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, actualEnd: e.target.value } : x)))} />
                  ) : (
                    toLocalDisplayNoSeconds(p.actualEnd)
                  )}
                </TableCell>
                <TableCell className="text-xs md:text-sm leading-tight py-0.5 pl-1.5 pr-1 md:py-3 md:px-3">
                  {calcHotelDays(p.actualStart, p.actualEnd)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {editingPatientId === p.id ? (
                      <>
                        <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={cancelEditPatient}>Cancel</Button>
                        <Button size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={saveEditPatient}>Save</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => onShowInfo(p)}>
                          <Info className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => startEditPatient(p)}>
                          <Edit className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => setLocalPatients((prev) => prev.filter((x) => x.id !== p.id))}>
                          <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    {/* info dialog removed for dev stability */}
    </>
  );
};

export default PatientsTab;

/** The Patients screen: the Add and Details dialogs and the tab, held by the dashboard so they last as long as it does. */
export function usePatientsScreen({ patients, setPatients, staff, therapyNameById, timezone, openDietFor, openDietForNewPatient }: {
  patients: PatientRow[]; setPatients: React.Dispatch<React.SetStateAction<PatientRow[]>>; staff: UiStaff[];
  therapyNameById: Record<string, string>; timezone: string;
  openDietFor: (patientId: string | number) => void; openDietForNewPatient: () => void;
}) {
  const ADMIN_TZ = timezone;
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState<PatientRow>({
    id: '5',
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
  const [searchPatients, setSearchPatients] = useState("");
  const [infoPatient, setInfoPatient] = useState<PatientRow | null>(null);
  const [infoDraft, setInfoDraft] = useState<PatientRow | null>(null);
  const [infoDietPlans, setInfoDietPlans] = useState<ApiDietPlan[]>([]);
  const [infoAppointments, setInfoAppointments] = useState<ApiAppointment[]>([]);
  const [infoStays, setInfoStays] = useState<ApiStay[]>([]);
  const [infoEditing, setInfoEditing] = useState(false);
  const showPatientInfo = async (p: PatientRow) => {
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

  const toLocalDisplayNoSeconds = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { timeZone: ADMIN_TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const tab = (
    <PatientsTab
              staff={staff.map((x) => ({ id: String(x.id), name: x.name }))}
      patients={patients}
      searchPatients={searchPatients}
      setSearchPatients={setSearchPatients}
      showAddPatient={showAddPatient}
      setShowAddPatient={setShowAddPatient}
      onShowInfo={showPatientInfo}
      onEditDiet={openDietFor}
    />
  );

  const dialogs = (
    <>
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
                onClick={openDietForNewPatient}
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
    </>
  );

  return { tab, dialogs, setNewPatient };
}
