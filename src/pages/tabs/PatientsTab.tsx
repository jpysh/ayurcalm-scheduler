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
import { BottomSheet } from "@/components/BottomBar";
import { API_BASE } from "@/lib/apiBase";
import type { CardAppt } from "@/components/TreatmentCard";
import DayDietDialog from "./DayDietDialog";
import { API_TOKEN, fetchJsonWithTimeout, toLocalInput, type ApiAppointment, type ApiDietPlan, type ApiStay, type Patient as PatientRow, type UiStaff } from "./shared";
// removed dialog import to avoid dev parse error

type Patient = { id: string | number; name: string; phone?: string; gender: string; actualStart?: string; actualEnd?: string; dietPlan?: string; preferredStaffId?: string | null; requiresPreferredStaff?: boolean };

/** "26 Sep": a stay is whole days, so no time. */
const stayDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const blankNew = () => ({ name: '', phone: '', gender: 'Male', arriving: '', leaving: '', templateId: '' });

type InHouse = { id: string; name: string; Stays: { id: string; start_date: string; end_date: string }[] };
type ResidentDay = {
  id: string; name: string;
  stay: { id: string; start_date: string; end_date: string; day: number; days: number } | null;
  treatments: (CardAppt & { therapy_name: string; room_name: string | null; staff_names: string[] })[];
  plan_name: string; meals: { meal: string; text: string }[];
};
const DAY_MS = 86400000;

/**
 * Residents (#63, docs/design/phone.html): who is in house today, arriving,
 * staying and leaving, from their stays. Search finds anyone, in house or not.
 */
function ResidentsList({ patients, today, onOpen, onAdd }: { patients: Patient[]; today: string; onOpen: (id: string) => void; onAdd: () => void }) {
  const [inHouse, setInHouse] = useState<InHouse[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    fetchJsonWithTimeout<InHouse[]>(`${API_BASE}/patients?resident_on=${today}`).then((r) => setInHouse(Array.isArray(r) ? r : [])).catch(() => setInHouse([]));
  }, [today, patients.length]);
  const stayOf = (p: InHouse) => p.Stays.find((s) => s.start_date.slice(0, 10) <= today && s.end_date.slice(0, 10) >= today);
  const dayOf = (s: { start_date: string; end_date: string }) => {
    const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(s.start_date)) / DAY_MS) + 1;
    const of = Math.round((Date.parse(s.end_date) - Date.parse(s.start_date)) / DAY_MS) + 1;
    return `${stayDay(s.start_date)} to ${stayDay(s.end_date)} · day ${n} of ${of}`;
  };
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const people = (inHouse || []).map((p) => ({ p, s: stayOf(p) })).filter((x) => x.s).sort((a, b) => byName(a.p, b.p));
  const groups: [string, typeof people][] = [
    ['Arriving today', people.filter((x) => x.s!.start_date.slice(0, 10) === today)],
    ['Leaving today', people.filter((x) => x.s!.end_date.slice(0, 10) === today && x.s!.start_date.slice(0, 10) !== today)],
    ['Staying', people.filter((x) => x.s!.start_date.slice(0, 10) !== today && x.s!.end_date.slice(0, 10) !== today)],
  ];
  const row = (id: string | number, name: string, sub: string) => (
    <button key={id} type="button" onClick={() => onOpen(String(id))} className="flex w-full min-h-[54px] flex-col justify-center border-b border-border px-3 py-2 text-left last:border-b-0">
      <span className="text-[16px] font-semibold">{name}</span>
      {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
    </button>
  );
  const ql = q.trim().toLowerCase();
  const inHouseIds = new Set(people.map((x) => x.p.id));
  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
        <h1 className="text-[22px] font-semibold">Residents</h1>
        <span className="text-[13px] text-muted-foreground">{inHouse === null ? '' : `${people.length} in house`}</span>
      </div>
      <input className="mb-2 min-h-11 w-full rounded-full border-[1.5px] border-border bg-card px-4 text-base outline-none" placeholder="Search all residents" aria-label="Search residents"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {ql ? (
        <div className="overflow-hidden rounded-2xl bg-card">
          {patients.filter((p) => p.name.toLowerCase().includes(ql)).sort(byName).slice(0, 40)
            .map((p) => row(p.id, p.name, inHouseIds.has(String(p.id)) ? 'In house' : p.actualEnd ? `Last stay to ${stayDay(p.actualEnd)}` : ''))}
        </div>
      ) : groups.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title}>
          <div className="flex justify-between px-1 pb-1.5 pt-3 text-[13px] font-bold">{title}<span className="font-normal text-muted-foreground">{list.length}</span></div>
          <div className="overflow-hidden rounded-2xl bg-card">{list.map(({ p, s }) => row(p.id, p.name, dayOf(s!)))}</div>
        </section>
      ))}
      <Button variant="outline" className="mt-3 h-12 w-full rounded-full" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />New resident</Button>
    </div>
  );
}

