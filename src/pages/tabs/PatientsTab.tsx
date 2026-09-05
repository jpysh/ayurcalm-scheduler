import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Trash2, Info, Plus } from "lucide-react";
// removed dialog import to avoid dev parse error

type Patient = { id: string | number; name: string; phone?: string; gender: string; actualStart?: string; actualEnd?: string; dietPlan?: string };

type PatientsTabProps = {
  patients: Patient[];
  searchPatients: string;
  setSearchPatients: (v: string) => void;
  showAddPatient: boolean;
  setShowAddPatient: (v: boolean) => void;
  onShowInfo: (p: Patient) => void;
  onEditDiet: (patientId: string | number) => void;
};

const PatientsTab = ({ patients, searchPatients, setSearchPatients, showAddPatient, setShowAddPatient, onShowInfo, onEditDiet }: PatientsTabProps) => {
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
