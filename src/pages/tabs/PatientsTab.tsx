import { useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { shareLink } from "@/lib/shareLink";
import { BottomSheet } from "@/components/BottomBar";
import { API_BASE } from "@/lib/apiBase";
import type { CardAppt } from "@/components/TreatmentCard";
import DayDietDialog from "./DayDietDialog";
import DischargeForm, { type DischargeView } from "@/components/DischargeForm";
import { API_TOKEN, fetchJsonWithTimeout, toLocalInput, type ApiAppointment, type ApiStay, type Patient as PatientRow, type UiStaff } from "./shared";
import PageHead from "@/components/PageHead";
import { wide, ChangeLine, DateRow, Empty, Foot, Group, ListGroup, Loading, More, Picker, Row, Seg, Switch, Text, dayText, noteText } from "@/components/kit";
import { marked } from "@/components/SearchScreen";
// removed dialog import to avoid dev parse error

type Patient = { id: string | number; name: string; phone?: string; gender: string; actualStart?: string; actualEnd?: string; preferredStaffId?: string | null; requiresPreferredStaff?: boolean };

/** "26 Sep": a stay is whole days, so no time. */
const longDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const stayDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const blankNew = () => ({ name: '', gender: '' as '' | 'Female' | 'Male' | 'Other', arriving: '', leaving: '', onSite: true, phone: '', emergencyContact: '', emergencyPhone: '', address: '', country: '', idNumber: '', registrationNumber: '' });
type Slot = { date: string; start_time: string; staff_id: string; staff_name: string; room_id: string; room_name: string };
const clock = (timeZone: string) => new Date().toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });

type InHouse = { id: string; name: string; Stays: { id: string; start_date: string; end_date: string }[] };
type ResidentDay = {
  id: string; name: string;
  stay: { id: string; start_date: string; end_date: string; day: number; days: number; vitals: string | null; concerns: string | null; tests: string | null } | null;
  treatments: (CardAppt & { therapy_name: string; consultation: boolean; room_name: string | null; staff_names: string[] })[];
  plan_name: string; meals: { meal: string; text: string }[];
  doctor_plan: string | null;
  last_consultation: Visit | null; next_consultation: Visit | null;
};
type Found = { id: string; name: string; plan: string; stay: { start: string; end: string } | null; last_end: string | null };
type Visit = { id: string; date: string; start_time: string; doctor: string | null; note: string | null };
const visitDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_MS = 86400000;

/**
 * Residents (#63, docs/design/phone.html): who is in house today, arriving,
 * staying and leaving, from their stays. Search finds anyone, in house or not.
 */
