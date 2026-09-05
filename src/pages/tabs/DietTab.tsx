import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";

type Patient = { id: string; name: string; phone?: string; gender?: string; dietPlan?: string; actualStart?: string; actualEnd?: string };
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
  applicability: string;
};
type DietScheduleSegment = { start: string; end: string; templateId: string; therapyIds: string[] };
type AddDialogSegment = { start: string; end: string; templateId: string; therapyIds: string[]; expanded?: boolean; locked?: boolean; saveAsTemplate?: boolean; customTemplate?: Partial<DietPlanTemplate>; done?: boolean };
type SegmentDatePickerOpen = { idx: number | null; field: 'start' | 'end' | null };
type UiTherapy = { id: string | number; name: string; amenities?: string[] };
type ApiStay = { start_date: string; end_date: string };
type ApiAppointment = { therapy_id: string | number };
type ApiDietSegment = { id?: string; start_date: string; end_date: string; therapy_ids?: (string | number)[]; template_label?: string; template?: Partial<DietPlanTemplate> & { name?: string } };
type FetchJsonWithTimeout = <T>(url: string) => Promise<T>;

type DietTabProps = {
  patients: Patient[];
  setPatients: (updater: (prev: Patient[]) => Patient[]) => void;
  dietTemplates: DietPlanTemplate[];
  setDietTemplates: (updater: (prev: DietPlanTemplate[]) => DietPlanTemplate[]) => void;
  dietDraft: DietPlanTemplate;
  setDietDraft: (v: DietPlanTemplate) => void;
  selectedDietTemplateId: string;
  setSelectedDietTemplateId: (v: string) => void;
  dietSchedules: Record<string, DietScheduleSegment[]>;
  setDietSchedules: (updater: (prev: Record<string, DietScheduleSegment[]>) => Record<string, DietScheduleSegment[]>) => void;
  patientTherapyTags: Record<string, string[]>;
  setPatientTherapyTags: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  showAddDietDialog: boolean;
  setShowAddDietDialog: (v: boolean) => void;
  addDialogSegments: AddDialogSegment[];
  setAddDialogSegments: (updater: (prev: AddDialogSegment[]) => AddDialogSegment[]) => void;
  addDialogPatientId: string | null;
  setAddDialogPatientId: (v: string | null) => void;
  addDialogPatientStays: ApiStay[];
  setAddDialogPatientStays: (v: ApiStay[]) => void;
  addDialogPatientAppointments: ApiAppointment[];
  setAddDialogPatientAppointments: (v: ApiAppointment[]) => void;
  assignmentSegments: { start: string; end: string; templateId: string }[];
  setAssignmentSegments: (updater: (prev: { start: string; end: string; templateId: string }[]) => { start: string; end: string; templateId: string }[]) => void;
  assignmentTemplateId: string;
  setAssignmentTemplateId: (v: string) => void;
  assignmentTherapyIds: string[];
  setAssignmentTherapyIds: (updater: (prev: string[]) => string[]) => void;
  editAssignmentPatientId: string | null;
  setEditAssignmentPatientId: (v: string | null) => void;
  API_BASE: string;
  API_TOKEN?: string;
  fetchJsonWithTimeout: FetchJsonWithTimeout;
  therapies: UiTherapy[];
  therapyNameById: Record<string, string>;
  ymdInTZ: (d: Date) => string;
  segmentDatePickerOpen: SegmentDatePickerOpen;
  setSegmentDatePickerOpen: (v: SegmentDatePickerOpen) => void;
  templateSearch: string;
  setTemplateSearch: (v: string) => void;
  templatePickerOpenIdx: number | null;
  setTemplatePickerOpenIdx: (v: number | null) => void;
  resetAddDialog: () => void;
  addDialogPatientOpen: boolean;
  setAddDialogPatientOpen: (v: boolean) => void;
  setAddPatientDietPlanLabel: (label: string) => void;
  dietTabActive: boolean;
};
const DietTab = ({
  patients,
  setPatients,
  dietTemplates,
  setDietTemplates,
  dietDraft,
  setDietDraft,
  selectedDietTemplateId,
  setSelectedDietTemplateId,
  dietSchedules,
  setDietSchedules,
  patientTherapyTags,
  setPatientTherapyTags,
  showAddDietDialog,
  setShowAddDietDialog,
  addDialogSegments,
  setAddDialogSegments,
  addDialogPatientId,
  setAddDialogPatientId,
  addDialogPatientStays,
  setAddDialogPatientStays,
  addDialogPatientAppointments,
  setAddDialogPatientAppointments,
  assignmentSegments,
  setAssignmentSegments,
  assignmentTemplateId,
  setAssignmentTemplateId,
  assignmentTherapyIds,
  setAssignmentTherapyIds,
  editAssignmentPatientId,
  setEditAssignmentPatientId,
  API_BASE,
  API_TOKEN,
  fetchJsonWithTimeout,
  therapies,
  therapyNameById,
  ymdInTZ,
  segmentDatePickerOpen,
  setSegmentDatePickerOpen,
  templateSearch,
  setTemplateSearch,
  templatePickerOpenIdx,
  setTemplatePickerOpenIdx,
  resetAddDialog,
  addDialogPatientOpen,
  setAddDialogPatientOpen,
  setAddPatientDietPlanLabel,
  dietTabActive,
}: DietTabProps) => {
  return (
    <>
      {dietTabActive && (
        <>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-xl font-semibold">Diet Management</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 px-3" onClick={() => {
                setDietDraft({ id: 'new', name: 'Custom Plan', description: '', breakfast: '', lunch: '', dinner: '', snacks: '', preTherapyNotes: '', postTherapyNotes: '', medication: '', therapyIds: [], applicability: 'daily' });
                setSelectedDietTemplateId('new');
                setAddDialogSegments([{ start: '', end: '', templateId: '', therapyIds: [], expanded: false, locked: true, saveAsTemplate: false }]);
                setShowAddDietDialog(true);
              }}>Add</Button>
            </div>
          </div>

          <Card>
            <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
              <div className="flex items-center justify-center gap-2">
                <CardTitle className="text-base md:text-xl font-semibold">Active Assignments</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs md:text-sm">Patient</TableHead>
                    <TableHead className="text-xs md:text-sm">Diet Plan</TableHead>
                    <TableHead className="text-xs md:text-sm">Schedule</TableHead>
                    <TableHead className="text-xs md:text-sm">Therapies</TableHead>
                    <TableHead className="text-xs md:text-sm text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((p: Patient) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs md:text-sm">{p.name}</TableCell>
                      <TableCell className="text-xs md:text-sm">{(() => {
                        const segs = dietSchedules[p.id] || [];
                        if (segs.length === 0) return p.dietPlan || '—';
                        const uniqueTpls = new Set(segs.map((s) => s.templateId));
                        if (uniqueTpls.size > 1) return 'Multiple plans';
                        const tpl = dietTemplates.find((t) => t.id === segs[0].templateId);
                        return tpl?.name || '—';
                      })()}</TableCell>
                      <TableCell className="text-xs md:text-sm">
                        <div className="flex flex-wrap gap-1">
                          {(dietSchedules[p.id] || []).map((s: DietScheduleSegment, idx: number) => (
                            <Badge key={`${p.id}-${idx}`} variant="outline" className="text-[11px]">
                              {s.start} → {s.end}: {(dietTemplates.find((t) => t.id === s.templateId)?.name) || s.templateId}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs md:text-sm">
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            const segs = dietSchedules[p.id] || [];
                            const segTherapies = new Set<string>();
                            for (const s of segs) (s.therapyIds || []).forEach(x => segTherapies.add(x));
                            if (segTherapies.size > 0) {
                              return [...segTherapies].map((tid) => (
                                <Badge key={tid} variant="secondary" className="text-[11px]">{therapyNameById[tid] || tid}</Badge>
                              ));
                            }
                            const tplIds = new Set(segs.map((s) => s.templateId));
                            const tplTherapies = new Set<string>();
                            for (const id of tplIds) {
                              const tpl = dietTemplates.find((t) => t.id === id);
                              (tpl?.therapyIds || []).forEach(x => tplTherapies.add(x));
                            }
                            const patientTags = new Set<string>(patientTherapyTags[p.id] || []);
                            const show = (patientTags.size > 0) ? [...patientTags] : [...tplTherapies];
                            return show.map((tid) => (
                              <Badge key={tid} variant="secondary" className="text-[11px]">{therapyNameById[tid] || tid}</Badge>
                            ));
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                            setAddDialogPatientId(p.id);
                            setShowAddDietDialog(true);
                            (async () => {
                              try {
                                const [stays, appts] = await Promise.all([
                                  fetchJsonWithTimeout<ApiStay[]>(`${API_BASE}/patients/${p.id}/stays`),
                                  fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?patient_id=${p.id}`),
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
                                  const found = patients.find((x) => x.id === p.id);
                                  startISO = (found)?.actualStart || '';
                                  endISO = (found)?.actualEnd || '';
                                }
                                try {
                                  const existing: ApiDietSegment[] = await fetchJsonWithTimeout(`${API_BASE}/dietplans/segments?patient_id=${p.id}`);
                                  if (Array.isArray(existing) && existing.length > 0) {
                                    const valid = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
                                    const segments = existing.map((x) => ({
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
                                    setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: (patientTherapyTags[p.id] || []), expanded: false, locked: true, saveAsTemplate: false }]);
                                  }
                                } catch {
                                  const segStart = startISO ? toIso(new Date(startISO)) : '';
                                  const segEnd = endISO ? toIso(new Date(endISO)) : '';
                                  setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: (patientTherapyTags[p.id] || []), expanded: false, locked: true, saveAsTemplate: false }]);
                                }
                              } catch {
                                setAddDialogPatientStays([]);
                                setAddDialogPatientAppointments([]);
                              }
                            })();
                          }}>Edit</Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                            setPatients((prev: any[]) => prev.map((x) => x.id === p.id ? { ...x, dietPlan: '' } : x));
                            setPatientTherapyTags((prev: any) => { const next = { ...prev }; delete next[p.id]; return next; });
                            setDietSchedules((prev: any) => { const next = { ...prev }; delete next[p.id]; return next; });
                          }}>Clear</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showAddDietDialog} onOpenChange={(v: boolean) => { setShowAddDietDialog(v); if (!v) resetAddDialog(); }}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl p-3">
          <DialogHeader>
            <DialogTitle className="text-sm">Diet Plan</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 max-h-[70vh] overflow-auto">
            <div>
              <Label className="text-xs">{addDialogPatientId ? 'Patient' : 'New patient (from Add Patient)'}</Label>
              {addDialogPatientId ? (
              <Popover open={addDialogPatientOpen} onOpenChange={setAddDialogPatientOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2">{(() => {
                    const p = patients.find((x: any) => x.id === addDialogPatientId);
                    const g = (p?.gender || '').slice(0,1).toLowerCase();
                    const phone = p?.phone ? ` ${p.phone}` : '';
                    return `${p?.name || ''}${g ? ` (${g})` : ''}${phone}`;
                  })()}</Button>
                </PopoverTrigger>
                <PopoverContent className="p-2 w-[280px]">
                  <Command className="max-h-[320px] overflow-auto">
                    <CommandInput placeholder="Search patients" className="h-8" />
                    <CommandList>
                      <CommandEmpty>No patients found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={() => {
                          setAddDialogPatientId(null);
                          setAddDialogPatientStays([]);
                          setAddDialogPatientAppointments([]);
                          setAddDialogSegments([{ start: '', end: '', templateId: '', therapyIds: [], expanded: false, locked: true, saveAsTemplate: false }]);
                          setAddDialogPatientOpen(false);
                        }}>
                          <div className="text-xs truncate">None</div>
                        </CommandItem>
                        {patients
                          .filter((p: any) => {
                            const now = new Date();
                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const s = p?.actualStart ? new Date(p.actualStart) : null;
                            const e = p?.actualEnd ? new Date(p.actualEnd) : null;
                            const s0 = s ? new Date(s.getFullYear(), s.getMonth(), s.getDate()) : null;
                            const e0 = e ? new Date(e.getFullYear(), e.getMonth(), e.getDate()) : null;
                            if (!s0 && !e0) return true;
                            if (s0 && today < s0) return false;
                            if (e0 && today > e0) return false;
                            return true;
                          })
                          .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                          .map((p: any) => (
                          <CommandItem key={p.id} onSelect={() => {
                            setAddDialogPatientId(p.id);
                            (async () => {
                              try {
                                const [stays, appts] = await Promise.all([
                                  fetchJsonWithTimeout<{ start_date: string; end_date: string }[]>(`${API_BASE}/patients/${p.id}/stays`),
                                  fetchJsonWithTimeout<any[]>(`${API_BASE}/appointments?patient_id=${p.id}`),
                                ]);
                                const listStays = Array.isArray(stays) ? stays : [];
                                setAddDialogPatientStays(listStays);
                                setAddDialogPatientAppointments(Array.isArray(appts) ? appts : []);
                                const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                let startISO = '';
                                let endISO = '';
                                if (listStays.length > 0) {
                                  startISO = listStays.map(s => s.start_date).sort()[0] || '';
                                  endISO = listStays.map(s => s.end_date).sort().slice(-1)[0] || '';
                                } else {
                                  startISO = (p as any).actualStart || '';
                                  endISO = (p as any).actualEnd || '';
                                }
                                try {
                                  const existing: any[] = await fetchJsonWithTimeout(`${API_BASE}/dietplans/segments?patient_id=${p.id}`);
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
                                    setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: (patientTherapyTags[p.id] || []), expanded: false, locked: true, saveAsTemplate: false }]);
                                  }
                                } catch {
                                  const segStart = startISO ? toIso(new Date(startISO)) : '';
                                  const segEnd = endISO ? toIso(new Date(endISO)) : '';
                                  setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: (patientTherapyTags[p.id] || []), expanded: false, locked: true, saveAsTemplate: false }]);
                                }
                              } catch {
                                setAddDialogPatientStays([]);
                                setAddDialogPatientAppointments([]);
                                const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                const segStart = (p as any).actualStart ? toIso(new Date((p as any).actualStart)) : '';
                                const segEnd = (p as any).actualEnd ? toIso(new Date((p as any).actualEnd)) : '';
                                setAddDialogSegments([{ start: segStart, end: segEnd, templateId: '', therapyIds: (patientTherapyTags[p.id] || []), expanded: false, locked: true, saveAsTemplate: false }]);
                              }
                              setAddDialogPatientOpen(false);
                            })();
                          }}>
                            <div className="text-xs">{(() => {
                              const g = (p.gender || '').slice(0,1).toLowerCase();
                              const phone = p.phone ? ` ${p.phone}` : '';
                              return `${p.name}${g ? ` (${g})` : ''}${phone}`;
                            })()}</div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              ) : null}
              {addDialogPatientId ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {(() => {
                    const fmt = (iso?: string) => {
                      if (!iso) return '—';
                      const d = new Date(iso);
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    };
                    const p = patients.find((x: any) => x.id === addDialogPatientId);
                    const stayStartISO = addDialogPatientStays.map((s: any) => s.start_date).sort()[0] || (p?.actualStart || '');
                    const stayEndISO = addDialogPatientStays.map((s: any) => s.end_date).sort().slice(-1)[0] || (p?.actualEnd || '');
                    return <>Stay: {fmt(stayStartISO)} → {fmt(stayEndISO)}</>;
                  })()}
                  {(() => {
                    const count = addDialogPatientAppointments.length;
                    if (count === 0) return null;
                    const names = Array.from(new Set(addDialogPatientAppointments.map((a: any) => therapyNameById[a.therapy_id] || a.therapy_id))).slice(0, 3);
                    return <div className="mt-1">Appointments: {count} ({names.join(', ')})</div>;
                  })()}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setAddDialogSegments((prevSegs: any[]) => [...prevSegs, { start: '', end: '', templateId: '', therapyIds: [], expanded: false, locked: false }])}>+ Add Segment</Button>
                <div className="text-[11px] text-muted-foreground">Add date ranges as needed.</div>
              </div>
              <div className="space-y-2">
                {addDialogSegments.map((seg: any, idx: number) => (
                  <Card key={idx}>
                    <CardContent className="p-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Popover open={segmentDatePickerOpen.idx === idx && segmentDatePickerOpen.field === 'start'} onOpenChange={(o) => setSegmentDatePickerOpen(o ? { idx, field: 'start' } : { idx: null, field: null })}>
                            <PopoverTrigger asChild>
                              <Input type="date" value={seg.start} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, start: e.target.value } : s))} onFocus={() => setSegmentDatePickerOpen({ idx: idx, field: 'start' })} onClick={() => setSegmentDatePickerOpen({ idx: idx, field: 'start' })} className="h-8 w-[150px]" />
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" sideOffset={4} collisionPadding={8} className="p-1 w-fit max-w-[calc(100vw-1rem)]">
                              <Calendar
                                mode="single"
                                selected={seg.start ? new Date(seg.start) : undefined}
                                onSelect={(d) => { setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, start: d ? ymdInTZ(d) : '' } : s)); setSegmentDatePickerOpen({ idx: null, field: null }); }}
                                showOutsideDays={false}
                                className="p-0"
                              />
                            </PopoverContent>
                          </Popover>
                          <span className="text-xs text-muted-foreground">→</span>
                          <Popover open={segmentDatePickerOpen.idx === idx && segmentDatePickerOpen.field === 'end'} onOpenChange={(o) => setSegmentDatePickerOpen(o ? { idx, field: 'end' } : { idx: null, field: null })}>
                            <PopoverTrigger asChild>
                              <Input type="date" value={seg.end} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, end: e.target.value } : s))} onFocus={() => setSegmentDatePickerOpen({ idx: idx, field: 'end' })} onClick={() => setSegmentDatePickerOpen({ idx: idx, field: 'end' })} className="h-8 w-[150px]" />
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" sideOffset={4} collisionPadding={8} className="p-1 w-fit max-w-[calc(100vw-1rem)]">
                              <Calendar
                                mode="single"
                                selected={seg.end ? new Date(seg.end) : undefined}
                                onSelect={(d) => { setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, end: d ? ymdInTZ(d) : '' } : s)); setSegmentDatePickerOpen({ idx: null, field: null }); }}
                                showOutsideDays={false}
                                className="p-0"
                              />
                            </PopoverContent>
                          </Popover>
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, expanded: !s.expanded } : s))}>{seg.expanded ? 'Collapse' : 'Expand'}</Button>
                          <Button size="sm" variant="outline" className="h-8 px-2 ml-auto" disabled={!!seg.locked} onClick={() => setAddDialogSegments((prev: any[]) => prev.filter((_: any, i: number) => i !== idx))}>Delete</Button>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const name = seg.templateId ? (dietTemplates.find((t: any) => t.id === seg.templateId)?.name || '') : (seg.customTemplate?.name || '');
                            return name ? <div className="text-sm whitespace-normal break-words">{name}</div> : null;
                          })()}
                        </div>
                      </div>
                      {seg.expanded && (
                        <div className="mt-2 space-y-2">
                          <div>
                            <Label className="text-xs">Select Therapies</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 px-2">Therapies ({seg.therapyIds?.length || 0})</Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-2 w-[280px]">
                                <Command>
                                  <CommandInput placeholder="Search therapies" className="h-8" />
                                  <CommandList>
                                    <CommandEmpty>No therapies found.</CommandEmpty>
                                    <CommandGroup>
                                      {therapies.map((t: any) => {
                                        const id = String(t.id);
                                        const checked = (seg.therapyIds || []).includes(id);
                                        return (
                                          <CommandItem key={id} onSelect={() => {
                                            setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => {
                                              if (i !== idx) return s;
                                              const set = new Set(s.therapyIds || []);
                                              if (set.has(id)) set.delete(id); else set.add(id);
                                              return { ...s, therapyIds: Array.from(set) };
                                            }));
                                          }}>
                                            <div className="flex items-center justify-between w-full">
                                              <div className="text-xs truncate">{t.name}</div>
                                              <Checkbox checked={checked} onCheckedChange={(v) => {
                                                setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => {
                                                  if (i !== idx) return s;
                                                  const set = new Set(s.therapyIds || []);
                                                  if (v) set.add(id); else set.delete(id);
                                                  return { ...s, therapyIds: Array.from(set) };
                                                }));
                                              }} />
                                            </div>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div>
                            <Label className="text-xs">Templates</Label>
                            <Popover open={templatePickerOpenIdx === idx} onOpenChange={(o) => setTemplatePickerOpenIdx(o ? idx : null)}>
                              <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 px-2">Choose</Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-2 w-[340px]">
                                <div className="space-y-2">
                                  <Input placeholder="Search templates" value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="h-8" />
                                  <div className="space-y-1 max-h-[240px] overflow-auto">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 w-full text-left"
                                      onClick={() => {
                                        setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? {
                                          ...s,
                                          templateId: '',
                                          customTemplate: {
                                            name: '',
                                            description: '',
                                            breakfast: '',
                                            lunch: '',
                                            dinner: '',
                                            snacks: '',
                                            medication: ''
                                          }
                                        } : s));
                                        setTemplatePickerOpenIdx(null);
                                      }}
                                    >
                                      Create New
                                    </Button>
                                    {dietTemplates.filter((t: any) => t.name.toLowerCase().includes(templateSearch.toLowerCase())).map((tpl: any) => (
                                      <Button
                                        key={tpl.id}
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 w-full text-left"
                                        onClick={() => {
                                          setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? {
                                            ...s,
                                            templateId: tpl.id,
                                            customTemplate: {
                                              name: tpl.name,
                                              description: tpl.description || '',
                                              breakfast: tpl.breakfast,
                                              lunch: tpl.lunch,
                                              dinner: tpl.dinner,
                                              snacks: tpl.snacks,
                                              medication: tpl.medication || ''
                                            }
                                          } : s));
                                          setTemplatePickerOpenIdx(null);
                                        }}
                                      >
                                        {tpl.name}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div>
                            <Label className="text-xs">Plan Name</Label>
                            <Input value={seg.customTemplate?.name || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), name: e.target.value }, templateId: '' } : s))} className="h-8" />
                          </div>
                          <div>
                            <Label className="text-xs">Description</Label>
                            <Input value={seg.customTemplate?.description || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), description: e.target.value }, templateId: '' } : s))} className="h-8" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Breakfast</Label>
                              <Input value={seg.customTemplate?.breakfast || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), breakfast: e.target.value }, templateId: '' } : s))} className="h-8" />
                            </div>
                            <div>
                              <Label className="text-xs">Lunch</Label>
                              <Input value={seg.customTemplate?.lunch || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), lunch: e.target.value }, templateId: '' } : s))} className="h-8" />
                            </div>
                            <div>
                              <Label className="text-xs">Dinner</Label>
                              <Input value={seg.customTemplate?.dinner || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), dinner: e.target.value }, templateId: '' } : s))} className="h-8" />
                            </div>
                            <div>
                              <Label className="text-xs">Snacks</Label>
                              <Input value={seg.customTemplate?.snacks || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), snacks: e.target.value }, templateId: '' } : s))} className="h-8" />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Medication</Label>
                            <Input value={seg.customTemplate?.medication || ''} onChange={(e) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, customTemplate: { ...(s.customTemplate || {}), medication: e.target.value }, templateId: '' } : s))} className="h-8" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Save as template</Label>
                            <Checkbox size="sm" checked={!!seg.saveAsTemplate} onCheckedChange={(v) => setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, saveAsTemplate: !!v } : s))} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="h-8 px-2" onClick={() => {
                              setAddDialogSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, done: true, expanded: false } : s));
                              if (seg.saveAsTemplate) {
                                const tplCandidate: any | null = seg.customTemplate ? seg.customTemplate : (seg.templateId ? (dietTemplates.find((t: any) => t.id === seg.templateId) || null) : null);
                                const name = (tplCandidate?.name || '').trim();
                                if (!name) { toast.error('Enter a Plan Name to save as template'); return; }
                                const lower = name.toLowerCase();
                                const duplicate = dietTemplates.some((t: any) => t.name.trim().toLowerCase() === lower);
                                if (duplicate) { toast.error(`Template name "${name}" already exists`); return; }
                                const newId = `tpl-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
                                const newTpl: any = {
                                  id: newId,
                                  name,
                                  description: tplCandidate?.description || '',
                                  breakfast: tplCandidate?.breakfast || '',
                                  lunch: tplCandidate?.lunch || '',
                                  dinner: tplCandidate?.dinner || '',
                                  snacks: tplCandidate?.snacks || '',
                                  preTherapyNotes: tplCandidate?.preTherapyNotes || '',
                                  postTherapyNotes: tplCandidate?.postTherapyNotes || '',
                                  medication: tplCandidate?.medication || '',
                                  therapyIds: Array.isArray(tplCandidate?.therapyIds) ? (tplCandidate!.therapyIds as string[]) : [],
                                  applicability: tplCandidate?.applicability || 'daily',
                                };
                                setDietTemplates((prev: any[]) => [newTpl, ...prev]);
                                setSelectedDietTemplateId(newId);
                                toast.success('Template saved');
                              }
                              toast.success('Segment saved');
                            }}>Save this segment</Button>
                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={!!seg.locked} onClick={() => setAddDialogSegments((prev: any[]) => prev.filter((_: any, i: number) => i !== idx))}>Delete segment</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8" onClick={() => { resetAddDialog(); setShowAddDietDialog(false); }}>Cancel</Button>
            <Button size="sm" className="h-8" onClick={async () => {
              setAddDialogSegments((prev: any[]) => prev.map((s: any) => ({ ...s, done: true, expanded: false })));
              const id = `tpl-${Date.now()}`;
              const next = { ...dietDraft, id };
              const toAddNames = new Set<string>();
              const newTemplates: any[] = [];
              for (const s of addDialogSegments) {
                if (!s.saveAsTemplate) continue;
                const tplCandidate: any = s.customTemplate ? s.customTemplate : (s.templateId ? (dietTemplates.find((t: any) => t.id === s.templateId) || next) : next);
                const name = (tplCandidate?.name || '').trim();
                if (!name) { toast.error('Enter a Plan Name to save as template'); continue; }
                const lower = name.toLowerCase();
                const duplicate = dietTemplates.some((t: any) => t.name.trim().toLowerCase() === lower) || toAddNames.has(lower);
                if (duplicate) { toast.error(`Template name "${name}" already exists`); continue; }
                toAddNames.add(lower);
                const newId = `tpl-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
                newTemplates.push({
                  id: newId,
                  name: tplCandidate.name,
                  description: tplCandidate.description || '',
                  breakfast: tplCandidate.breakfast || '',
                  lunch: tplCandidate.lunch || '',
                  dinner: tplCandidate.dinner || '',
                  snacks: tplCandidate.snacks || '',
                  preTherapyNotes: tplCandidate.preTherapyNotes || '',
                  postTherapyNotes: tplCandidate.postTherapyNotes || '',
                  medication: tplCandidate.medication || '',
                  therapyIds: Array.isArray(tplCandidate.therapyIds) ? tplCandidate.therapyIds : [],
                  applicability: tplCandidate.applicability || 'daily',
                });
              }
              if (newTemplates.length > 0) {
                setDietTemplates((prev: any[]) => [...newTemplates, ...prev]);
                setSelectedDietTemplateId(newTemplates[0].id);
              }
              if (addDialogPatientId) {
                const segs = addDialogSegments.map((s: any) => ({ ...s, templateId: (s.templateId && s.templateId.length > 0) ? s.templateId : (s.customTemplate ? '' : id) }));
                const isYMD = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '');
                const datedSegs = segs.filter((s: any) => isYMD(s.start) && isYMD(s.end));
                try {
                  const pid = addDialogPatientId;
                  if (datedSegs.length > 0) {
                    try {
                      const existing: { id: string }[] = await fetchJsonWithTimeout(`${API_BASE}/dietplans/segments?patient_id=${pid}`);
                      await Promise.all(existing.map((seg: any) => fetch(`${API_BASE}/dietplans/segments/${seg.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } })));
                    } catch (e) { void e; }
                    for (const s of datedSegs) {
                      const tpl = s.templateId ? (dietTemplates.find((t: any) => t.id === s.templateId) || null) : (s.customTemplate ? s.customTemplate : next);
                      const template_label = (tpl as any)?.name || next.name;
                      const payload = {
                        patient_id: pid,
                        start_date: s.start,
                        end_date: s.end,
                        therapy_ids: s.therapyIds || [],
                        template_label,
                        template: tpl ? {
                          name: (tpl as any).name,
                          description: (tpl as any).description || '',
                          breakfast: (tpl as any).breakfast,
                          lunch: (tpl as any).lunch,
                          dinner: (tpl as any).dinner,
                          snacks: (tpl as any).snacks,
                          preTherapyNotes: (tpl as any).preTherapyNotes || '',
                          postTherapyNotes: (tpl as any).postTherapyNotes || '',
                          medication: (tpl as any).medication || '',
                          therapyIds: (tpl as any).therapyIds || [],
                          applicability: (tpl as any).applicability,
                        } : undefined,
                      };
                      const res = await fetch(`${API_BASE}/dietplans/segments`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                      if (!res.ok) throw new Error('Save failed');
                    }
                  }
                  const firstTpl = (segs[0]?.templateId ? (dietTemplates.find((t: any) => t.id === segs[0].templateId) || null) : (addDialogSegments[0]?.customTemplate || next)) || next;
                  const label = segs.length > 1 ? 'Multiple plans' : ((firstTpl as any)?.name || next.name);
                  await fetch(`${API_BASE}/patients/${pid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify({ diet_plan: label }) });
                  setPatients((prev: any[]) => prev.map((x) => x.id === pid ? { ...x, dietPlan: label } : x));
                  setDietSchedules((prev: any) => ({
                    ...prev,
                    [pid]: datedSegs.map((s: any) => ({ start: s.start, end: s.end, templateId: s.templateId || id, therapyIds: s.therapyIds || [] })),
                  }));
                  const unionTherapies = Array.from(new Set(addDialogSegments.flatMap((s: any) => s.therapyIds || [])));
                  setPatientTherapyTags((prev: any) => ({ ...prev, [pid]: unionTherapies }));
                } catch (e) {
                  toast.error('Failed to save segments');
                  return;
                }
              } else {
                const segs = addDialogSegments.map((s: any) => ({ ...s, templateId: (s.templateId && s.templateId.length > 0) ? s.templateId : (s.customTemplate ? '' : id) }));
                const firstTpl = (segs[0]?.templateId ? (dietTemplates.find((t: any) => t.id === segs[0].templateId) || null) : (addDialogSegments[0]?.customTemplate || next)) || next;
                const label = segs.length > 1 ? 'Multiple plans' : ((firstTpl as any)?.name || next.name);
                setAddPatientDietPlanLabel(label);
              }
              setShowAddDietDialog(false);
              if (addDialogPatientId) {
                setAddDialogPatientId(null);
                setAddDialogSegments([]);
              }
              toast.success('Diet template saved');
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editAssignmentPatientId} onOpenChange={(v: boolean) => setEditAssignmentPatientId(v ? editAssignmentPatientId : null)}>
        <DialogContent className="max-w-xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const pid = editAssignmentPatientId || '';
              const p = patients.find((x: any) => x.id === pid);
              const start = p?.actualStart ? new Date(p.actualStart) : null;
              const end = p?.actualEnd ? new Date(p.actualEnd) : null;
              const fmt = (d: Date | null) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '—';
              return (
                <div className="text-xs text-muted-foreground">Patient stay: {fmt(start)} → {fmt(end)}</div>
              );
            })()}
            <div className="space-y-2">
              <Label className="text-xs">Schedule segments</Label>
              {assignmentSegments.map((seg: any, idx: number) => (
                <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Input type="date" value={seg.start} onChange={(e) => setAssignmentSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, start: e.target.value } : s))} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input type="date" value={seg.end} onChange={(e) => setAssignmentSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, end: e.target.value } : s))} className="h-8" />
                  </div>
                  <div className="flex items=end gap-1">
                    <Select value={seg.templateId} onValueChange={(v) => setAssignmentSegments((prev: any[]) => prev.map((s: any, i: number) => i===idx ? { ...s, templateId: v } : s))}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dietTemplates.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setAssignmentSegments((prev: any[]) => prev.filter((_: any, i: number) => i !== idx))}>Remove</Button>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setAssignmentSegments((prev: any[]) => [...prev, { start: '', end: '', templateId: assignmentTemplateId }])}>Add segment</Button>
            </div>
            <Label className="text-xs">Therapies</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2">Select therapies ({assignmentTherapyIds.length})</Button>
              </PopoverTrigger>
              <PopoverContent className="p-2 w-[280px]">
                <Command>
                  <CommandInput placeholder="Search therapies" className="h-8" />
                  <CommandList>
                    <CommandEmpty>No therapies found.</CommandEmpty>
                    <CommandGroup>
                      {therapies.map((t: any) => {
                        const id = String(t.id);
                        const checked = assignmentTherapyIds.includes(id);
                        return (
                          <CommandItem key={id} onSelect={() => {
                            setAssignmentTherapyIds((prev: string[]) => {
                              const set = new Set(prev);
                              if (set.has(id)) set.delete(id); else set.add(id);
                              return Array.from(set);
                            });
                          }}>
                            <div className="flex items-center justify-between w-full">
                              <div className="text-xs truncate">{t.name}</div>
                              <Checkbox checked={checked} onCheckedChange={(v) => {
                                setAssignmentTherapyIds((prev: string[]) => {
                                  const set = new Set(prev);
                                  if (v) set.add(id); else set.delete(id);
                                  return Array.from(set);
                                });
                              }} />
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditAssignmentPatientId(null)}>Cancel</Button>
            <Button size="sm" className="h-8" onClick={async () => {
              if (!editAssignmentPatientId) return;
              const pid = editAssignmentPatientId;
              const p = patients.find((x: any) => x.id === pid);
              if (!p?.actualStart || !p?.actualEnd) { toast.error('Patient has no start/end'); return; }
              const startBound = new Date(p.actualStart);
              const endBound = new Date(p.actualEnd);
              const within = (iso: string) => {
                const d = new Date(`${iso}T00:00:00`);
                return d >= new Date(startBound.getFullYear(), startBound.getMonth(), startBound.getDate()) && d <= new Date(endBound.getFullYear(), endBound.getMonth(), endBound.getDate());
              };
              for (const s of assignmentSegments) {
                if (!s.start || !s.end || !within(s.start) || !within(s.end)) { toast.error('Segments must be within patient dates'); return; }
              }
              const segs = assignmentSegments.filter((s: any) => s.start && s.end && s.templateId);
              try {
                try {
                  const existing: { id: string }[] = await fetchJsonWithTimeout(`${API_BASE}/dietplans/segments?patient_id=${pid}`);
                  await Promise.all(existing.map((seg: any) => fetch(`${API_BASE}/dietplans/segments/${seg.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } })));
                } catch (e) { void e; }
                for (const s of segs) {
                  const tpl = dietTemplates.find((t: any) => t.id === (s.templateId || '')) || null;
                  const template_label = tpl ? tpl.name : '';
                  const payload = {
                    patient_id: pid,
                    start_date: s.start,
                    end_date: s.end,
                    therapy_ids: assignmentTherapyIds,
                    template_label,
                    template: tpl ? {
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
                    } : undefined,
                  };
                  const res = await fetch(`${API_BASE}/dietplans/segments`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                  if (!res.ok) throw new Error('Save failed');
                }
                const label = segs.length > 1 ? 'Multiple plans' : (dietTemplates.find((t: any) => t.id === (segs[0]?.templateId || ''))?.name || '');
                await fetch(`${API_BASE}/patients/${pid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify({ diet_plan: label }) });
                setPatients((prev: any[]) => prev.map((x) => x.id === pid ? { ...x, dietPlan: label } : x));
                setPatientTherapyTags((prev: any) => ({ ...prev, [pid]: assignmentTherapyIds }));
                setEditAssignmentPatientId(null);
                toast.success('Assignment updated');
              } catch (e) {
                toast.error('Failed to save assignment');
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DietTab;
