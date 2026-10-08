import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { useShareLink, waHref } from "@/components/ShareLink";
import { BottomSheet } from "@/components/BottomBar";
import { API_BASE } from "@/lib/apiBase";
import type { CardAppt } from "@/components/TreatmentCard";
import DayDietDialog from "./DayDietDialog";
import DischargeForm, { type DischargeView } from "@/components/DischargeForm";
import { API_TOKEN, fetchJsonWithTimeout, toLocalInput, type ApiAppointment, type ApiStay, type Patient as PatientRow, type UiStaff } from "./shared";
import PageHead from "@/components/PageHead";
import { PhotoImg, shrinkPhoto } from "@/components/PassportPhoto";
import { chip, Area, ChangeLine, TextRow, ChecklistBar, DateRow, Empty, Foot, Group, ListGroup, LineSelect, Loading, More, Picker, Row, Seg, Switch, Text, dayText, dayYear, noteText, rupees, Btn, LinkBtn } from "@/components/kit";
import { AccommodationSheet, DietSheet, DischargeSheet, NextWeekSheet, PackageSheet, StaySheet, takenBy, type CardStay, type GuestRoomNight, type StayTarget } from "@/components/CardSheets";
import { marked } from "@/components/SearchScreen";
import type { AttentionItem } from "@/lib/attention";

type Patient = { id: string | number; name: string; phone?: string; gender: string; actualStart?: string; actualEnd?: string; preferredStaffId?: string | null; requiresPreferredStaff?: boolean };

/** "26 Sep": a stay is whole days, so no time. */
const longDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const stayDay = (iso?: string) => (iso ? dayText(iso) : '');
const blankNew = () => ({ name: '', gender: '' as '' | 'Female' | 'Male' | 'Other', arriving: '', leaving: '', onSite: true, phone: '', emergencyContact: '', emergencyPhone: '', address: '', country: '', idNumber: '', registrationNumber: '' });
type Slot = { date: string; start_time: string; staff_id: string; staff_name: string; room_id: string; room_name: string };
const clock = (timeZone: string) => new Date().toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });

type InHouse = { id: string; name: string; Stays: { id: string; start_date: string; end_date: string }[] };
type ResidentDay = {
  id: string; name: string;
  stay: (CardStay & { vitals: string | null; concerns: string | null; tests: string | null }) | null;
  /** A stay that starts later: its card shows before they arrive (#495). */
  coming: (CardStay & { vitals: string | null; concerns: string | null; tests: string | null }) | null;
  /** A foreign guest's Form C (#415): the day it is due, whether it is filed, and the FRRO site's fields in its order. */
  form_c: { due: string; filed: string | null; fields: [string, string][] } | null;
  /** Their latest stay, when they are not staying today and it is over (#437). */
  last_stay: { end_date: string; package: CardStay['package'] } | null;
  /** The follow-up the last discharge summary asked for (#487). */
  follow_up: { stay_id: string; due: string; done: string | null; phone: string | null; centre: string } | null;
  treatments: (CardAppt & { therapy_name: string; consultation: boolean; room_name: string | null; staff_names: string[] })[];
  plan_name: string; diet_next: { from: string; name: string } | null; meals: { meal: string; text: string }[];
  week: { date: string; treatments: { id: string; start_time: string; therapy_name: string; consultation: boolean; status: string }[] }[];
  doctor_plan: string | null;
  /** When the passport photo was kept, or null (#510). */
  passport_photo: string | null;
  /** How the guest said their stay was (#509). */
  feedback: { rating: string; note: string } | null;
  /** What therapists recorded after treatments, newest first (#508). */
  readings: { date: string; text: string }[];
  last_consultation: Visit | null; next_consultation: Visit | null;
};
type Found = { id: string; name: string; plan: string; stay: { start: string; end: string } | null; last_end: string | null };
type Visit = { id: string; date: string; start_time: string; doctor: string | null; note: string | null };
const DAY_MS = 86400000;

/**
 * Residents (#63, docs/design/phone.html): who is in house today, arriving,
 * staying and leaving, from their stays. Search finds anyone, in house or not.
 */