function ResidentsList({ patients, today, onOpen, q, everything }: { patients: Patient[]; today: string; onOpen: (id: string) => void; q: string; everything: (q: string) => void }) {
  const [inHouse, setInHouse] = useState<InHouse[] | null>(null);
  useEffect(() => {
    fetchJsonWithTimeout<InHouse[]>(`${API_BASE}/patients?resident_on=${today}`).then((r) => setInHouse(Array.isArray(r) ? r : [])).catch(() => setInHouse([]));
  }, [today, patients.length]);
  const stayOf = (p: InHouse) => p.Stays.find((s) => s.start_date.slice(0, 10) <= today && s.end_date.slice(0, 10) >= today);
  const dayOf = (s: { start_date: string; end_date: string }) => {
    const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(s.start_date)) / DAY_MS) + 1;
    const of = Math.round((Date.parse(s.end_date) - Date.parse(s.start_date)) / DAY_MS) + 1;
    return `Day ${n} of ${of} · leaves ${stayDay(s.end_date)}`;
  };
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const people = (inHouse || []).map((p) => ({ p, s: stayOf(p) })).filter((x) => x.s).sort((a, b) => byName(a.p, b.p));
  const groups: [string, typeof people][] = [
    ['Arriving today', people.filter((x) => x.s!.start_date.slice(0, 10) === today)],
    ['Leaving today', people.filter((x) => x.s!.end_date.slice(0, 10) === today && x.s!.start_date.slice(0, 10) !== today)],
    ['Staying', people.filter((x) => x.s!.start_date.slice(0, 10) !== today && x.s!.end_date.slice(0, 10) !== today)],
  ];
  const row = (id: string | number, name: string, sub: string) => <Row key={id} title={name} facts={sub} onClick={() => onOpen(String(id))} />;
  const ql = q.trim();
  // Search (#285 story 6): by name or diet plan, each result with the facts a decision needs and a flag only when it needs doing.
  const [found, setFound] = useState<{ q: string; list: Found[] } | null>(null);
  useEffect(() => {
    if (!ql) { setFound(null); return; }
    const t = setTimeout(() => {
      fetchJsonWithTimeout<{ patients: Found[] }>(`${API_BASE}/patients/find?q=${encodeURIComponent(ql)}&date=${today}`).then((r) => setFound({ q: ql, list: r.patients || [] })).catch(() => setFound({ q: ql, list: [] }));
    }, 200);
    return () => clearTimeout(t);
  }, [ql, today]);
  const leavesIn = (end: string) => Math.round((Date.parse(end) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return (
    <div>
      <PageHead title="Patients" note={inHouse === null ? '' : `${people.length} in house`} />
      {ql ? (
        found === null ? <Loading rows={3} /> : (<>
          <ListGroup title={`Patients matching “${found.q}”`} count={found.list.length}>
            {found.list.length ? found.list.map((f) => {
              const n = f.stay ? leavesIn(f.stay.end) : 0;
              const day = f.stay ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(f.stay.start)) / DAY_MS) + 1 : 0;
              const of = f.stay ? Math.round((Date.parse(f.stay.end) - Date.parse(f.stay.start)) / DAY_MS) + 1 : 0;
              return <Row key={f.id} onClick={() => onOpen(f.id)} title={marked(f.name, found.q)}
                facts={f.stay ? <>Day {day} of {of} · Diet: {f.plan ? marked(f.plan, found.q) : 'not chosen'}</> : f.last_end ? `Not in house · last stay to ${stayDay(f.last_end)}` : 'Not in house'}
                flag={f.stay && n <= 3 ? (n <= 0 ? 'Leaves today' : n === 1 ? 'Leaves tomorrow' : `Leaves in ${n} days`) : undefined} />;
            }) : <Empty text={`No patient or diet plan matches “${found.q}”.`} />}
          </ListGroup>
          <button type="button" className="mx-1 mt-3 min-h-11 text-base font-semibold text-primary" onClick={() => everything(found.q)}>Search everything for “{found.q}” ›</button>
        </>)
      ) : inHouse === null ? <Loading /> : people.length === 0 ? <Empty text="No one is staying today." /> : groups.filter(([, list]) => list.length).map(([title, list]) => (
        <ListGroup key={title} title={title} count={list.length}>{list.map(({ p, s }) => row(p.id, p.name, dayOf(s!)))}</ListGroup>
      ))}
    </div>
  );
}