/** One resident: the stay, today's treatments, today's meals, and what to change. */
function ResidentCard({ id, today, onClose, openTreatment, changeMeals, changeStay, book, details }: {
  id: string | null; today: string; onClose: () => void;
  openTreatment: (a: CardAppt) => void; changeMeals: (p: { id: string; name: string }) => void;
  changeStay: (p: ResidentDay) => void; book: () => void; details: (id: string) => void;
}) {
  const [d, setD] = useState<ResidentDay | null>(null);
  useEffect(() => {
    setD(null);
    if (id) fetchJsonWithTimeout<ResidentDay>(`${API_BASE}/patients/${id}/day?date=${today}`).then(setD).catch(() => setD(null));
  }, [id, today]);
  const fact = "flex w-full min-h-11 items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0";
  const label = "mx-1 mb-1.5 mt-3.5 text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground";
  return (
    <BottomSheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }} title={d?.name || 'Resident'}>
      {d ? (
        <div className="-mt-2 max-h-[70dvh] overflow-y-auto">
          <div className="text-[13px] text-muted-foreground">
            {d.stay ? `Staying ${stayDay(d.stay.start_date)} to ${stayDay(d.stay.end_date)} · day ${d.stay.day} of ${d.stay.days}` : 'Not staying today'}
          </div>
          <div className={label}>Treatments today</div>
          <div className="overflow-hidden rounded-xl border">
            {d.treatments.length ? d.treatments.map((t) => (
              <button key={t.id} type="button" className={fact} onClick={() => openTreatment(t)}>
                <span className="w-12 flex-none tabular-nums text-muted-foreground">{t.start_time}</span>
                <span className="flex-1">{t.status === 'no_show' ? <s>{t.therapy_name}</s> : t.therapy_name} · {t.staff_names.length ? `with ${t.staff_names.join(' & ')}` : 'no therapist'}</span>
                <span className="text-[13px] text-muted-foreground">{t.room_name}</span>
              </button>
            )) : <div className={fact}>Rest day</div>}
          </div>
          <div className={label}>Meals today{d.plan_name ? ` · ${d.plan_name}` : ''}</div>
          <div className="overflow-hidden rounded-xl border">
            {d.meals.length ? d.meals.map((m) => (
              <div key={m.meal} className={fact}><span className="w-20 flex-none text-muted-foreground">{m.meal}</span><span className="flex-1">{m.text}</span></div>
            )) : <div className={fact}>No diet plan yet</div>}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border">
            {([["Change today's meals", () => changeMeals(d)], ['Change stay dates', () => changeStay(d)], ['Book a treatment', book], ['Details', () => details(d.id)]] as const).map(([t, go]) => (
              <button key={t} type="button" className={fact} onClick={go}><span className="flex-1">{t}</span><span className="text-muted-foreground">›</span></button>
            ))}
          </div>
        </div>
      ) : <div className="py-6 text-center text-muted-foreground">…</div>}
    </BottomSheet>
  );
}