function ResidentsList({ patients, today, onOpen, onAdd, q, everything, openRules, needs, onNeed }: { patients: Patient[]; today: string; onOpen: (id: string) => void; onAdd: () => void; q: string; everything: (q: string) => void; openRules: () => void; /** What the rules in Settings say needs doing for a patient (#288), and what tapping one opens. */ needs: AttentionItem[]; onNeed: (i: AttentionItem) => void }) {
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [inHouse, setInHouse] = useState<InHouse[] | null>(null);
  useEffect(() => {
    fetchJsonWithTimeout<InHouse[]>(`${API_BASE}/patients?resident_on=${today}&arriving_within=7`).then((r) => setInHouse(Array.isArray(r) ? r : [])).catch(() => setInHouse([]));
  }, [today, patients.length, patients.map((p) => `${p.actualStart}${p.actualEnd}`).join()]);
  const stayOf = (p: InHouse) => p.Stays.find((s) => s.start_date.slice(0, 10) <= today && s.end_date.slice(0, 10) >= today);
  const dayOf = (s: { start_date: string; end_date: string }) => {
    const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(s.start_date)) / DAY_MS) + 1;
    const of = Math.round((Date.parse(s.end_date) - Date.parse(s.start_date)) / DAY_MS) + 1;
    return `Day ${n} of ${of} · leaves ${stayDay(s.end_date)}`;
  };
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  // Guests whose stay starts in the next week, nearest first.
  const soon = (inHouse || []).filter((p) => !stayOf(p)).map((p) => ({ p, s: p.Stays.filter((x) => x.start_date.slice(0, 10) > today).sort((x, y) => x.start_date.localeCompare(y.start_date))[0] })).filter((x) => x.s).sort((x, y) => x.s.start_date.localeCompare(y.s.start_date));
  const people = (inHouse || []).map((p) => ({ p, s: stayOf(p) })).filter((x) => x.s).sort((a, b) => byName(a.p, b.p));
  const groups: [string, typeof people][] = [
    ['Arriving today', people.filter((x) => x.s!.start_date.slice(0, 10) === today)],
    ['Leaving today', people.filter((x) => x.s!.end_date.slice(0, 10) === today && x.s!.start_date.slice(0, 10) !== today)],
    ['Staying', people.filter((x) => x.s!.start_date.slice(0, 10) !== today && x.s!.end_date.slice(0, 10) !== today)],
  ];
  // A flag only when something needs doing: the first thing the rules found, in its own words.
  const flagOf = (id: string | number) => needs.filter((i) => i.patient_id === String(id)).map((i) => i.what).join(' · ') || undefined;
  // One row a patient, with everything that needs doing under the name.
  const needy = [...new Set(needs.map((i) => i.patient_id!))].map((id) => needs.find((i) => i.patient_id === id)!);
  const row = (id: string | number, name: string, sub: string) => <Row key={id} title={name} facts={sub} flag={flagOf(id)} onClick={() => onOpen(String(id))} />;
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
      <PageHead title="Patients" note={inHouse === null ? '' : `${people.length} in house`} gear={{ label: 'What needs you: patient rules', run: openRules }} />
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
          <Btn kind="quiet" inline className="-ml-1 mt-3" onClick={() => everything(found.q)}>Search everything for “{found.q}” ›</Btn>
        </>)
      ) : inHouse === null ? <Loading /> : (<>
        <div className="flex gap-1.5 px-1 pb-1">
          <button type="button" className={chip} aria-pressed={!onlyNeeds} onClick={() => setOnlyNeeds(false)}>In house</button>
          <button type="button" className={chip} aria-pressed={onlyNeeds} onClick={() => setOnlyNeeds(true)}>Needs attention{needy.length ? ` · ${needy.length}` : ""}</button>
        </div>
        {onlyNeeds ? (
          <ListGroup>{needy.length ? needy.map((i) => <Row key={i.id} title={i.who} flag={flagOf(i.patient_id!)} trailing="›" onClick={() => onNeed(i)} />) : <Empty text="Nothing needs attention. The rules are in the gear above." />}</ListGroup>
        ) : people.length === 0 && soon.length === 0 ? <Empty text="No one is staying today." action={<Btn kind="primary" inline onClick={onAdd}>Add a patient</Btn>} /> : (<>
          {groups.filter(([, list]) => list.length).map(([title, list]) => (
            <ListGroup key={title} title={title} count={list.length}>{list.map(({ p, s }) => row(p.id, p.name, dayOf(s!)))}</ListGroup>
          ))}
          {soon.length ? <ListGroup title="Arriving soon" count={soon.length}>{soon.map(({ p, s }) => row(p.id, p.name, `Arrives ${stayDay(s.start_date)} · leaves ${stayDay(s.end_date)}`))}</ListGroup> : null}
        </>)}
      </>)}
    </div>
  );
}