/** One resident: the stay, today's treatments, today's meals, and what to change. */
function ResidentCard({ id, today, onClose, openTreatment, changeMeals, changeStay, book, details, detailsHint }: {
  id: string | null; today: string; onClose: () => void;
  openTreatment: (a: CardAppt) => void; changeMeals: (p: { id: string; name: string }) => void;
  changeStay: (p: ResidentDay) => void; book: (p: { id: string; name: string }) => void; details: (id: string) => void;
  /** What the Details row says: what is filled, or what to add. */
  detailsHint: (id: string) => string;
}) {
  const [d, setD] = useState<ResidentDay | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [intake, setIntake] = useState<{ vitals: string; concerns: string; tests: string } | null>(null);
  const saveIntake = async () => {
    if (!d?.stay || !intake) return;
    const body = { vitals: intake.vitals.trim() || null, concerns: intake.concerns.trim() || null, tests: intake.tests.trim() || null };
    const res = await fetch(`${API_BASE}/patients/${d.id}/stays/${d.stay.id}/arrival`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { setD({ ...d, stay: { ...d.stay, ...body } }); setIntake(null); } else toast.error("That could not be saved.");
  };
  const summary = async () => {
    if (!d?.stay) return;
    const res = await fetch(`${API_BASE}/patients/${d.id}/stays/${d.stay.id}/discharge-pdf`);
    if (!res.ok) { toast.error("The discharge summary could not be made."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `${d.name} - discharge summary.pdf`;
    a.click();
  };
  const [discharge, setDischarge] = useState<DischargeView | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const openDischarge = async () => {
    if (!d?.stay) return;
    const [view, team] = await Promise.all([
      fetchJsonWithTimeout<DischargeView>(`${API_BASE}/patients/${d.id}/stays/${d.stay.id}/discharge`).catch(() => null),
      fetchJsonWithTimeout<{ id: string; name: string; role?: string }[]>(`${API_BASE}/staff`).catch(() => []),
    ]);
    setDoctors(team.filter((x) => x.role === "doctor"));
    setDischarge(view);
  };
  const saveDischarge = async (body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/patients/${d!.id}/stays/${d!.stay!.id}/discharge`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { toast.error("The discharge summary was not saved."); return null; }
    toast.success("Saved");
    return (await res.json()) as DischargeView;
  };
  const savePlan = async () => {
    if (!d || plan === null) return;
    const res = await fetch(`${API_BASE}/patients/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctor_plan: plan.trim() || null }) });
    if (res.ok) { setD({ ...d, doctor_plan: plan.trim() || null }); setPlan(null); }
  };
  useEffect(() => {
    setD(null); setPlan(null); setIntake(null);
    if (id) fetchJsonWithTimeout<ResidentDay>(`${API_BASE}/patients/${id}/day?date=${today}`).then(setD).catch(() => setD(null));
  }, [id, today]);
  const booked = d ? d.treatments.filter((t) => !t.consultation && t.status !== 'no_show').length : 0;
  const fact = "flex w-full min-h-11 items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0";
  const label = "mx-1 mb-1.5 mt-3.5 text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground";
  return (
    <BottomSheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }} title={d?.name || 'Patient'}>
      {d ? (
        <div className="-mt-2 max-h-[70dvh] overflow-y-auto">
          <div className="text-[13px] text-muted-foreground">
            {d.stay ? `Staying ${stayDay(d.stay.start_date)} to ${stayDay(d.stay.end_date)} · day ${d.stay.day} of ${d.stay.days}` : 'Not staying today'}
          </div>
          {/* Story 4: everything a patient may have is a row with an arrow, filled when it is decided; nothing is forced. */}
          <div className="mt-2 border-t border-border">
            <ChangeLine label="Diet" value={d.plan_name || "Not chosen yet"} faint={!d.plan_name} onClick={() => changeMeals(d)} />
            <ChangeLine label="Therapies" value={booked ? `${booked} today` : "None booked today"} faint={!booked} onClick={() => book(d)} />
            {d.stay ? <ChangeLine label="Stay" value={`${stayDay(d.stay.start_date)} to ${stayDay(d.stay.end_date)}`} onClick={() => changeStay(d)} /> : <ChangeLine label="Stay" value="Not staying · add a stay" faint onClick={() => changeStay(d)} />}
            <ChangeLine label="Details" value={detailsHint(d.id)} faint onClick={() => details(d.id)} />
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
          {/* Arrival (#219): the first days, until the intake is written. Then the plan follows from the consultation. */}
          {d.stay && (d.stay.day <= 3 || !d.stay.vitals) ? (<>
            <div className={label}>Arrival</div>
            {intake === null ? (
              <div className="overflow-hidden rounded-xl border">
                <button type="button" className={fact} onClick={() => setIntake({ vitals: d.stay!.vitals || '', concerns: d.stay!.concerns || '', tests: d.stay!.tests || '' })}>
                  <span className="w-5 flex-none">{d.stay.vitals && d.stay.concerns ? '✓' : '○'}</span>
                  <span className="flex-1">{d.stay.vitals || d.stay.concerns ? [d.stay.vitals, d.stay.concerns].filter(Boolean).join(' · ') : 'Vitals and concerns'}</span>
                  <span className="text-muted-foreground">›</span>
                </button>
                <button type="button" className={fact} onClick={() => setIntake({ vitals: d.stay!.vitals || '', concerns: d.stay!.concerns || '', tests: d.stay!.tests || '' })}>
                  <span className="w-5 flex-none">{d.stay.tests ? '✓' : '○'}</span>
                  <span className="flex-1">{d.stay.tests ? `Tests: ${d.stay.tests}` : 'External tests, if any'}</span>
                  <span className="text-muted-foreground">›</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border p-3 text-[13px] text-muted-foreground">
                <label className="grid gap-1">Vitals<input autoFocus className="min-h-11 rounded-lg border px-2 text-[16px] text-foreground" placeholder="BP 130/85, pulse 72, weight 68 kg" value={intake.vitals} onChange={(e) => setIntake({ ...intake, vitals: e.target.value })} /></label>
                <label className="grid gap-1">What they came about<textarea rows={2} className="rounded-lg border p-2 text-[16px] text-foreground" value={intake.concerns} onChange={(e) => setIntake({ ...intake, concerns: e.target.value })} /></label>
                <label className="grid gap-1">External tests<input className="min-h-11 rounded-lg border px-2 text-[16px] text-foreground" placeholder="Blood sugar, thyroid" value={intake.tests} onChange={(e) => setIntake({ ...intake, tests: e.target.value })} /></label>
                <div className="flex justify-end gap-2">
                  <button type="button" className="min-h-11 rounded-full px-4 font-semibold" onClick={() => setIntake(null)}>Cancel</button>
                  <button type="button" className="min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground" onClick={saveIntake}>Save</button>
                </div>
              </div>
            )}
          </>) : null}
          {/* Departure (#219): the last two days, a closing consultation and the resident's summary. */}
          {d.stay && d.stay.day >= d.stay.days - 1 ? (<>
            <div className={label}>Departure</div>
            <div className="overflow-hidden rounded-xl border">
              <button type="button" className={fact} onClick={d.next_consultation ? undefined : () => book(d)}>
                <span className="w-5 flex-none">{d.next_consultation ? '✓' : '○'}</span>
                <span className="flex-1">{d.next_consultation ? `Closing consultation ${visitDay(d.next_consultation.date)} ${d.next_consultation.start_time}` : 'Book the closing consultation'}</span>
              </button>
              <button type="button" className={fact} onClick={openDischarge}>
                <span className="w-5 flex-none">✎</span>
                <span className="flex-1">Write the discharge summary</span>
                <span className="text-muted-foreground">›</span>
              </button>
              <button type="button" className={fact} onClick={summary}>
                <span className="w-5 flex-none">↓</span>
                <span className="flex-1">Discharge summary for {d.name.split(' ')[0]} (PDF)</span>
              </button>
            </div>
          </>) : null}
          <div className={label}>Doctor</div>
          <div className="overflow-hidden rounded-xl border">
            {([['Last', d.last_consultation], ['Next', d.next_consultation]] as const).map(([k, v]) => {
              const inner = (<>
                <span className="w-12 flex-none text-muted-foreground">{k}</span>
                <span className="flex-1">{v ? `${visitDay(v.date)}${k === 'Next' ? ` ${v.start_time}` : ''}${v.doctor ? ` · ${v.doctor}` : ''}` : k === 'Last' ? 'Not seen yet' : 'None booked · book one'}</span>
                {!v && k === 'Next' ? <span className="text-muted-foreground">›</span> : null}
              </>);
              return !v && k === 'Next' ? <button key={k} type="button" className={fact} onClick={() => book(d)}>{inner}</button> : <div key={k} className={fact}>{inner}</div>;
            })}
            {plan === null ? (
              <button type="button" className={fact} onClick={() => setPlan(d.doctor_plan || '')}>
                <span className="w-12 flex-none text-muted-foreground">Plan</span>
                <span className="flex-1">{d.doctor_plan || 'No plan written yet'}</span>
                <span className="text-muted-foreground">›</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-3">
                <textarea aria-label="Doctor's plan" autoFocus rows={4} className="w-full rounded-lg border p-2 text-[16px]" value={plan} onChange={(e) => setPlan(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="min-h-11 rounded-full px-4 font-semibold text-muted-foreground" onClick={() => setPlan(null)}>Cancel</button>
                  <button type="button" className="min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground" onClick={savePlan}>Save plan</button>
                </div>
              </div>
            )}
          </div>
          <div className={label}>Meals today{d.plan_name ? ` · ${d.plan_name}` : ''}</div>
          <div className="overflow-hidden rounded-xl border">
            {d.meals.length ? d.meals.map((m) => (
              <div key={m.meal} className={fact}><span className="w-20 flex-none text-muted-foreground">{m.meal}</span><span className="flex-1">{m.text}</span></div>
            )) : <div className={fact}>No diet plan yet</div>}
          </div>
          <div className="mt-3 border-t border-border">
            <ChangeLine label="Private link" value="Share their day" onClick={() => shareLink('patients', d.id, d.name)} />
          </div>
        </div>
      ) : <div className="py-6 text-center text-muted-foreground">…</div>}
      <BottomSheet open={!!discharge} onOpenChange={(o) => { if (!o) setDischarge(null); }} title={`Discharge summary · ${d?.name ?? ''}`}>
        {discharge ? <div className="-mt-2 max-h-[75dvh] overflow-y-auto"><DischargeForm view={discharge} admin doctors={doctors} onSave={saveDischarge} onPdf={summary} /></div> : null}
      </BottomSheet>
    </BottomSheet>
  );
}