/** The Patients screen: the Add and Details dialogs and the tab, held by the dashboard so they last as long as it does. */
export function usePatientsScreen({ patients, setPatients, staff, therapyNameById, timezone, openTreatment, book }: {
  patients: PatientRow[]; setPatients: React.Dispatch<React.SetStateAction<PatientRow[]>>; staff: UiStaff[];
  therapyNameById: Record<string, string>; timezone: string;
  /** A treatment on the resident card opens the treatment card, on its day. */
  openTreatment: (a: CardAppt) => void;
  book: () => void;
}) {
  const ADMIN_TZ = timezone;
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState(blankNew);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Opening Add fills in the likely stay: arriving today, a fortnight.
  useEffect(() => {
    if (!showAddPatient) return;
    setNewPatient((p) => ({ ...p, arriving: p.arriving || today, leaving: p.leaving || addDays(today, 13) }));
    fetchJsonWithTimeout<{ id: string; name: string }[]>(`${API_BASE}/diet-templates`).then((t) => setTemplates(Array.isArray(t) ? t : [])).catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPatient]);
  const toRow = (c: any): PatientRow => ({
    id: c.id, name: c.name, phone: c.phone || '', email: c.email || '',
    gender: c.gender === 'male' ? 'Male' : c.gender === 'female' ? 'Female' : 'Other',
    dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: c.medical_notes || '', dietPlan: c.diet_plan || '',
    actualStart: c.Stays?.[0]?.start_date || '', actualEnd: c.Stays?.[0]?.end_date || '',
  });
  const saveNewPatient = async () => {
    if (!newPatient.name.trim()) { toast.error('A name is needed'); return; }
    if (newPatient.leaving < newPatient.arriving) { toast.error('Leaving must be on or after arriving'); return; }
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPatient.name.trim(), phone: newPatient.phone, gender: newPatient.gender.toLowerCase(),
        stay: { start_date: newPatient.arriving, end_date: newPatient.leaving },
        template_id: newPatient.templateId || undefined,
      }),
    });
    if (!res.ok) { toast.error('Could not save the resident'); return; }
    const created = await res.json();
    setPatients((prev) => [...prev, toRow(created)]);
    toast.success(`${created.name} added, ${stayDay(newPatient.arriving)} to ${stayDay(newPatient.leaving)}`);
    setShowAddPatient(false);
    setNewPatient(blankNew());
  };

  // The resident card's stay: one sheet to extend, shorten or end it today.
  const [stayEdit, setStayEdit] = useState<{ id: string | null; start: string; end: string } | null>(null);
  const [leftOver, setLeftOver] = useState<ApiAppointment[]>([]);
  const refreshStays = async (id: string) => {
    const stays = await fetchJsonWithTimeout<ApiStay[]>(`${API_BASE}/patients/${id}/stays`);
    setInfoStays(stays);
    const patch = { actualStart: stays[0]?.start_date || '', actualEnd: stays[0]?.end_date || '' };
    setPatients((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setInfoPatient((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const saveStay = async () => {
    if (!infoPatient || !stayEdit) return;
    if (stayEdit.end < stayEdit.start) { toast.error('Leaving must be on or after arriving'); return; }
    const body = JSON.stringify({ start_date: stayEdit.start, end_date: stayEdit.end });
    const headers = { 'Content-Type': 'application/json' };
    // No stay, or a stay already over: a returning resident gets a new stay, not a new record.
    const res = stayEdit.id
      ? await fetch(`${API_BASE}/patients/${infoPatient.id}/stays/${stayEdit.id}`, { method: 'PUT', headers, body })
      : await fetch(`${API_BASE}/patients/${infoPatient.id}/stays`, { method: 'POST', headers, body });
    if (!res.ok) { toast.error('Could not save the stay'); return; }
    const out = await res.json();
    await refreshStays(infoPatient.id);
    if (Array.isArray(out.left_over) && out.left_over.length > 0) { setLeftOver(out.left_over); return; }
    toast.success(`Stay: ${stayDay(stayEdit.start)} to ${stayDay(stayEdit.end)}`);
    setStayEdit(null);
  };
  /** Cancelled, not deleted, as one batch: Undo puts every one back. */
  const cancelLeftOver = async () => {
    const res = await fetch(`${API_BASE}/day-check/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: leftOver[0].scheduled_date.slice(0, 10), moves: leftOver.map((a) => ({ appointment_id: a.id, staff_id: a.staff_id, co_staff_ids: [], room_id: a.room_id, start_time: a.start_time, date: a.scheduled_date.slice(0, 10), cancel: true })) }),
    });
    if (!res.ok) { toast.error('Could not cancel the treatments'); return; }
    const { batch_id, applied } = await res.json();
    setLeftOver([]);
    setStayEdit(null);
    toast(`${applied} treatment${applied === 1 ? '' : 's'} cancelled`, {
      action: { label: 'Undo', onClick: () => fetch(`${API_BASE}/replan/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id }) }).then(() => toast.success('Put back as they were')) },
    });
  };
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

  const [cardId, setCardId] = useState<string | null>(null);
  const [mealsFor, setMealsFor] = useState<{ id: string; name: string } | null>(null);
  const tab = (
    <>
      <ResidentsList patients={patients} today={today} onOpen={setCardId} onAdd={() => setShowAddPatient(true)} />
      <DayDietDialog patient={mealsFor} onClose={() => setMealsFor(null)} />
    </>
  );

  const dialogs = (
    <>
      <ResidentCard id={cardId} today={today} onClose={() => setCardId(null)}
        openTreatment={(a) => { setCardId(null); openTreatment(a); }}
        changeMeals={(p) => { setCardId(null); setMealsFor(p); }}
        changeStay={(d) => {
          const row = patients.find((x) => String(x.id) === d.id);
          if (row) setInfoPatient(row);
          setCardId(null);
          setStayEdit(d.stay ? { id: d.stay.id, start: d.stay.start_date, end: d.stay.end_date } : { id: null, start: today, end: addDays(today, 13) });
        }}
        book={() => { setCardId(null); book(); }}
        details={(id) => { const row = patients.find((x) => String(x.id) === id); setCardId(null); if (row) showPatientInfo(row); }} />

      <BottomSheet open={showAddPatient} onOpenChange={(open) => { setShowAddPatient(open); if (!open) setNewPatient(blankNew()); }} title="New resident">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 grid gap-1">Name<Input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} /></label>
          <label className="grid gap-1">Phone<Input type="tel" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} /></label>
          <label className="grid gap-1">Gender
            <select className="h-10 rounded-md border border-input bg-background px-2" value={newPatient.gender} onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </label>
          <label className="grid gap-1">Arriving<Input type="date" value={newPatient.arriving} onChange={(e) => setNewPatient({ ...newPatient, arriving: e.target.value })} /></label>
          <label className="grid gap-1">Leaving<Input type="date" value={newPatient.leaving} min={newPatient.arriving} onChange={(e) => setNewPatient({ ...newPatient, leaving: e.target.value })} /></label>
          <label className="col-span-2 grid gap-1">Diet plan
            <select className="h-10 rounded-md border border-input bg-background px-2" value={newPatient.templateId} onChange={(e) => setNewPatient({ ...newPatient, templateId: e.target.value })}>
              <option value="">Not decided yet</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <Button className="col-span-2 h-12 rounded-full" onClick={saveNewPatient}>Add resident</Button>
        </div>
      </BottomSheet>
      <BottomSheet open={!!stayEdit} onOpenChange={(open) => { if (!open) { setStayEdit(null); setLeftOver([]); } }} title={stayEdit?.id ? 'Stay' : 'New stay'}>
        {stayEdit && leftOver.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Arriving<Input type="date" value={stayEdit.start} onChange={(e) => setStayEdit({ ...stayEdit, start: e.target.value })} /></label>
            <label className="grid gap-1">Leaving<Input type="date" value={stayEdit.end} min={stayEdit.start} onChange={(e) => setStayEdit({ ...stayEdit, end: e.target.value })} /></label>
            {stayEdit.id && stayEdit.end > today && stayEdit.start <= today ? (
              <Button variant="outline" className="h-12 rounded-full" onClick={() => setStayEdit({ ...stayEdit, end: today })}>Leaves today</Button>
            ) : <span />}
            <Button className="h-12 rounded-full" onClick={saveStay}>Save</Button>
          </div>
        ) : null}
        {leftOver.length > 0 ? (
          <div className="grid gap-3">
            <p>Stay saved. {leftOver.length} treatment{leftOver.length === 1 ? ' is' : 's are'} still booked after they leave:</p>
            <ul className="text-sm text-muted-foreground">
              {leftOver.slice(0, 6).map((a) => <li key={a.id}>{stayDay(a.scheduled_date)} {a.start_time} · {therapyNameById[String(a.therapy_id)] || 'Treatment'}</li>)}
              {leftOver.length > 6 ? <li>and {leftOver.length - 6} more</li> : null}
            </ul>
            <Button className="h-12 rounded-full" onClick={cancelLeftOver}>Cancel {leftOver.length === 1 ? 'it' : `all ${leftOver.length}`}</Button>
            <Button variant="outline" className="h-12 rounded-full" onClick={() => { setLeftOver([]); setStayEdit(null); }}>Keep them</Button>
          </div>
        ) : null}
      </BottomSheet>
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
                <Label>Stay</Label>
                {(() => {
                  const current = infoStays.find((st) => st.end_date.slice(0, 10) >= today);
                  return (
                    <Button variant="outline" className="w-full justify-between h-12" onClick={() => setStayEdit(current
                      ? { id: current.id, start: current.start_date.slice(0, 10), end: current.end_date.slice(0, 10) }
                      : { id: null, start: today, end: addDays(today, 13) })}>
                      {current ? `${stayDay(current.start_date)} → ${stayDay(current.end_date)}` : 'Not staying · add a stay'}
                      <span aria-hidden>›</span>
                    </Button>
                  );
                })()}
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
                        const payload = { phone: infoDraft.phone || undefined, email: infoDraft.email || undefined, emergency_contact: infoDraft.emergencyContact || undefined, emergency_phone: infoDraft.emergencyPhone || undefined, medical_notes: infoDraft.medicalNotes || undefined, diet_plan: infoDraft.dietPlan || undefined, date_of_birth: infoDraft.dob || undefined };
                        const res = await fetch(`${API_BASE}/patients/${infoDraft.id}` , { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                        const updated = await res.json();
                        setPatients((prev) => prev.map((x) => x.id === infoDraft.id ? { ...x, phone: updated.phone || '', email: updated.email || '', emergencyContact: updated.emergency_contact || '', emergencyPhone: updated.emergency_phone || '', medicalNotes: updated.medical_notes || '', dietPlan: updated.diet_plan || '', dob: updated.date_of_birth ? new Date(updated.date_of_birth).toISOString().slice(0,10) : '' } : x));
                        setInfoPatient((prev) => prev ? { ...prev, phone: updated.phone || '', email: updated.email || '', emergencyContact: updated.emergency_contact || '', emergencyPhone: updated.emergency_phone || '', medicalNotes: updated.medical_notes || '', dietPlan: updated.diet_plan || '', dob: updated.date_of_birth ? new Date(updated.date_of_birth).toISOString().slice(0,10) : '' } : prev);
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

  return { tab, dialogs, openResident: setCardId };
}