/** One resident: the stay, today's treatments, today's meals, and what to change. */
function ResidentCard({ id, today, onClose, openTreatment, changeMeals, changePackage, changeHouse, changeStay, book, details, detailsHint }: {
  id: string | null; today: string; onClose: () => void;
  openTreatment: (a: CardAppt) => void; changeMeals: (p: { id: string; name: string }) => void;
  changePackage: (p: ResidentDay) => void; changeHouse: (p: ResidentDay) => void;
  changeStay: (p: ResidentDay) => void; book: (p: { id: string; name: string; consult?: boolean; date?: string }) => void; details: (id: string) => void;
  /** What the Details row says: what is filled, or what to add. */
  detailsHint: (id: string) => string;
}) {
  const [d, setD] = useState<ResidentDay | null>(null);
  const link = useShareLink();
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
    load();
    return (await res.json()) as DischargeView;
  };
  const savePlan = async () => {
    if (!d || plan === null) return;
    const res = await fetch(`${API_BASE}/patients/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctor_plan: plan.trim() || null }) });
    if (res.ok) { setD({ ...d, doctor_plan: plan.trim() || null }); setPlan(null); }
  };
  const load = () => { if (id) fetchJsonWithTimeout<ResidentDay>(`${API_BASE}/patients/${id}/day?date=${today}`).then(setD).catch(() => setD(null)); };
  useEffect(() => {
    setD(null); setPlan(null); setIntake(null); setChecklist(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, today]);
  const [checklist, setChecklist] = useState(false);
  const [week, setWeek] = useState(false);
  const [formC, setFormC] = useState(false);
  // The passport photo (#510): the phone's camera, shrunk before it leaves.
  const [photoOpen, setPhotoOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const keepPhoto = async (file: File | undefined) => {
    if (!file || !d) return;
    try {
      const image = await shrinkPhoto(file);
      const res = await fetch(`${API_BASE}/patients/${d.id}/passport-photo`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: image });
      if (!res.ok) throw new Error();
      toast.success("Photo kept"); load();
    } catch { toast.error("The photo could not be kept. Try again."); }
  };
  const dropPhoto = async () => {
    if (!d) return;
    await fetch(`${API_BASE}/patients/${d.id}/passport-photo`, { method: "DELETE" });
    setPhotoOpen(false); load();
  };
  const [followUp, setFollowUp] = useState(false);
  const markFollowUp = async (done: boolean) => {
    const res = await fetch(`${API_BASE}/patients/${d!.id}/stays/${d!.follow_up!.stay_id}/follow-up`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) });
    if (!res.ok) { toast.error("That could not be saved."); return; }
    setFollowUp(false); load();
  };
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); } catch { toast.error("Could not copy. Press and hold the text instead."); }
  };
  const fileFormC = async (filed: boolean) => {
    const res = await fetch(`${API_BASE}/patients/${d!.id}/stays/${up!.id}/form-c`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filed }) });
    if (!res.ok) { toast.error("That could not be saved."); return; }
    setFormC(false); load();
  };
  // The week after the review: today's if the doctor saw them today, else the coming one, else (none booked yet, #523) today; next week repeats the week up to it and books the review.
  const weekFrom = d ? (d.last_consultation?.date.slice(0, 10) === today ? today : (d.next_consultation || d.last_consultation)?.date.slice(0, 10) ?? today) : undefined;
  const startIntake = (x: ResidentDay) => ({ vitals: x.stay!.vitals || '', concerns: x.stay!.concerns || '', tests: x.stay!.tests || '' });
  const visit = (v: Visit, withTime: boolean) => `${dayText(v.date)}${withTime ? ` ${v.start_time}` : ''}${v.doctor ? ` · ${v.doctor}` : ''}`;
  // On the last day the discharge comes first and nothing more is booked (#406).
  const leavingToday = !!d?.stay && d.stay.day === d.stay.days;
  const bar = d?.stay?.discharge ? <div className="mt-3"><ChecklistBar label="Discharge summary" done={d.stay.discharge.done} total={d.stay.discharge.total} onClick={() => setChecklist(true)} /></div> : null;
  // Story s18 (#422): what a new patient needs, on the arrival days, each step opening its own line.
  const up = d?.stay ?? d?.coming ?? null;
  const arriving = !!up && (up.day <= 3 || !up.vitals);
  const steps = d && up && arriving ? ([
    ['Consultation', !!(d.last_consultation || d.next_consultation), d.next_consultation ? visit(d.next_consultation, true) : d.last_consultation ? `Seen ${visit(d.last_consultation, false)}` : undefined, () => book({ id: d.id, name: d.name, consult: true })],
    ['Diet', !!d.plan_name, d.plan_name || undefined, () => changeMeals(d)],
    ['Package', !!up.package, up.package ? `${up.package.days} days` : undefined, () => changePackage(d)],
    ...(up.on_site !== false ? [['Guest room', !!up.accommodation, up.accommodation?.room?.name ?? up.accommodation?.name, () => changeHouse(d)]] : []),
    ...(d.form_c ? [['Form C', !!d.form_c.filed, d.form_c.filed ? `Filed ${dayText(d.form_c.filed)}` : undefined, () => setFormC(true)]] : []),
  ] as [string, boolean, string | undefined, () => void][]) : null;
  const [arrival, setArrival] = useState(false);
  const nights = up ? Math.round((Date.parse(up.end_date) - Date.parse(up.start_date)) / DAY_MS) : 0;
  return (
    <>
    <BottomSheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }} title={d?.name || 'Patient'}>
      {d ? (
        <div className="-mt-2 max-h-[70dvh] overflow-y-auto">
          <div className="text-sm text-muted-foreground">
            {d.stay ? `Staying ${stayDay(d.stay.start_date)} to ${stayDay(d.stay.end_date)} · day ${d.stay.day} of ${d.stay.days}` : d.coming ? `Arrives ${stayDay(d.coming.start_date)} · leaves ${stayDay(d.coming.end_date)}` : d.last_stay ? `Stayed until ${stayDay(d.last_stay.end_date)}` : 'Not staying today'}
          </div>
          {leavingToday ? bar : null}
          {steps && !leavingToday ? <div className="mt-3"><ChecklistBar label="Arrival" done={steps.filter((x) => x[1]).length} total={steps.length} onClick={() => setArrival(true)} /></div> : null}
          {/* Story 14 (#353): the week and the doctor come first; the change lines follow, then the arrival notes. */}
          {/* Story 14 (#350): the week the doctor planned. A day with nothing booked before the next review needs booking; after it, planning waits for the review. */}
          {d.week.length > 1 ? (() => {
            const review = d.next_consultation?.date;
            const days = d.week.slice(1);
            // Empty days after the review are one row: planning them is the review's job.
            const isLater = (w: typeof days[number]) => !!review && w.date > review && !w.treatments.length && w.date !== d.stay?.end_date;
            // Each run of them folds where it falls, so the days still read in order once some are booked (#370).
            const rows: (typeof days | typeof days[number])[] = [];
            for (const w of days) {
              const last = rows[rows.length - 1];
              if (!isLater(w)) rows.push(w);
              else if (Array.isArray(last)) last.push(w);
              else rows.push([w]);
            }
            return (<>
              <ListGroup title="Next days">
                {rows.map((w) => Array.isArray(w) ? (
                  <Row key={w[0].date} title={w.length === 1 ? dayText(w[0].date) : `${dayText(w[0].date)} to ${dayText(w[w.length - 1].date)}`}
                    facts="Not planned yet: after the review" onClick={() => book({ id: d.id, name: d.name, date: w[0].date })} />
                ) : (() => {
                  const leaving = w.date === d.stay?.end_date;
                  const empty = !w.treatments.length;
                  return (
                    <Row key={w.date} title={dayText(w.date)} onClick={() => book({ id: d.id, name: d.name, date: w.date })}
                      facts={empty ? (leaving ? 'Leaving day' : undefined) : w.treatments.map((t) => `${t.start_time} ${t.therapy_name}`).join(' · ')}
                      flag={empty && !leaving ? 'Nothing booked' : undefined}
                      trailing={w.date === review ? 'Review' : undefined} />
                  );
                })())}
              </ListGroup>
              {/* Story 14 (#354): after the review, next week is this week again; one sheet, Book all. */}
              {weekFrom ? <Btn kind="primary" className="mt-3" onClick={() => setWeek(true)}>Plan next week</Btn> : null}
            </>);
          })() : null}
          <ListGroup title="Doctor">
            {d.last_consultation?.note ? <TextRow label={`Last seen · ${visit(d.last_consultation, false)}`}>{d.last_consultation.note}</TextRow>
              : <ChangeLine label="Last seen" value={d.last_consultation ? visit(d.last_consultation, false) : 'Not seen yet'} faint={!d.last_consultation} />}
            <ChangeLine label="Next" value={d.next_consultation ? visit(d.next_consultation, true) : leavingToday ? 'None · leaving today' : 'None booked · book one'} faint={!d.next_consultation} onClick={d.next_consultation || leavingToday ? undefined : () => book({ id: d.id, name: d.name, consult: true })} />
            {d.feedback ? <TextRow label="Their stay">{`${({ good: "Very good", fine: "Fine", poor: "Not good" } as Record<string, string>)[d.feedback.rating] ?? d.feedback.rating}${d.feedback.note ? `: “${d.feedback.note}”` : ""}`}</TextRow> : null}
            {d.readings.length ? <TextRow label="Readings">{d.readings.map((r) => `${r.text} · ${dayText(r.date)}`).join("  ·  ")}</TextRow> : null}
            <TextRow label="Plan" faint={!d.doctor_plan} onClick={() => setPlan(d.doctor_plan || '')}>{d.doctor_plan || 'No plan written yet'}</TextRow>
          </ListGroup>
          {/* Story 4: everything a patient may have is a row with an arrow, filled when it is decided; nothing is forced. */}
          <div className="mt-3 border-t border-border">
            <ChangeLine label="Diet" value={d.plan_name ? (d.diet_next ? `${d.plan_name}, then ${d.diet_next.name} from ${dayText(d.diet_next.from)}` : d.plan_name) : "Not decided yet"} faint={!d.plan_name} onClick={() => changeMeals(d)} />
            {up ? <ChangeLine label="Package" value={up.package ? `${up.package.days} days · ${rupees(up.package.price)}` : "Not decided yet"} faint={!up.package} onClick={() => changePackage(d)} /> : null}
            {up && up.on_site !== false ? <ChangeLine label="Accommodation" value={up.accommodation ? `${up.accommodation.name}${up.accommodation.room ? ` · ${up.accommodation.room.name}` : ""} · ${nights} nights · ${rupees(nights * up.accommodation.price_per_day)}` : "Not decided yet"} faint={!up.accommodation} onClick={() => changeHouse(d)} /> : null}
            {d.follow_up ? <ChangeLine label="Follow-up" value={d.follow_up.done ? `Done ${dayText(d.follow_up.done)}` : `Due ${dayText(d.follow_up.due)}`} onClick={() => setFollowUp(true)} /> : null}
            {d.form_c ? <ChangeLine label="Form C" value={d.form_c.filed ? `Filed ${dayText(d.form_c.filed)}` : `Due by ${dayText(d.form_c.due)}${d.form_c.fields.some(([, v]) => !v) ? ` · ${d.form_c.fields.filter(([, v]) => !v).length} missing` : ''}`} onClick={() => setFormC(true)} /> : null}
            <ChangeLine label="Passport photo" value={d.passport_photo ? `Kept ${dayText(d.passport_photo)}` : "Take a photo"} faint={!d.passport_photo} onClick={() => (d.passport_photo ? setPhotoOpen(true) : photoInput.current?.click())} />
            <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void keepPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {up ? <ChangeLine label="Stay" value={`${stayDay(up.start_date)} to ${stayDay(up.end_date)}`} onClick={() => changeStay(d)} /> : <ChangeLine label={d.last_stay ? 'New stay' : 'Stay'} value={d.last_stay?.package ? `From today · ${d.last_stay.package.name}` : 'Not staying · add a stay'} faint={!d.last_stay} onClick={() => changeStay(d)} />}
            <ChangeLine label="Details" value={detailsHint(d.id)} faint onClick={() => details(d.id)} />
          </div>
          {/* Story 8: what the summary still lacks. It informs and never blocks; printing is always there. */}
          {leavingToday ? null : bar}
          {/* Not here (yet, or any more) there is no day to rest: the group is only for a guest who is staying or has something booked (#514). */}
          {d.stay || d.treatments.length ? (
            <ListGroup title="Treatments today">
              {d.treatments.length ? d.treatments.map((t) => (
                <Row key={t.id} onClick={() => openTreatment(t)} title={<>{t.start_time} · {t.status === 'no_show' ? <s>{t.therapy_name}</s> : t.therapy_name}</>}
                  facts={t.staff_names.length ? `with ${t.staff_names.join(' & ')}` : 'No therapist yet'} trailing={t.room_name || undefined} />
              )) : <Empty text="Rest day: nothing booked today." />}
            </ListGroup>
          ) : null}
          {/* Arrival (#219): the first days, until the intake is written. Then the plan follows from the consultation. */}
          {d.stay && (d.stay.day <= 3 || !d.stay.vitals) ? (
            <ListGroup title="Arrival">
              <TextRow label="Vitals and what they came about" faint={!d.stay.vitals && !d.stay.concerns} onClick={() => setIntake(startIntake(d))}>{d.stay.vitals || d.stay.concerns ? [d.stay.vitals, d.stay.concerns].filter(Boolean).join(' · ') : 'Not written yet'}</TextRow>
              <TextRow label="External tests" faint={!d.stay.tests} onClick={() => setIntake(startIntake(d))}>{d.stay.tests || 'None recorded'}</TextRow>
            </ListGroup>
          ) : null}
          <div className="mt-3 border-t border-border">
            <ChangeLine label="Private link" value="Share their day" onClick={() => link.share('patients', d.id, d.name)} />
          </div>
        </div>
      ) : <div className="py-6 text-center text-muted-foreground"><Loading rows={4} /></div>}
      <BottomSheet open={intake !== null} onOpenChange={(o) => { if (!o) setIntake(null); }} title={`Arrival · ${d?.name.split(' ')[0] ?? ''}`} note="Written once, from the first days. Nothing here is required."
        foot={<Foot label="Save arrival notes" save={saveIntake} />}>
        {intake ? (<>
          <Text label="Vitals (optional)" placeholder="What was measured: BP, pulse, weight" value={intake.vitals} onChange={(e) => setIntake({ ...intake, vitals: e.target.value })} />
          <Area label="What they came about (optional)" rows={3} value={intake.concerns} onChange={(e) => setIntake({ ...intake, concerns: e.target.value })} />
          <Text label="External tests (optional)" placeholder="Blood sugar, thyroid" value={intake.tests} onChange={(e) => setIntake({ ...intake, tests: e.target.value })} />
        </>) : null}
      </BottomSheet>
      <BottomSheet open={plan !== null} onOpenChange={(o) => { if (!o) setPlan(null); }} title={`Doctor's plan · ${d?.name.split(' ')[0] ?? ''}`} note="Printed on their discharge summary."
        foot={<Foot label="Save the plan" save={savePlan} />}>
        {plan !== null ? <Area label="Plan (optional)" rows={6} value={plan} onChange={(e) => setPlan(e.target.value)} /> : null}
      </BottomSheet>
      {/* The follow-up after discharge (#487): a prepared WhatsApp, then mark it done. */}
      <BottomSheet open={followUp && !!d?.follow_up} onOpenChange={setFollowUp} title={`Follow-up · ${d?.name ?? ''}`}
        note={d?.follow_up?.done ? `Done ${dayText(d.follow_up.done)}.` : `The doctor asked to hear from them on ${d?.follow_up ? dayText(d.follow_up.due) : ''}.`}
        foot={d?.follow_up?.done ? <Btn onClick={() => markFollowUp(false)}>Not done yet</Btn> : <Btn kind="primary" onClick={() => markFollowUp(true)}>Mark follow-up done</Btn>}>
        {d?.follow_up ? <LinkBtn href={waHref(d.follow_up.phone, `Namaste ${d.name.split(' ')[0]}, this is ${d.follow_up.centre || 'the centre'}. The doctor asked us to see how you are since your stay. How are you feeling?`)}>Send on WhatsApp to {d.name.split(' ')[0]}</LinkBtn> : null}
      </BottomSheet>
      {/* Form C (#415): tap a line to copy it into indianfrro.gov.in, then mark it filed. */}
      <BottomSheet open={formC && !!d?.form_c} onOpenChange={setFormC} title={`Form C · ${d?.name ?? ''}`}
        note={d?.form_c?.filed ? `Filed ${dayText(d.form_c.filed)}.` : `Due by ${d?.form_c ? dayText(d.form_c.due) : ''}, a day after arriving. Tap a line to copy it into indianfrro.gov.in.`}
        foot={d?.form_c?.filed ? <Btn onClick={() => fileFormC(false)}>Not filed yet</Btn> : <Btn kind="primary" onClick={() => fileFormC(true)}>Mark Form C filed</Btn>}>
        {d?.passport_photo ? <PhotoImg id={d.id} kept={d.passport_photo} small onOpen={() => setPhotoOpen(true)} /> : null}
        <ListGroup>
          {d?.form_c?.fields.map(([label, value]) => value
            ? <Row key={label} title={label} facts={/^\d{4}-\d{2}-\d{2}$/.test(value) ? dayYear(value) : value} trailing="Copy" onClick={() => copy(label, value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'))} />
            : <Row key={label} title={label} flag="Not recorded" onClick={() => { setFormC(false); details(d.id); }} />)}
        </ListGroup>
      </BottomSheet>
      <BottomSheet open={photoOpen && !!d?.passport_photo} onOpenChange={setPhotoOpen} title={`Passport photo · ${d?.name.split(' ')[0] ?? ''}`} note="Kept with the patient. Only you see it."
        foot={<div className="grid gap-2"><Btn kind="primary" onClick={() => photoInput.current?.click()}>Take another</Btn><Btn onClick={dropPhoto}>Remove it</Btn></div>}>
        {d?.passport_photo ? <PhotoImg id={d.id} kept={d.passport_photo} /> : null}
      </BottomSheet>
      <BottomSheet open={arrival && !!steps} onOpenChange={setArrival} title={`Arrival · ${d?.name.split(' ')[0] ?? ''}`} note="What a new patient needs. Nothing here blocks a booking.">
        <ListGroup>
          {steps?.map(([label, done, fact, open]) => <Row key={label} title={label} facts={done ? fact ?? 'Done' : undefined} flag={done ? undefined : 'Not done yet'} trailing={done ? '✓' : undefined} onClick={() => { setArrival(false); open(); }} />)}
        </ListGroup>
      </BottomSheet>
      {d && weekFrom ? <NextWeekSheet patient={week ? d : null} review={weekFrom} onClose={() => setWeek(false)} onBooked={load}
        firstDay={d.week.find((w) => !w.treatments.length && w.date !== d.stay?.end_date)?.date ?? today}
        bookDay={(date) => { setWeek(false); book({ id: d.id, name: d.name, date }); }} /> : null}
      {checklist && d ? <DischargeSheet patient={d} stay={d.stay} onClose={() => setChecklist(false)} print={summary}
        openField={(where) => { setChecklist(false); if (where === 'details') details(d.id); else openDischarge(); }} write={() => { setChecklist(false); openDischarge(); }} /> : null}
      <BottomSheet open={!!discharge} onOpenChange={(o) => { if (!o) setDischarge(null); }} title={`Discharge summary · ${d?.name ?? ''}`}>
        {discharge ? <DischargeForm view={discharge} admin doctors={doctors} onSave={saveDischarge} onPdf={summary} /> : null}
      </BottomSheet>
    </BottomSheet>
      {link.sheet}
    </>
  );
}

/** The Patients screen: the Add and Details dialogs and the tab, held by the dashboard so they last as long as it does. */
export function usePatientsScreen({ patients, setPatients, staff, therapyNameById, timezone, startDay, openTreatment, book, searchEverything, openCatalogue, openRules, needs }: {
  /** The patient items the rules raise today: the "Needs attention" chip and the flags on rows. */
  needs: AttentionItem[];
  patients: PatientRow[]; setPatients: React.Dispatch<React.SetStateAction<PatientRow[]>>; staff: UiStaff[];
  therapyNameById: Record<string, string>; timezone: string;
  /** The day a plan starts on: today, or tomorrow after closing (#586). */
  startDay: string;
  /** A treatment on the resident card opens the treatment card, on its day. */
  openTreatment: (a: CardAppt) => void;
  /** A booking, for the patient on a card when there is one. */
  book: (p?: { id: string; name: string; consult?: boolean; date?: string }) => void;
  /** "Search everything": the same words, over treatments. */
  searchEverything: (q: string) => void;
  /** "Edit the list" on a package or accommodation picker opens that list in Settings. */
  openCatalogue: (which: 'packages' | 'accommodation') => void;
  /** The gear on the head: the rules for what Patients raises (#288). */
  openRules: () => void;
}) {
  const ADMIN_TZ = timezone;
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState(blankNew);
  // Started from the booking sheet (#330): the name is filled in, no consultation is pre-booked, and the person goes back to the booking.
  const [inline, setInline] = useState<((p: { id: string; name: string }) => void) | null>(null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Opening Add fills in the likely stay: arriving today, a fortnight.
  useEffect(() => {
    if (!showAddPatient) return;
    setNewPatient((p) => ({ ...p, arriving: p.arriving || today, leaving: p.leaving || addDays(today, 13) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPatient]);
  // Their guest room (#456): the first free for every night, cheapest type first, unless the admin chose one still free.
  const [freeRooms, setFreeRooms] = useState<GuestRoomNight[]>([]);
  const [guestRoom, setGuestRoom] = useState("");
  useEffect(() => {
    if (!showAddPatient || !newPatient.arriving || newPatient.leaving < newPatient.arriving) return;
    fetchJsonWithTimeout<GuestRoomNight[]>(`${API_BASE}/guest-rooms/free?from=${newPatient.arriving}&to=${newPatient.leaving}`).then((r) => {
      const list = Array.isArray(r) ? r : [];
      setFreeRooms(list);
      setGuestRoom((was) => (list.some((x) => x.id === was && x.free) ? was : list.find((x) => x.free)?.id ?? ""));
    });
  }, [showAddPatient, newPatient.arriving, newPatient.leaving]);
  // The consultation they are pre-booked into: the next free doctor time from the day they arrive (story 4).
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [consult, setConsult] = useState<number | 'later'>(0);
  const [why, setWhy] = useState('');
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (!showAddPatient || !newPatient.arriving) return;
    setConsult(0); setChanging(false);
    fetchJsonWithTimeout<{ slots: Slot[]; why?: string }>(`${API_BASE}/consultations/next?date=${newPatient.arriving}${newPatient.arriving === today ? `&now=${clock(timezone)}` : ''}`)
      .then((r) => { setSlots((r.slots || []).filter((x) => x.date <= newPatient.leaving)); setWhy(r.why || ''); }).catch(() => setSlots([]));
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
    const visit = inline || consult === 'later' ? null : slots?.[consult];
    const blank = (v: string) => v.trim() || undefined;
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: n.name.trim(), gender: n.gender.toLowerCase(), on_site: n.onSite,
        phone: blank(n.phone), emergency_contact: blank(n.emergencyContact), emergency_phone: blank(n.emergencyPhone),
        address: blank(n.address), country: blank(n.country), id_number: blank(n.idNumber), registration_number: blank(n.registrationNumber),
        stay: { start_date: n.arriving, end_date: n.leaving }, guest_room_id: n.onSite && guestRoom ? guestRoom : undefined,
        consultation: visit ? { date: visit.date, start_time: visit.start_time, staff_id: visit.staff_id, room_id: visit.room_id } : undefined,
      }),
    });
    if (!res.ok) {
      const why = await res.json().catch(() => ({}));
      toast.error(why.reason === 'ROOM_TAKEN' ? why.message : why.message ? `${why.message} Choose another consultation time.` : 'Could not save the patient');
      return;
    }
    const created = await res.json();
    setPatients((prev) => [...prev, toRow(created)]);
    // At the top, so it does not cover the card's Diet and Package rows; Undo takes the patient away again.
    toast.success(`${created.name} added${visit ? `, consultation ${dayText(visit.date)} ${visit.start_time}` : ''}`, {
      position: 'top-center',
      action: { label: 'Undo', onClick: async () => {
        const r = await fetch(`${API_BASE}/patients/${created.id}`, { method: 'DELETE' });
        if (!r.ok) { toast.error('Could not undo. Open the patient to remove them.'); return; }
        setPatients((prev) => prev.filter((x) => x.id !== created.id)); setCardId(null);
      } },
    });
    setShowAddPatient(false);
    setNewPatient(blankNew());
    if (inline) { inline({ id: created.id, name: created.name }); setInline(null); return; }
    // They land on their card, with everything else a row to fill in when it is decided.
    setCardId(created.id);
  };

  // The card's stay (story 10): one sheet to extend, shorten or end it, which says what follows before the tap.
  const [stayFor, setStayFor] = useState<{ patient: { id: string; name: string }; target: StayTarget } | null>(null);
  const refreshStays = async (id: string) => {
    const stays = await fetchJsonWithTimeout<ApiStay[]>(`${API_BASE}/patients/${id}/stays`);
    setInfoStays(stays);
    const patch = { actualStart: stays[0]?.start_date || '', actualEnd: stays[0]?.end_date || '' };
    setPatients((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setInfoPatient((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const [searchPatients, setSearchPatients] = useState("");
  const [infoPatient, setInfoPatient] = useState<PatientRow | null>(null);
  const [infoDraft, setInfoDraft] = useState<PatientRow | null>(null);
  // null while loading: an empty list would say "Not staying" and "No treatments" for a moment (#265 B2).
  const [infoAppointments, setInfoAppointments] = useState<ApiAppointment[] | null>(null);
  const [infoStays, setInfoStays] = useState<ApiStay[] | null>(null);
  const [allTx, setAllTx] = useState(false);
  const showPatientInfo = async (p: PatientRow) => {
    setInfoPatient(p);
    setInfoDraft({ ...p });
    setInfoAppointments(null);
    setInfoStays(null);
    setAllTx(false);
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
      address: d.address, country: d.country, id_number: d.idNumber, visa_number: d.visaNumber || null, visa_valid_until: d.visaValidUntil || null, registration_number: d.registrationNumber, medical_notes: d.medicalNotes, date_of_birth: d.dob || undefined,
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
  const [dietFor, setDietFor] = useState<{ id: string; name: string } | null>(null);
  const [dayMealsFor, setDayMealsFor] = useState<{ id: string; name: string } | null>(null);
  const [packFor, setPackFor] = useState<{ patient: { id: string; name: string }; stay: CardStay } | null>(null);
  const [houseFor, setHouseFor] = useState<{ patient: { id: string; name: string }; stay: CardStay } | null>(null);
  const [stayEnd, setStayEnd] = useState<string | null>(null);
  // A sheet opened from the card gives the card back when it closes, saved or not: the card re-reads on opening.
  const [back, setBack] = useState<string | null>(null);
  const backToCard = (close: () => void) => () => { close(); if (back) { setCardId(back); setBack(null); } };
  const tab = (
    <>
      <ResidentsList patients={patients} today={today} onOpen={setCardId} onAdd={() => setShowAddPatient(true)} q={query} everything={searchEverything} openRules={openRules} needs={needs} onNeed={(i) => (i.action === 'diet' ? setDietFor({ id: i.patient_id!, name: i.who }) : setCardId(i.patient_id!))} />
    </>
  );

  const dialogs = (
    <>
      {/* With the dialogs, not the Residents tab: a card opened from the day changes meals too. */}
      <DayDietDialog patient={dayMealsFor} day={startDay} onClose={() => setDayMealsFor(null)} />
      <DietSheet patient={dietFor} today={today} onClose={backToCard(() => setDietFor(null))} onChanged={() => {}} onDayMeals={(p) => { setDietFor(null); setBack(null); setDayMealsFor(p); }} />
      <PackageSheet patient={packFor?.patient ?? null} stay={packFor?.stay ?? null} onClose={backToCard(() => setPackFor(null))} onSaved={() => {}}
        editList={() => { setPackFor(null); setBack(null); openCatalogue('packages'); }}
        matchStay={(end) => { const f = packFor!; setPackFor(null); setStayFor({ patient: f.patient, target: { id: f.stay.id, start: f.stay.start_date, end: f.stay.end_date, package: f.stay.package, accommodation: f.stay.accommodation } }); setStayEnd(end); }} />
      <AccommodationSheet patient={houseFor?.patient ?? null} stay={houseFor?.stay ?? null} onClose={backToCard(() => setHouseFor(null))} onSaved={() => {}}
        editList={() => { setHouseFor(null); setBack(null); openCatalogue('accommodation'); }} />
      <StaySheet patient={stayFor?.patient ?? null} target={stayFor ? { ...stayFor.target, end: stayEnd ?? stayFor.target.end } : null} today={today}
        now={clock(timezone)} onClose={backToCard(() => { setStayFor(null); setStayEnd(null); })} onSaved={() => { if (stayFor) void refreshStays(stayFor.patient.id); }} />
      <ResidentCard id={cardId} today={today} onClose={() => setCardId(null)}
        openTreatment={(a) => { setCardId(null); openTreatment(a); }}
        changeMeals={(p) => { setBack(p.id); setCardId(null); setDietFor(p); }}
        changePackage={(p) => { const st = p.stay ?? p.coming; if (st) { setBack(p.id); setCardId(null); setPackFor({ patient: p, stay: st }); } }}
        changeHouse={(p) => { const st = p.stay ?? p.coming; if (st) { setBack(p.id); setCardId(null); setHouseFor({ patient: p, stay: st }); } }}
        changeStay={(d) => {
          setBack(d.id);
          setCardId(null);
          setStayFor({ patient: d, target: (d.stay ?? d.coming) ? { id: (d.stay ?? d.coming)!.id, start: (d.stay ?? d.coming)!.start_date, end: (d.stay ?? d.coming)!.end_date, package: (d.stay ?? d.coming)!.package, accommodation: (d.stay ?? d.coming)!.accommodation } : { id: null, start: today, end: addDays(today, (d.last_stay?.package?.days || 14) - 1), package: d.last_stay?.package ?? null, accommodation: null } });
        }}
        book={(p) => { setCardId(null); book(p); }}
        detailsHint={(id) => { const r = patients.find((x) => String(x.id) === id); return r?.phone || r?.emergencyContact ? [r.phone, r.emergencyContact].filter(Boolean).join(' · ') : 'Add phone, emergency contact…'; }}
        details={(id) => { const row = patients.find((x) => String(x.id) === id); setCardId(null); if (row) showPatientInfo(row); }} />

      <BottomSheet open={showAddPatient} onOpenChange={(open) => { setShowAddPatient(open); if (!open) { setNewPatient(blankNew()); setInline(null); setGuestRoom(''); } }} title="New patient" note="Only name and gender are needed. Everything else can wait."
        foot={<Btn kind="primary" disabled={!newPatient.name.trim() || !newPatient.gender || newPatient.leaving < newPatient.arriving} onClick={saveNewPatient}>{newPatient.name.trim() ? `Add ${newPatient.name.trim()}` : 'Add patient'}</Btn>}>
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
        {newPatient.onSite && freeRooms.length ? (() => {
          const r = freeRooms.find((x) => x.id === guestRoom);
          return (
            <div className="mt-1 border-t border-border">
              <ChangeLine label="Guest room" value={r ? `${r.name} · ${r.type}` : freeRooms.some((x) => x.free) ? "Not yet" : "None free for these nights"} faint={!r}
                select={<LineSelect label="Guest room" busyLabel="Taken" value={guestRoom} onChange={setGuestRoom}
                  free={[...freeRooms.filter((x) => x.free).map((x) => ({ id: x.id, name: x.name, tag: x.type })), { id: "", name: "Not yet" }]}
                  busy={freeRooms.filter((x) => !x.free).map((x) => ({ id: x.id, name: x.name, why: takenBy(x) }))} />} />
            </div>
          );
        })() : null}
        {inline ? null : slots === null || slots.length === 0 ? (
          slots?.length === 0 ? <p className={`mt-3 ${noteText}`}>{why || 'No doctor is free before they leave, so no consultation is booked. Book one from their card.'}</p> : null
        ) : (
          <div className="mt-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0"><b className="block">First consultation</b>
                <span className={`block ${noteText}`}>{consult === 'later' ? 'Later, from their card' : `${dayText(slots[consult].date)} · ${slots[consult].start_time} · ${slots[consult].staff_name}`}</span></span>
              <span className="flex flex-none text-sm font-semibold text-primary">
                {consult === 'later' ? <Btn kind="quiet" inline onClick={() => setConsult(0)}>Book</Btn> : (<>
                  <Btn kind="quiet" inline aria-expanded={changing} onClick={() => setChanging(!changing)}>Change</Btn>
                  <Btn kind="quiet" inline onClick={() => { setConsult('later'); setChanging(false); }}>Later</Btn>
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
          {/* For Form C (#415): asked only of a guest from outside India. */}
          {infoDraft.country?.trim() && !/^(india|indian|bharat|in)$/i.test(infoDraft.country.trim()) ? (<>
            <Text label="Visa number (optional)" value={infoDraft.visaNumber || ''} onChange={(e) => setInfoDraft({ ...infoDraft, visaNumber: e.target.value })} />
            <DateRow label="Visa valid until (optional)" value={infoDraft.visaValidUntil || ''} onChange={(v) => setInfoDraft({ ...infoDraft, visaValidUntil: v })} />
          </>) : null}
          <Text label="Registration number (optional)" value={infoDraft.registrationNumber || ''} onChange={(e) => setInfoDraft({ ...infoDraft, registrationNumber: e.target.value })} />
          <DateRow label="Date of birth (optional)" value={infoDraft.dob || ''} onChange={(v) => setInfoDraft({ ...infoDraft, dob: v })} />
          <Text label="Email (optional)" type="email" inputMode="email" value={infoDraft.email || ''} onChange={(e) => setInfoDraft({ ...infoDraft, email: e.target.value })} />
          <Text label="Medical notes (optional)" value={infoDraft.medicalNotes || ''} onChange={(e) => setInfoDraft({ ...infoDraft, medicalNotes: e.target.value })} />
          <ListGroup title="Stays" count={infoStays?.length}>
            {infoStays === null ? <Loading rows={1} /> : infoStays.length ? infoStays.map((st) => <Row key={st.id} title={`${stayDay(st.start_date)} to ${stayDay(st.end_date)}`} facts={`${st.duration_days} days`} onClick={() => { setStayFor({ patient: infoPatient, target: { id: st.id, start: st.start_date.slice(0, 10), end: st.end_date.slice(0, 10), package: null, accommodation: null } }); setInfoPatient(null); }} />) : <Empty text="No stays yet." />}
          </ListGroup>
          {/* Nearest to today first: that is what is asked about; the rest is one tap away. */}
          <ListGroup title="Treatments" count={infoAppointments?.length}>
            {infoAppointments === null ? <Loading rows={2} /> : infoAppointments.length ? [...infoAppointments].sort((a, b) => Math.abs(Date.parse(a.scheduled_date) - Date.parse(today)) - Math.abs(Date.parse(b.scheduled_date) - Date.parse(today))).slice(0, allTx ? undefined : 8).map((a) => <Row key={a.id} title={`${longDay(a.scheduled_date)} · ${a.start_time}`} facts={[therapyNameById[String(a.therapy_id)] || 'Treatment', recordLine(a)].filter(Boolean).join(' · ')} flag={a.status === 'cancelled' ? `Cancelled${a.cancel_reason ? `: ${a.cancel_reason}` : ''}` : undefined} />) : <Empty text="No treatments yet." />}
          </ListGroup>
          {infoAppointments && infoAppointments.length > 8 && !allTx ? <Btn kind="quiet" inline className="-ml-1 mt-2" onClick={() => setAllTx(true)}>Show all {infoAppointments.length} ›</Btn> : null}
        </>) : null}
      </BottomSheet>
    </>
  );

  return { tab, dialogs, openResident: setCardId, openMeals: setDietFor, openAdd: (from?: { name?: string; arriving: string; leaving?: string; room?: string; done?: (p: { id: string; name: string }) => void }) => {
    if (from) { setNewPatient({ ...blankNew(), name: from.name ?? '', arriving: from.arriving, leaving: from.leaving ?? addDays(from.arriving, 13) }); if (from.done) setInline(() => from.done); }
    // From Guest rooms (#456): the room tapped stays chosen while it is free for the dates.
    if (from?.room) setGuestRoom(from.room);
    setShowAddPatient(true);
  }, query, setQuery, searching, setSearching };
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