/** The Patients screen: the Add and Details dialogs and the tab, held by the dashboard so they last as long as it does. */
export function usePatientsScreen({ patients, setPatients, staff, therapyNameById, timezone, openTreatment, book, searchEverything }: {
  patients: PatientRow[]; setPatients: React.Dispatch<React.SetStateAction<PatientRow[]>>; staff: UiStaff[];
  therapyNameById: Record<string, string>; timezone: string;
  /** A treatment on the resident card opens the treatment card, on its day. */
  openTreatment: (a: CardAppt) => void;
  /** A booking, for the patient on a card when there is one. */
  book: (p?: { id: string; name: string }) => void;
  /** "Search everything": the same words, over treatments. */
  searchEverything: (q: string) => void;
}) {
  const ADMIN_TZ = timezone;
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState(blankNew);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Opening Add fills in the likely stay: arriving today, a fortnight.
  useEffect(() => {
    if (!showAddPatient) return;
    setNewPatient((p) => ({ ...p, arriving: p.arriving || today, leaving: p.leaving || addDays(today, 13) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPatient]);
  // The consultation they are pre-booked into: the next free doctor time from the day they arrive (story 4).
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [consult, setConsult] = useState<number | 'later'>(0);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (!showAddPatient || !newPatient.arriving) return;
    setConsult(0); setChanging(false);
    fetchJsonWithTimeout<{ slots: Slot[] }>(`${API_BASE}/consultations/next?date=${newPatient.arriving}${newPatient.arriving === today ? `&now=${clock(timezone)}` : ''}`)
      .then((r) => setSlots((r.slots || []).filter((x) => x.date <= newPatient.leaving))).catch(() => setSlots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPatient, newPatient.arriving]);
  const toRow = (c: any): PatientRow => ({
    id: c.id, name: c.name, phone: c.phone || '', email: c.email || '',
    gender: c.gender === 'male' ? 'Male' : c.gender === 'female' ? 'Female' : 'Other',
    dob: '', emergencyContact: c.emergency_contact || '', emergencyPhone: c.emergency_phone || '', address: c.address || '', country: c.country || '', idNumber: c.id_number || '', registrationNumber: c.registration_number || '', medicalNotes: c.medical_notes || '',
    actualStart: c.Stays?.[0]?.start_date || '', actualEnd: c.Stays?.[0]?.end_date || '',
  });
  const saveNewPatient = async () => {
    const n = newPatient;
    const visit = consult === 'later' ? null : slots?.[consult];
    const blank = (v: string) => v.trim() || undefined;
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: n.name.trim(), gender: n.gender.toLowerCase(), on_site: n.onSite,
        phone: blank(n.phone), emergency_contact: blank(n.emergencyContact), emergency_phone: blank(n.emergencyPhone),
        address: blank(n.address), country: blank(n.country), id_number: blank(n.idNumber), registration_number: blank(n.registrationNumber),
        stay: { start_date: n.arriving, end_date: n.leaving },
        consultation: visit ? { date: visit.date, start_time: visit.start_time, staff_id: visit.staff_id, room_id: visit.room_id } : undefined,
      }),
    });
    if (!res.ok) {
      const why = await res.json().catch(() => ({}));
      toast.error(why.message ? `${why.message} Choose another consultation time.` : 'Could not save the patient');
      return;
    }
    const created = await res.json();
    setPatients((prev) => [...prev, toRow(created)]);
    toast.success(`${created.name} added${visit ? `, consultation ${dayText(visit.date)} ${visit.start_time}` : ''}`);
    setShowAddPatient(false);
    setNewPatient(blankNew());
    // They land on their card, with everything else a row to fill in when it is decided.
    setCardId(created.id);
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
  // null while loading: an empty list would say "Not staying" and "No treatments" for a moment (#265 B2).
  const [infoAppointments, setInfoAppointments] = useState<ApiAppointment[] | null>(null);
  const [infoStays, setInfoStays] = useState<ApiStay[] | null>(null);
  const showPatientInfo = async (p: PatientRow) => {
    setInfoPatient(p);
    setInfoDraft({ ...p });
    setInfoAppointments(null);
    setInfoStays(null);
    try {
      const [appts, stays] = await Promise.all([
        fetchJsonWithTimeout<ApiAppointment[]>(`${API_BASE}/appointments?patient_id=${p.id}`),
        fetchJsonWithTimeout<ApiStay[]>(`${API_BASE}/patients/${p.id}/stays`),
      ]);
      setInfoAppointments(Array.isArray(appts) ? appts : []);
      setInfoStays(Array.isArray(stays) ? stays : []);
    } catch {
      setInfoAppointments([]);
      setInfoStays([]);
    }
  };

  const saveDetails = async () => {
    if (!infoDraft) return;
    const d = infoDraft;
    const res = await fetch(`${API_BASE}/patients/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify({
      name: d.name.trim() || undefined, phone: d.phone, email: d.email, emergency_contact: d.emergencyContact, emergency_phone: d.emergencyPhone,
      address: d.address, country: d.country, id_number: d.idNumber, registration_number: d.registrationNumber, medical_notes: d.medicalNotes, date_of_birth: d.dob || undefined,
    }) });
    if (!res.ok) { toast.error('That was not saved. Try again.'); return; }
    setPatients((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d, name: d.name.trim() || x.name } : x)));
    toast.success('Saved');
    setInfoPatient(null);
  };
  const toLocalDisplayNoSeconds = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { timeZone: ADMIN_TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [mealsFor, setMealsFor] = useState<{ id: string; name: string } | null>(null);
  const tab = (
    <>
      <ResidentsList patients={patients} today={today} onOpen={setCardId} q={query} everything={searchEverything} />
    </>
  );

  const dialogs = (
    <>
      {/* With the dialogs, not the Residents tab: a card opened from the day changes meals too. */}
      <DayDietDialog patient={mealsFor} onClose={() => setMealsFor(null)} />
      <ResidentCard id={cardId} today={today} onClose={() => setCardId(null)}
        openTreatment={(a) => { setCardId(null); openTreatment(a); }}
        changeMeals={(p) => { setCardId(null); setMealsFor(p); }}
        changeStay={(d) => {
          const row = patients.find((x) => String(x.id) === d.id);
          if (row) setInfoPatient(row);
          setCardId(null);
          setStayEdit(d.stay ? { id: d.stay.id, start: d.stay.start_date, end: d.stay.end_date } : { id: null, start: today, end: addDays(today, 13) });
        }}
        book={(p) => { setCardId(null); book(p); }}
        detailsHint={(id) => { const r = patients.find((x) => String(x.id) === id); return r?.phone || r?.emergencyContact ? [r.phone, r.emergencyContact].filter(Boolean).join(' · ') : 'Add phone, emergency contact…'; }}
        details={(id) => { const row = patients.find((x) => String(x.id) === id); setCardId(null); if (row) showPatientInfo(row); }} />

      <BottomSheet open={showAddPatient} onOpenChange={(open) => { setShowAddPatient(open); if (!open) setNewPatient(blankNew()); }} title="New patient" note="Only name and gender are needed. Everything else can wait."
        foot={<button type="button" className={`${wide} bg-primary text-primary-foreground disabled:opacity-50`} disabled={!newPatient.name.trim() || !newPatient.gender || newPatient.leaving < newPatient.arriving} onClick={saveNewPatient}>{newPatient.name.trim() ? `Add ${newPatient.name.trim()}` : 'Add patient'}</button>}>
        <Text label="Name" autoComplete="off" value={newPatient.name} valid={newPatient.name.trim().length > 1} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} />
        {/* Nothing chosen to start with (#283): a list that opened on Male made every resident one until corrected. */}
        <Group label="Gender">
          <Seg options={[["Female", "Female"], ["Male", "Male"], ["Other", "Other"]]} value={newPatient.gender} onChange={(gender) => setNewPatient({ ...newPatient, gender })} />
        </Group>
        <div className="grid grid-cols-2 gap-3">
          <DateRow label="Arriving" value={newPatient.arriving} onChange={(v) => setNewPatient({ ...newPatient, arriving: v, leaving: newPatient.leaving < v ? v : newPatient.leaving })} />
          <DateRow label="Leaving" value={newPatient.leaving} min={newPatient.arriving} onChange={(v) => setNewPatient({ ...newPatient, leaving: v })} />
        </div>
        <Switch label="Stays on site" note="Off for a day patient" on={newPatient.onSite} set={(onSite) => setNewPatient({ ...newPatient, onSite })} />
        {slots === null || slots.length === 0 ? (
          slots?.length === 0 ? <p className={`mt-3 ${noteText}`}>No doctor is free before they leave, so no consultation is booked. Book one from their card.</p> : null
        ) : (
          <div className="mt-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0"><b className="block">First consultation</b>
                <span className={`block ${noteText}`}>{consult === 'later' ? 'Later, from their card' : `${dayText(slots[consult].date)} · ${slots[consult].start_time} · ${slots[consult].staff_name}`}</span></span>
              <span className="flex flex-none text-sm font-semibold text-primary">
                {consult === 'later' ? <button type="button" className="min-h-11 px-2" onClick={() => setConsult(0)}>Book</button> : (<>
                  <button type="button" className="min-h-11 px-2" aria-expanded={changing} onClick={() => setChanging(!changing)}>Change</button>
                  <button type="button" className="min-h-11 px-2" onClick={() => { setConsult('later'); setChanging(false); }}>Later</button>
                </>)}
              </span>
            </div>
            {changing ? <div className="mt-2"><Picker value={String(consult)} onChange={(id) => { setConsult(Number(id)); setChanging(false); }}
              options={slots.map((x, i) => ({ id: String(i), name: `${dayText(x.date)} · ${x.start_time}`, note: `${x.staff_name} · ${x.room_name}`, fact: i === 0 ? 'soonest' : undefined }))} /></div> : null}
          </div>
        )}
        <More hint="phone, passport… (optional)">
          <Text label="Phone (optional)" type="tel" inputMode="tel" autoComplete="off" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} />
          <Text label="Emergency contact (optional)" autoComplete="off" value={newPatient.emergencyContact} onChange={(e) => setNewPatient({ ...newPatient, emergencyContact: e.target.value })} />
          <Text label="Emergency phone (optional)" type="tel" inputMode="tel" autoComplete="off" value={newPatient.emergencyPhone} onChange={(e) => setNewPatient({ ...newPatient, emergencyPhone: e.target.value })} />
          <Text label="Address (optional)" autoComplete="off" value={newPatient.address} onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })} />
          <Text label="Country (optional)" autoComplete="off" value={newPatient.country} onChange={(e) => setNewPatient({ ...newPatient, country: e.target.value })} />
          <Text label="Passport or ID (optional)" autoComplete="off" value={newPatient.idNumber} onChange={(e) => setNewPatient({ ...newPatient, idNumber: e.target.value })} />
          <Text label="Registration number (optional)" autoComplete="off" value={newPatient.registrationNumber} onChange={(e) => setNewPatient({ ...newPatient, registrationNumber: e.target.value })} />
        </More>
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
      {/* Filled over time (story 4): every field is editable at once, one Save, and the history of treatments and stays under it. */}
      <BottomSheet open={!!infoPatient} onOpenChange={(open) => { if (!open) setInfoPatient(null); }} title={infoPatient?.name ?? ''} note="Nothing here is required. Fill in what you have."
        foot={<Foot label={infoPatient ? `Save ${infoPatient.name.split(' ')[0]}'s details` : 'Save'} save={saveDetails} />}>
        {infoPatient && infoDraft ? (<>
          <Text label="Name" value={infoDraft.name} onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })} />
          <Text label="Phone (optional)" type="tel" inputMode="tel" value={infoDraft.phone || ''} onChange={(e) => setInfoDraft({ ...infoDraft, phone: e.target.value })} />
          <Text label="Emergency contact (optional)" value={infoDraft.emergencyContact || ''} onChange={(e) => setInfoDraft({ ...infoDraft, emergencyContact: e.target.value })} />
          <Text label="Emergency phone (optional)" type="tel" inputMode="tel" value={infoDraft.emergencyPhone || ''} onChange={(e) => setInfoDraft({ ...infoDraft, emergencyPhone: e.target.value })} />
          <Text label="Address (optional)" value={infoDraft.address || ''} onChange={(e) => setInfoDraft({ ...infoDraft, address: e.target.value })} />
          <Text label="Country (optional)" value={infoDraft.country || ''} onChange={(e) => setInfoDraft({ ...infoDraft, country: e.target.value })} />
          <Text label="Passport or ID (optional)" value={infoDraft.idNumber || ''} onChange={(e) => setInfoDraft({ ...infoDraft, idNumber: e.target.value })} />
          <Text label="Registration number (optional)" value={infoDraft.registrationNumber || ''} onChange={(e) => setInfoDraft({ ...infoDraft, registrationNumber: e.target.value })} />
          <DateRow label="Date of birth (optional)" value={infoDraft.dob || ''} onChange={(v) => setInfoDraft({ ...infoDraft, dob: v })} />
          <Text label="Email (optional)" type="email" inputMode="email" value={infoDraft.email || ''} onChange={(e) => setInfoDraft({ ...infoDraft, email: e.target.value })} />
          <Text label="Medical notes (optional)" value={infoDraft.medicalNotes || ''} onChange={(e) => setInfoDraft({ ...infoDraft, medicalNotes: e.target.value })} />
          <ListGroup title="Stays" count={infoStays?.length}>
            {infoStays === null ? <Loading rows={1} /> : infoStays.length ? infoStays.map((st) => <Row key={st.id} title={`${stayDay(st.start_date)} to ${stayDay(st.end_date)}`} facts={`${st.duration_days} days`} onClick={() => setStayEdit({ id: st.id, start: st.start_date.slice(0, 10), end: st.end_date.slice(0, 10) })} />) : <Empty text="No stays yet." />}
          </ListGroup>
          <ListGroup title="Treatments" count={infoAppointments?.length}>
            {infoAppointments === null ? <Loading rows={2} /> : infoAppointments.length ? infoAppointments.map((a) => <Row key={a.id} title={`${longDay(a.scheduled_date)} · ${a.start_time}`} facts={[therapyNameById[String(a.therapy_id)] || 'Treatment', recordLine(a)].filter(Boolean).join(' · ')} />) : <Empty text="No treatments yet." />}
          </ListGroup>
        </>) : null}
      </BottomSheet>
    </>
  );

  return { tab, dialogs, openResident: setCardId, openMeals: setMealsFor, openAdd: () => setShowAddPatient(true), query, setQuery, searching, setSearching };
}

/** What the links recorded on a treatment (#219), in a line: records only, beside the therapy. */
const recordLine = (a: ApiAppointment) => {
  const r = a.record;
  if (!r) return '';
  const checks = Object.values(r.checklist || {});
  return [
    Object.entries(r.vitals || {}).filter(([, v]) => v).map(([k, v]) => `${k === 'bp' ? 'BP' : k} ${v}`).join(', '),
    checks.length ? `${checks.filter(Boolean).length} checks ticked` : '',
    r.feedback ? `${r.feedback === 'up' ? '👍' : '👎'}${r.feedback_note ? ` ${r.feedback_note}` : ''}` : '',
  ].filter(Boolean).join(' · ');
};
