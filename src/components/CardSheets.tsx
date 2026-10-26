/**
 * The patient card's sheets (#285 stories 7 to 12): meals by date, package,
 * accommodation, the stay, and what the discharge summary still lacks. Each is
 * built from the kit and opens from a row on the card. The server decides
 * everything (server/src/patientDiet.ts, discharge.ts, the stay route); these
 * only show the choice and its consequence before the tap.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import {
  Area, BottomSheet, ChangeLine, Consequence, Empty, Foot, Group, ListGroup, Loading, LineDate, LineSelect, Picker, QuickDates, Row, Seg, SwitchRow, Text, TextRow, Timeline,
  dayText, noteText, money, toastUndo, Btn, saveError, deleteAll, undoWrite, EXAMPLE_PRICE, ownNote } from "@/components/kit";

const DAY_MS = 86400000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const first = (name: string) => name.split(" ")[0];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const json = { "Content-Type": "application/json" };

/** What the card holds about the stay it is showing (residentDay). */
export type CardStay = {
  id: string; start_date: string; end_date: string; day: number; days: number; on_site?: boolean;
  package: { id: string; name: string; days: number; price: number } | null;
  accommodation: { id: string; name: string; price_per_day: number; room: { id: string; name: string } | null } | null;
  discharge: { total: number; done: number; missing: { key: string; label: string; where: "details" | "summary" }[] } | null;
};
type Who = { id: string; name: string };

/* ------------------------------ Story 7: meals by date ------------------------------ */

export type Plan = { id: string; name: string; description?: string | null; is_active: boolean; patients: number } & Record<string, unknown>;
type DietLine = { id: string; from: string; to: string; template_id: string | null; name: string; patients: number; changed_for_patient: boolean };
type Own = { food_limits: string | null; medication: string | null; before_treatment: string | null; after_treatment: string | null };
type Line = { stay: { id: string; start: string; end: string }; entries: DietLine[]; own?: Own | null; course?: { parts: { from: string; template_id: string; name: string }[] } | null };
const OWN: [keyof Own, string][] = [["food_limits", "Food limits"], ["medication", "Medication"], ["before_treatment", "Before treatment"], ["after_treatment", "After treatment"]];

const MEALS: [string, string][] = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];

export function DietSheet({ patient, today, onClose, onChanged, onDayMeals }: { patient: Who | null; today: string; onClose: () => void; onChanged: () => void; onDayMeals: (p: Who) => void }) {
  const [line, setLine] = useState<Line | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [from, setFrom] = useState(today);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  // Medication and the treatment notes are the patient's own (#355, decided 6 Oct): a second page of this sheet.
  const [own, setOwn] = useState<Record<keyof Own, string> | null>(null);
  // Today's meals live here, not on the card (#353): the kitchen's question is asked from the Diet line.
  const [meals, setMeals] = useState<{ meal: string; text: string }[]>([]);
  const load = () => Promise.all([
    fetchJsonWithTimeout<Line | { error: string }>(`${API_BASE}/patients/${patient!.id}/diet?date=${today}`),
    fetchJsonWithTimeout<Plan[]>(`${API_BASE}/diet-templates`),
  ]).then(([l, p]) => { const ok = l && "entries" in l ? l : null; setLine(ok); setPlans(Array.isArray(p) ? p : []); if (ok) setFrom((f) => (f < ok.stay.start ? ok.stay.start : f > ok.stay.end ? ok.stay.end : f)); });
  useEffect(() => {
    if (!patient) return;
    setLine(null); setChosen(""); setFrom(today); setEditing(null); setMeals([]); setOwn(null);
    load();
    fetchJsonWithTimeout<{ meals?: { meal: string; text: string }[] }>(`${API_BASE}/patients/${patient.id}/day?date=${today}`).then((d) => setMeals(d.meals || [])).catch(() => setMeals([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id, today]);
  const plan = plans.find((p) => p.id === chosen);
  const start = async () => {
    if (!patient || !plan) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}/diet`, { method: "POST", headers: json, body: JSON.stringify({ from, template_id: plan.id }) });
    setBusy(false);
    if (!res.ok) { toast.error("The diet was not changed. Try again."); return; }
    toast.success(`${plan.name} from ${dayText(from)}`);
    onChanged();
    onClose();
  };
  const running = line?.entries.find((e) => e.template_id === chosen);
  // A purification course booked (#986): its three diets, dated from its own sessions, in one tap.
  const followCourse = async () => {
    if (!patient) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}/diet/course`, { method: "POST", headers: json, body: JSON.stringify({ date: today }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(body.error || "The diets were not changed. Try again."); return; }
    toast(`${first(patient.name)}'s diet now follows the course`, { action: { label: "Undo", onClick: async () => {
      await fetch(`${API_BASE}/patients/${patient.id}/diet/course/undo`, { method: "POST", headers: json, body: JSON.stringify({ date: today, previous: body.previous }) });
      load(); onChanged();
    } } });
    load(); onChanged();
  };
  const saveOwn = async () => {
    if (!patient || !own) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}`, { method: "PUT", headers: json, body: JSON.stringify(Object.fromEntries(OWN.map(([k]) => [k, own[k].trim() || null]))) });
    setBusy(false);
    if (!res.ok) { toast.error("That was not saved. Try again."); return; }
    toast.success(`Saved for ${first(patient.name)}`);
    setOwn(null); load(); onChanged();
  };
  const ownText = line?.own ? OWN.map(([k]) => line.own![k]).filter(Boolean).join(" · ") : "";
  if (own && patient) return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} onBack={() => setOwn(null)} title={`${first(patient.name)}'s food limits and medication`}
      note="Food limits print bold on the day sheet and by name on the kitchen sheet. The two treatment notes print only on a day they have treatment."
      foot={<Foot label={`Save for ${first(patient.name)}`} busy={busy} save={saveOwn} />}>
      <div className="grid gap-4">{OWN.map(([k, t]) => <Area key={k} label={`${t} (optional)`} rows={2} maxLength={2000} value={own[k]} onChange={(e) => setOwn({ ...own, [k]: e.target.value })} />)}</div>
    </BottomSheet>
  );
  return (
    <BottomSheet open={!!patient} onOpenChange={(o) => { if (!o) onClose(); }} title={patient ? `Diet for ${first(patient.name)}` : "Diet"}
      note={line ? `Runs to the leaving date, ${dayText(line.stay.end)}. Each change starts where the last ended.` : undefined}
      foot={line ? <Foot label={plan ? `Start this plan on ${dayText(from)}` : "Pick a plan first"} ok={!!plan} busy={busy} save={start} /> : undefined}>
      {line === null ? <Loading rows={3} /> : (<>
        <Timeline items={line.entries.map((e) => {
          return {
            key: e.id || "gap", from: dayText(e.from), title: e.name,
            note: e.id ? [e.changed_for_patient ? "Changed for this patient" : "", e.patients > 1 ? `Used by ${e.patients} patients` : ""].filter(Boolean).join(" · ") : "Choose a plan below",
          };
        })} />
        {line.course ? <>
          <Consequence>{`The purification course asks for ${line.course.parts.map((p) => `${p.name} from ${dayText(p.from)}`).join(", then ")}.`}</Consequence>
          <Btn kind="primary" className="mt-2" disabled={busy} onClick={followCourse}>Follow the course</Btn>
        </> : null}
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">Change to</div>
        <div className="mt-2">
          <Picker value={chosen} onChange={setChosen}
            options={plans.filter((p) => p.is_active || p.id === chosen).map((p) => ({ id: p.id, name: p.name, note: p.id === chosen && p.description ? String(p.description) : undefined, fact: p.patients ? plural(p.patients, "patient") : undefined }))} />
        </div>
        <QuickDates label="Starts" value={from} today={today} min={line.stay.start} max={line.stay.end} onChange={setFrom} />
        {plan && patient ? <Consequence>{`${first(patient.name)} eats ${plan.name} from ${dayText(from)} to ${dayText(line.stay.end)}. What ran before ends the day before.`}</Consequence> : null}
        {plan ? <ChangeLine label="Edit this plan" value={running ? `${plural(plan.patients, "patient")} on it` : plan.name} onClick={() => setEditing(plan)} /> : null}
        <div className="mt-3"><TextRow label="Food limits and medication" faint={!ownText} onClick={() => setOwn(Object.fromEntries(OWN.map(([k]) => [k, line.own?.[k] ?? ""])) as Record<keyof Own, string>)}>{ownText || "None yet"}</TextRow></div>
        {meals.length ? <ListGroup title="Meals today">{meals.map((m) => <TextRow key={m.meal} label={m.meal}>{m.text}</TextRow>)}</ListGroup> : null}
        <Btn kind="quiet" inline className="-ml-2 mt-2" onClick={() => patient && onDayMeals(patient)}>Change meals for some days</Btn>
      </>)}
      {editing && patient ? <PlanEditor plan={editing} patient={patient} segmentId={line?.entries.find((e) => e.template_id === editing.id && e.id)?.id || ""} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged(); }} /> : null}
    </BottomSheet>
  );
}

export const BLANK_PLAN: Plan = { id: "new", name: "", description: "", is_active: true, patients: 0 };
// Treatment-day meals first, then rest-day meals: the admin plans one kind of day at a time (#338).
const PLAN_FIELDS = ["therapy", "rest"].flatMap((kind) => MEALS.map(([k]) => `${kind}_${k}` as const));

/**
 * A plan's meals: for everyone on it, or a copy for this patient alone (the segment's overrides win over the plan).
 * With no patient it is the Diet plans screen's editor: the whole plan, new or existing, always for everyone.
 */
export function PlanEditor({ plan, patient, segmentId = "", onClose, onSaved }: { plan: Plan; patient?: Who; segmentId?: string; onClose: () => void; onSaved: () => void }) {
  const [over, setOver] = useState<Record<string, string> | null>(null);
  const [text, setText] = useState<Record<string, string> | null>(null);
  const [steps, setSteps] = useState<Record<string, string>[]>([]);
  const isNew = plan.id === "new";
  const [scope, setScope] = useState<"me" | "all">(segmentId ? "me" : "all");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const segs = segmentId && patient ? await fetchJsonWithTimeout<{ id: string; overrides: Record<string, string> | null }[]>(`${API_BASE}/dietplans/segments?patient_id=${patient.id}`) : [];
      const o = (Array.isArray(segs) ? segs.find((s) => s.id === segmentId)?.overrides : null) || {};
      setOver(o);
      const all = [...PLAN_FIELDS, ...(patient ? [] : ["name", "description"])];
      setText(Object.fromEntries(all.map((k) => [k, String(o[k] ?? plan[k] ?? "")])));
      setSteps(Array.isArray(plan.steps) ? (plan.steps as Record<string, string>[]) : []);
    })();
  }, [plan, patient?.id, segmentId]);
  const save = async () => {
    if (!text) return;
    setBusy(true);
    if (!patient && !text.name.trim()) { toast.error("Give the plan a name."); setBusy(false); return; }
    const res = scope === "all"
      ? await fetch(`${API_BASE}/diet-templates${isNew ? "" : `/${plan.id}`}`, { method: isNew ? "POST" : "PUT", headers: json, body: JSON.stringify(patient ? text : { ...text, steps: steps.map((d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim()))) }) })
      // Only what differs from the plan is kept as this patient's own wording.
      : await fetch(`${API_BASE}/dietplans/segments/${segmentId}`, { method: "PUT", headers: json, body: JSON.stringify({ overrides: Object.fromEntries(Object.entries(text).filter(([k, v]) => v !== String(plan[k] ?? "") || (over && k in over))) }) });
    setBusy(false);
    if (!res.ok) { toast.error(res.status === 409 ? "A plan with that name already exists." : res.status === 403 ? "Only an administrator can change a plan for everyone." : "The plan was not saved."); return; }
    if (!patient) toast.success(isNew ? `${text.name.trim()} added` : `${text.name.trim()} saved`);
    else toast.success(scope === "all" ? `${plan.name} changed for ${plural(plan.patients, "patient")}` : `${plan.name} changed for ${first(patient.name)} only`);
    onSaved();
  };
  const retire = async () => {
    const res = await fetch(`${API_BASE}/diet-templates/${plan.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("The plan was not retired."); return; }
    const out = await res.json().catch(() => ({}));
    toast.success(out.retired ? `Retired. ${plural(out.patients, "patient")} still on it, and their sheets still print.` : "Plan removed");
    onSaved();
  };
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={isNew ? "New diet plan" : plan.name} note={patient ? "Type in a meal to change it. Leave a box empty for no meal." : "The meals for a day with treatment, then for a rest day."}
      foot={<Foot label={patient ? "Save the meals" : isNew ? "Add this plan" : "Save the plan"} busy={busy} ok={!!text} save={save} remove={!patient && !isNew ? retire : undefined} removeLabel="Retire this plan" />}>
      {text === null ? <Loading rows={3} /> : (<>
        {segmentId && patient ? (<>
          <Group label="Change it for"><Seg<"me" | "all"> value={scope} onChange={setScope} options={[["me", `Only ${first(patient.name)}`], ["all", "Everyone on it"]]} /></Group>
          <Consequence>{scope === "all" ? `${plural(plan.patients, "patient")} eat this plan, so it changes for all of them.` : `Only ${first(patient.name)}'s copy changes; the plan stays as it is.`}</Consequence>
        </>) : plan.patients ? <Consequence>{`${plural(plan.patients, "patient")} eat this plan, so it changes for all of them.`}</Consequence> : null}
        {!patient ? (<>
          <Text label="Plan name" maxLength={120} autoComplete="off" value={text.name} onChange={(e) => setText({ ...text, name: e.target.value })} />
          <Text label="Description (optional)" maxLength={2000} value={text.description} onChange={(e) => setText({ ...text, description: e.target.value })} />
        </>) : null}
        {([["therapy", "On treatment days", undefined], ["rest", "On rest days", patient ? undefined : "A meal left empty repeats the treatment-day one."]] as const).map(([kind, title, note]) => (
          <Group key={kind} label={title} note={note}>
            <div className="grid gap-4">{MEALS.map(([m, t]) => <Area key={m} label={`${t} (optional)`} rows={2} maxLength={2000} value={text[`${kind}_${m}`]} onChange={(e) => setText({ ...text, [`${kind}_${m}`]: e.target.value })} />)}</div>
          </Group>
        ))}
        {!patient ? (
          // Day 1 is the day a patient starts the plan; a meal a day leaves empty comes from the plan's own (#1082).
          <Group label="Day by day (optional)" note="For a plan that changes each day, like samsarjana. A meal left empty is the plan's own; after the last day the patient moves to General sattvic.">
            <div className="grid gap-6">
              {steps.map((d, i) => (
                <div key={i} className="grid gap-4">
                  <p className="text-sm font-semibold">Day {i + 1}</p>
                  {MEALS.map(([m, t]) => <Area key={m} label={`${t} (optional)`} rows={2} maxLength={2000} value={d[m] ?? ""} onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, [m]: e.target.value } : x))} />)}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {steps.length < 60 ? <Btn kind="quiet" inline onClick={() => setSteps([...steps, {}])}>Add day {steps.length + 1}</Btn> : null}
                {steps.length ? <Btn kind="quiet" inline onClick={() => setSteps(steps.slice(0, -1))}>Remove day {steps.length}</Btn> : null}
              </div>
            </div>
          </Group>
        ) : null}
      </>)}
    </BottomSheet>
  );
}

/* ------------------------- Stories 11 and 12: package and accommodation ------------------------- */

type Pack = { id: string; name: string; days: number; price: number; notes: string | null; is_active: boolean };
type House = { id: string; name: string; price_per_day: number; notes: string | null; is_active: boolean };

const saveStay = (patientId: string, stayId: string, body: Record<string, unknown>) =>
  fetch(`${API_BASE}/patients/${patientId}/stays/${stayId}`, { method: "PUT", headers: json, body: JSON.stringify(body) });

export function PackageSheet({ patient, stay, onClose, onSaved, editList, matchStay }: { patient: Who | null; stay: CardStay | null; onClose: () => void; onSaved: () => void; editList: () => void; matchStay: (end: string) => void }) {
  const [list, setList] = useState<Pack[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!patient || !stay) return;
    setList(null); setPick(stay.package?.id ?? "");
    fetchJsonWithTimeout<Pack[]>(`${API_BASE}/packages`).then((r) => {
      const all = Array.isArray(r) ? r : [];
      setList(all);
      // Nothing chosen yet: the package closest to the stay's length is ready, one tap from done.
      if (!stay.package) {
        const near = all.filter((p) => p.is_active).sort((a, b) => Math.abs(a.days - stay.days) - Math.abs(b.days - stay.days))[0];
        if (near) setPick(near.id);
      }
    });
  }, [patient?.id, stay?.id, stay?.package?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient || !stay) return null;
  const chosen = list?.find((p) => p.id === pick);
  const days = stay.days;
  const ends = chosen ? addDays(stay.start_date, chosen.days - 1) : "";
  const save = async () => {
    setBusy(true);
    const before = stay.package?.id ?? null;
    const next = pick === "none" || !chosen ? null : chosen.id;
    const res = await saveStay(patient.id, stay.id, { package_id: next });
    setBusy(false);
    if (!res.ok) { toast.error("The package was not saved. Try again."); return; }
    toastUndo(chosen ? `${first(patient.name)}: ${chosen.name}` : `${first(patient.name)}: no package yet`, () => undoWrite((anyway) => saveStay(patient.id, stay.id, { package_id: before, ...(anyway ? {} : { if_still: { package_id: next } }) }), onSaved));
    onSaved();
    onClose();
  };
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={`Package for ${first(patient.name)}`} note={`Stay ${dayText(stay.start_date)} to ${dayText(stay.end_date)} · ${plural(days, "day")}. Change it whenever they decide.`}
      foot={<Foot label={chosen ? `Use ${chosen.days} days` : pick === "none" ? "Not decided yet" : "Choose a package"} ok={!!pick} busy={busy} save={save} />}>
      {list === null ? <Loading rows={3} /> : (<>
        {chosen ? (
          <Consequence>
            {chosen.days === days ? `${chosen.days} days ends ${dayText(ends)}, the same as the stay. Nothing to match.` : `${chosen.days} days ends ${dayText(ends)}; the stay ends ${dayText(stay.end_date)}.`}
            {chosen.days !== days ? <button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={() => matchStay(ends)}>Match the stay</button> : null}
          </Consequence>
        ) : null}
        <div className="mt-3">
        <Picker value={pick} onChange={setPick} onEdit={editList}
          options={[{ id: "none", name: "Not decided yet" }, ...list.filter((p) => p.is_active || p.id === stay.package?.id).map((p) => ({ id: p.id, name: p.name, note: ownNote(p.notes) || undefined, fact: money(p.price) }))]} />
        </div>
        <p className={`mt-2 ${noteText}`}>{list?.some((p) => p.notes === EXAMPLE_PRICE) ? `${EXAMPLE_PRICE}. ` : ""}The price includes the registration charge. For reference, not an invoice.</p>
      </>)}
    </BottomSheet>
  );
}

/** A guest room for some nights (#456), as `/guest-rooms/free` gives it. */
export type GuestRoomNight = { id: string; name: string; beds: number; accommodation_id: string; type: string; free: boolean; full_on: { date: string; names: string[] } | null; out: { date: string; until: string; reason: string | null } | null };
/** Taken rooms say by whom and from when, so a clash is never picked by accident. */
export const takenBy = (r: GuestRoomNight) => r.out ? `Out of use${r.out.reason ? `: ${r.out.reason}` : ""} · ${dayText(r.out.date)}` : r.full_on ? `${r.full_on.names.join(" & ")} · ${dayText(r.full_on.date)}` : "";

export function AccommodationSheet({ patient, stay, today, onClose, onSaved, editList }: { patient: Who | null; stay: CardStay | null; today: string; onClose: () => void; onSaved: () => void; editList: () => void }) {
  const [list, setList] = useState<House[] | null>(null);
  const [rooms, setRooms] = useState<GuestRoomNight[]>([]);
  const [pick, setPick] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  // A stay under way moves from tonight, so only the nights from today on are asked (#1207), as the server checks them.
  const from = stay && stay.start_date < today && today < stay.end_date ? today : stay?.start_date;
  useEffect(() => {
    if (!patient || !stay) return;
    setList(null); setPick(stay.accommodation?.id ?? ""); setRoom(stay.accommodation?.room?.id ?? "");
    Promise.all([
      fetchJsonWithTimeout<House[]>(`${API_BASE}/accommodations`),
      fetchJsonWithTimeout<GuestRoomNight[]>(`${API_BASE}/guest-rooms/free?from=${from}&to=${stay.end_date}&stay=${stay.id}`),
    ]).then(([h, r]) => {
      const list = Array.isArray(r) ? r : [];
      setRooms(list); setList(Array.isArray(h) ? h : []);
      // No room yet: the first free for every night, as New patient chooses (#1211).
      if (!stay.accommodation?.room) { const r0 = list.find((x) => x.free && (!stay.accommodation || x.accommodation_id === stay.accommodation.id)) ?? list.find((x) => x.free); if (r0) { setPick(r0.accommodation_id); setRoom(r0.id); } }
    });
  }, [patient?.id, stay?.id, stay?.accommodation?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient || !stay) return null;
  const nights = between(stay.start_date, stay.end_date);
  const chosen = list?.find((h) => h.id === pick);
  const ofType = rooms.filter((r) => r.accommodation_id === pick);
  const freeOf = (id: string) => rooms.filter((r) => r.free && r.accommodation_id === id);
  // Choosing a type chooses its first room free for every night; the admin can change it.
  const choose = (id: string) => { setPick(id); setRoom(freeOf(id)[0]?.id ?? ""); };
  const chosenRoom = rooms.find((r) => r.id === room);
  const elsewhere = rooms.filter((r) => r.free && r.accommodation_id !== pick);
  const save = async () => {
    setBusy(true);
    const before = { accommodation_id: stay.accommodation?.id ?? null, guest_room_id: stay.accommodation?.room?.id ?? null };
    const res = await saveStay(patient.id, stay.id, chosen ? { accommodation_id: chosen.id, guest_room_id: room || null } : { accommodation_id: null, guest_room_id: null });
    setBusy(false);
    if (!res.ok) { const why = await res.json().catch(() => ({})); toast.error(why.message || "The accommodation was not saved. Try again."); return; }
    const saved = (await res.json().catch(() => ({}))).stay;
    const still = saved ? { if_still: { accommodation_id: saved.accommodation_id, guest_room_id: saved.guest_room_id } } : {};
    toastUndo(chosen ? `${first(patient.name)}: ${chosen.name}${chosenRoom ? ` · ${chosenRoom.name}` : ""}` : `${first(patient.name)}: no accommodation`, () => undoWrite((anyway) => saveStay(patient.id, stay.id, { ...before, ...(anyway ? {} : still) }), onSaved));
    onSaved();
    onClose();
  };
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={`Accommodation for ${first(patient.name)}`} note={`${plural(nights, "night")}, ${dayText(stay.start_date)} to ${dayText(stay.end_date)}.`}
      foot={<Foot label={chosen ? `Use ${chosen.name}${chosenRoom ? ` · ${chosenRoom.name}` : ""}` : pick === "none" ? "No accommodation" : "Choose a type"} ok={!!pick} busy={busy} save={save} />}>
      {list === null ? <Loading rows={3} /> : (<>
        {chosen ? <Consequence>{`${plural(nights, "night")} × ${money(chosen.price_per_day)} = ${money(chosen.price_per_day * nights)}. For reference, not an invoice.`}</Consequence> : null}
        {chosen && ofType.length ? (
          <div className="mt-3 border-t border-border">
            <ChangeLine label="Guest room" value={chosenRoom ? chosenRoom.name : "Not chosen"} faint={!chosenRoom}
              select={<LineSelect label="Guest room" busyLabel="Taken" value={room} onChange={setRoom}
                free={[...freeOf(pick).map((r) => ({ id: r.id, name: r.name, tag: r.beds > 1 ? plural(r.beds, "bed") : undefined })), { id: "", name: "Not chosen yet" }]}
                busy={ofType.filter((r) => !r.free).map((r) => ({ id: r.id, name: r.name, why: takenBy(r) }))} />} />
            {!freeOf(pick).length ? <p className={`mt-1 ${noteText}`}>{`No ${chosen.name} guest room is free for all ${plural(nights, "night")}.${elsewhere.length ? ` Free: ${elsewhere.slice(0, 4).map((r) => `${r.name} (${r.type})`).join(", ")}.` : ""}`}</p> : null}
          </div>
        ) : null}
        <div className="mt-3">
        <Picker value={pick} onChange={(id) => (id === "none" ? (setPick("none"), setRoom("")) : choose(id))} onEdit={editList}
          options={[{ id: "none", name: "No accommodation" }, ...list.filter((h) => h.is_active || h.id === stay.accommodation?.id).map((h) => ({ id: h.id, name: h.name,
            note: [`${money(h.price_per_day)} a day`, rooms.some((r) => r.accommodation_id === h.id) ? `${freeOf(h.id).length} free` : "", ownNote(h.notes)].filter(Boolean).join(" · "), fact: money(h.price_per_day * nights) }))]} />
        </div>
      </>)}
    </BottomSheet>
  );
}

/* ------------------------------ Story 10: change a stay ------------------------------ */

export type StayTarget = { id: string | null; start: string; end: string; package: CardStay["package"]; accommodation: CardStay["accommodation"] };

/** `cover` is a day the stay should reach (a booking asked for it): the dates open already stretched to it. */
export function StaySheet({ patient, target, today, now, cover, onClose, onSaved }: { patient: Who | null; target: StayTarget | null; today: string; now?: string; cover?: string; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cancels, setCancels] = useState(0);
  const [busy, setBusy] = useState(false);
  // A new stay starts, like a new patient, in the next free doctor time (#575); Later leaves it to the card.
  const [slots, setSlots] = useState<{ date: string; start_time: string; staff_id: string; staff_name: string; room_id: string }[]>([]);
  const [later, setLater] = useState(false);
  useEffect(() => {
    if (!patient || !target || target.id || !start) { setSlots([]); return; }
    let stale = false;
    setLater(false);
    fetchJsonWithTimeout<{ slots?: typeof slots }>(`${API_BASE}/consultations/next?date=${start}${start === today && now ? `&now=${now}` : ""}`)
      .then((r) => { if (!stale) setSlots((r?.slots ?? []).filter((x) => x.date <= end)); }).catch(() => { if (!stale) setSlots([]); });
    return () => { stale = true; };
  }, [patient?.id, target?.id, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const visit = !target?.id && !later ? slots[0] : undefined;
  // A New stay takes its guest room in the same save (#1190): the first free for every night, unless the admin chose another still free.
  const [freeRooms, setFreeRooms] = useState<GuestRoomNight[]>([]);
  const [guestRoom, setGuestRoom] = useState("");
  useEffect(() => {
    if (!target || target.id || !start || end < start) { setFreeRooms([]); return; }
    let stale = false;
    fetchJsonWithTimeout<GuestRoomNight[]>(`${API_BASE}/guest-rooms/free?from=${start}&to=${end}`).then((r) => {
      if (stale) return;
      const list = Array.isArray(r) ? r : [];
      setFreeRooms(list);
      setGuestRoom((was) => (list.some((x) => x.id === was && x.free) ? was : list.find((x) => x.free)?.id ?? ""));
    });
    return () => { stale = true; };
  }, [target?.id, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (target) { setStart(cover && target.id && cover < target.start ? cover : target.start); setEnd(cover && target.id && cover > target.end ? cover : target.end); setCancels(0); } }, [target?.id, target?.start, target?.end, cover]); // eslint-disable-line react-hooks/exhaustive-deps
  // What a shorter stay would cancel, asked of the server before the tap.
  // New dates re-check the guest room (#456): taken on a night, the save moves them to the room the server names.
  const [room, setRoom] = useState<{ taken: string; move_to: { id: string; name: string; type: string } | null } | null>(null);
  useEffect(() => {
    const moved = !!target && (start !== target.start || end !== target.end);
    if (!patient || !target?.id || !end || !moved) { setCancels(0); setRoom(null); return; }
    let stale = false;
    fetchJsonWithTimeout<{ cancels: unknown[]; room: typeof room }>(`${API_BASE}/patients/${patient.id}/stays/${target.id}/preview?start_date=${start}&end_date=${end}`)
      .then((r) => { if (!stale) { setCancels(end < target.end ? r?.cancels?.length ?? 0 : 0); setRoom(r?.room ?? null); } });
    return () => { stale = true; };
  }, [patient?.id, target?.id, target?.start, target?.end, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient || !target) return null;
  const oldDays = between(target.start, target.end) + 1;
  const days = between(start, end) + 1;
  const delta = days - oldDays;
  const changed = start !== target.start || end !== target.end;
  const lines = [
    delta < 0 ? `${plural(-delta, "day")} shorter.${cancels ? ` ${plural(cancels, "treatment")} after ${dayText(end)} will be marked cancelled (stay shortened) and stay in the record.` : ""} Meals stop that day.` : "",
    delta > 0 ? `${plural(delta, "day")} longer. Meals carry on to ${dayText(end)}.` : "",
    changed && target.accommodation ? `Accommodation: ${plural(between(start, end), "night")}, ${money(between(start, end) * target.accommodation.price_per_day)}.` : "",
    changed && target.package && target.package.days !== days ? `Package: ${target.package.days} days; the stay is now ${days}.` : "",
    room ? `${room.taken} ${room.move_to ? `Saving moves them to ${room.move_to.name}${room.move_to.type !== target.accommodation?.name ? ` (${room.move_to.type})` : ""} for the whole stay.` : "No guest room is free for every night, so saving leaves them without one."}` : "",
  ].filter(Boolean);
  const save = async () => {
    setBusy(true);
    const res = target.id
      ? await saveStay(patient.id, target.id, { start_date: start, end_date: end, cancel_after: cancels > 0, ...(room ? { guest_room_id: room.move_to?.id ?? null } : {}) })
      : await fetch(`${API_BASE}/patients/${patient.id}/stays`, { method: "POST", headers: json, body: JSON.stringify({ start_date: start, end_date: end, package_id: target.package?.id ?? null, guest_room_id: guestRoom || null, ...(visit ? { consultation: { date: visit.date, start_time: visit.start_time, staff_id: visit.staff_id, room_id: visit.room_id } } : {}) }) });
    setBusy(false);
    if (!res.ok) { const why = await res.json().catch(() => ({})); toast.error(why.message || "The stay was not saved. Try again."); return; }
    const out = await res.json().catch(() => ({}));
    const undo = target.id ? () => undoWrite(async (anyway) => {
      const back = await saveStay(patient.id, target.id!, { start_date: target.start, end_date: target.end, ...(room ? { guest_room_id: target.accommodation?.room?.id ?? null } : {}), ...(anyway ? {} : { if_still: { start_date: start, end_date: end } }) });
      return back.ok && out.batch_id ? fetch(`${API_BASE}/replan/undo`, { method: "POST", headers: json, body: JSON.stringify({ batch_id: out.batch_id, anyway }) }) : back;
    }, onSaved) : null;
    const text = target.id
      ? `${first(patient.name)}: ${dayText(start)} to ${dayText(end)}${out.cancelled ? `, ${plural(out.cancelled, "treatment")} cancelled` : ""}`
      : `Stay added for ${first(patient.name)}: ${dayText(start)} to ${dayText(end)}${guestRoom ? `, ${freeRooms.find((x) => x.id === guestRoom)?.name}` : ""}${visit ? `, consultation ${dayText(visit.date)} ${visit.start_time}` : ""}`;
    if (undo) toastUndo(text, undo); else toast.success(text);
    onSaved();
    onClose();
  };
  // A guest who never came (#980): the stay goes, with its room, meals and treatments, and Undo brings it all back.
  const didNotArrive = async () => {
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}/stays/${target.id}/did-not-arrive`, { method: "POST", headers: json }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { const why = await res?.json().catch(() => ({})); toast.error(why?.message || "That was not saved. Try again."); return; }
    const out = await res.json();
    toastUndo(`${first(patient.name)} did not arrive: stay removed${out.cancelled ? `, ${plural(out.cancelled, "treatment")} cancelled` : ""}`,
      () => undoWrite(() => fetch(`${API_BASE}/stays/did-not-arrive/undo`, { method: "POST", headers: json, body: JSON.stringify({ undo_id: out.undo_id }) }), onSaved));
    onSaved();
    onClose();
  };
  const label = !target.id ? "Add the stay" : !changed ? "Change a date to save" : delta < 0 ? `Leave on ${dayText(end)}` : delta > 0 ? `Stay until ${dayText(end)}` : "Save the stay";
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={target.id ? `Stay for ${first(patient.name)}` : "New stay"}
      note={target.id ? `Now ${dayText(target.start)} to ${dayText(target.end)} · ${plural(oldDays, "day")}` : "Arriving, leaving, and the rest follows."}
      foot={<Foot label={label} ok={end >= start && (changed || !target.id)} busy={busy} save={save} />}>
      <div className="border-t border-border">
        <ChangeLine label={start > today ? "Arriving" : "Arrived"} value={dayText(start)} select={<LineDate label={start > today ? "Arriving" : "Arrived"} value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} />} />
        <ChangeLine label="Leaving" value={dayText(end)} select={<LineDate label="Leaving" value={end} min={start} onChange={setEnd} />} />
      </div>
      {target.id && start <= today && end > today ? <Btn kind="quiet" inline className="-ml-2 mt-1" onClick={() => setEnd(today)}>Leaves today</Btn> : null}
      {target.id && target.start <= today && target.end >= today ? <Btn kind="quiet" inline className="-ml-2 mt-1" disabled={busy} onClick={didNotArrive}>Did not arrive</Btn> : null}
      {!target.id && freeRooms.length ? (() => {
        const r = freeRooms.find((x) => x.id === guestRoom);
        return (
          <div className="border-t border-border">
            <ChangeLine label="Guest room" value={r ? `${r.name} · ${r.type}` : freeRooms.some((x) => x.free) ? "Not yet" : "None free for these nights"} faint={!r}
              select={<LineSelect label="Guest room" busyLabel="Taken" value={guestRoom} onChange={setGuestRoom}
                free={[...freeRooms.filter((x) => x.free).map((x) => ({ id: x.id, name: x.name, tag: x.type })), { id: "", name: "Not yet" }]}
                busy={freeRooms.filter((x) => !x.free).map((x) => ({ id: x.id, name: x.name, why: takenBy(x) }))} />} />
          </div>
        );
      })() : null}
      {!target.id && slots.length ? (
        <div className="mt-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0"><b className="block">First consultation</b>
              <span className={`block ${noteText}`}>{later ? "Later, from their card" : `${dayText(slots[0].date)} · ${slots[0].start_time} · ${slots[0].staff_name}`}</span></span>
            <Btn kind="quiet" inline onClick={() => setLater(!later)}>{later ? "Book" : "Later"}</Btn>
          </div>
        </div>
      ) : null}
      {lines.length ? <Consequence>{lines.join(" ")}</Consequence> : null}
    </BottomSheet>
  );
}

/* ------------------------------ Story 8: the discharge summary ------------------------------ */

/** What the summary lacks, item by item, and the print that never waits for it. */
export function DischargeSheet({ patient, stay, onClose, openField, write, print }: {
  patient: Who | null; stay: CardStay | null; onClose: () => void;
  openField: (where: "details" | "summary") => void; write: () => void; print: () => void;
}) {
  if (!patient || !stay?.discharge) return null;
  const { done, total, missing } = stay.discharge;
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={`Discharge summary · ${first(patient.name)}`} note={`${done} of ${total} ready. It prints either way.`}
      foot={<div className="grid gap-1"><Btn kind="primary" onClick={print}>Print summary</Btn><p className={`text-center ${noteText}`}>Missing items print as blank lines to fill in by hand.</p></div>}>
      {missing.length ? (
        <ListGroup title="Still missing" count={missing.length}>
          {missing.map((m) => <Row key={m.key} title={m.label} trailing="Add ›" onClick={() => openField(m.where)} />)}
        </ListGroup>
      ) : <Empty text="Everything the summary asks for is filled in." />}
      <div className="mt-3 border-t border-border"><ChangeLine label="Summary" value="Write or edit it" onClick={write} /></div>
    </BottomSheet>
  );
}

/* ------------------------------ Story 14: plan next week (#354) ------------------------------ */

type WeekLine = { from_therapy_id: string; therapy_id: string; therapy_name: string; start_time: string; staff_name: string; sessions: { date: string }[]; missing: { date: string; why: string }[]; skipped?: { date: string; why: string }[] };
type Starter = { name: string; lines: { therapy_id: string; sessions: number }[]; blocked?: string[] };
type WeekPlan = { from: string; to: string; brief: string | null; lines: WeekLine[]; review: { date: string; start_time: string; staff_name: string } | null; review_missing?: string };

/** This week, a week on: each line ticked and swappable, the next review ticked; Book all books everything or nothing (the server decides the times). */
export function NextWeekSheet({ patient, review, onClose, onBooked, firstDay, bookDay }: { patient: Who | null; review: string; onClose: () => void; onBooked: () => void; firstDay: string; bookDay: (date: string) => void }) {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [therapies, setTherapies] = useState<{ id: string; name: string }[]>([]);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [withReview, setWithReview] = useState(true);
  const [busy, setBusy] = useState(false);
  // A patient's first days: nothing to repeat, so the therapies are ticked from the centre's own list (#611).
  const [starts, setStarts] = useState<Record<string, boolean>>({});
  // How many of the week's days each starts on (#984), and the centre's starter courses that fill both.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [starters, setStarters] = useState<Starter[]>([]);
  const [naming, setNaming] = useState("");
  const [pruning, setPruning] = useState(false);
  useEffect(() => {
    if (!patient) return;
    setPlan(null); setSwaps({}); setWithReview(true); setStarts({}); setCounts({}); setNaming(""); setPruning(false);
    fetchJsonWithTimeout<Starter[]>(`${API_BASE}/starter-courses`).then((x) => setStarters(Array.isArray(x) ? x : [])).catch(() => setStarters([]));
    fetchJsonWithTimeout<WeekPlan>(`${API_BASE}/patients/${patient.id}/next-week?date=${review}`).then((p) => {
      setPlan(p); setWithReview(!!p.review);
      // A line with nothing left to book, or a day with no free time, starts unticked, so Book all works as it opens.
      setOff(Object.fromEntries(p.lines.map((l) => [l.from_therapy_id, !l.sessions.length || l.missing.length > 0])));
    }).catch(() => setPlan({ from: review, to: review, brief: null, lines: [], review: null }));
    fetchJsonWithTimeout<{ id: string; name: string; is_consultation?: boolean; is_active?: boolean }[]>(`${API_BASE}/therapies`)
      .then((t) => setTherapies(t.filter((x) => !x.is_consultation && x.is_active !== false).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setTherapies([]));
  }, [patient?.id, review]);
  const ticked = plan?.lines.filter((l) => !off[l.from_therapy_id]) || [];
  const starting = !!plan && !plan.lines.length;
  const startIds = starting ? therapies.filter((t) => starts[t.id]).map((t) => t.id) : [];
  const weekDays = plan ? Math.round((Date.parse(plan.to) - Date.parse(plan.from)) / 86400000) + 1 : 0;
  const sessionsOf = (id: string) => Math.min(counts[id] || weekDays, weekDays);
  const count = starting ? startIds.reduce((n, id) => n + sessionsOf(id), 0) : ticked.reduce((n, l) => n + l.sessions.length + l.missing.length, 0) + (withReview && plan?.review ? 1 : 0);
  const bookAll = async () => {
    if (!patient || !plan) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}/next-week`, { method: "POST", headers: json, body: JSON.stringify({ date: review, review: withReview, lines: starting ? startIds.map((id) => ({ from_therapy_id: id, therapy_id: id, sessions: sessionsOf(id) })) : ticked.map((l) => ({ from_therapy_id: l.from_therapy_id, therapy_id: swaps[l.from_therapy_id] || l.therapy_id })) }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(body.message || "Nothing was booked. Try again."); return; }
    toastUndo(`Booked ${plural(body.count, "treatment")} for ${first(patient.name)}, ${dayText(plan.from)} to ${dayText(plan.to)}`, async () => {
      await deleteAll((body.ids as string[]).map((id) => `${API_BASE}/appointments/${id}`));
      onBooked();
    });
    onBooked();
    onClose();
  };
  const useStarter = (c: Starter) => {
    setStarts(Object.fromEntries(c.lines.map((l) => [l.therapy_id, true])));
    setCounts(Object.fromEntries(c.lines.map((l) => [l.therapy_id, l.sessions])));
    // Changing a count and saving updates this starter (#1016): its name is already there.
    setNaming(c.name);
  };
  const updating = starters.some((c) => c.name === naming.trim());
  // Saved under a name already there, it replaces that starter.
  const saveStarter = async () => {
    const course = { name: naming.trim(), lines: startIds.map((id) => ({ therapy_id: id, sessions: sessionsOf(id) })) };
    const next = [...starters.filter((c) => c.name !== course.name), course];
    const res = await fetch(`${API_BASE}/starter-courses`, { method: "PUT", headers: json, body: JSON.stringify(next) });
    if (!res.ok) { toast.error(await saveError(res, "The starter was not saved.")); return; }
    setStarters(next); setNaming("");
    toast(updating ? `Updated "${course.name}"` : `Saved "${course.name}" as a starter`);
  };
  const removeStarter = async (name: string) => {
    const next = starters.filter((c) => c.name !== name);
    const res = await fetch(`${API_BASE}/starter-courses`, { method: "PUT", headers: json, body: JSON.stringify(next) });
    if (res.ok) setStarters(next);
  };
  // What a starter ticked comes first, so a 40-therapy list does not hide it.
  const listed = [...therapies].sort((a, b) => Number(!!starts[b.id]) - Number(!!starts[a.id]));
  const dayChoices = Array.from({ length: Math.max(weekDays, 0) }, (_, i) => ({ id: String(i + 1), name: `${i + 1} of ${weekDays} days` }));
  return (
    <BottomSheet open={!!patient} onOpenChange={(o) => { if (!o) onClose(); }} title={patient ? `Next week · ${first(patient.name)}` : "Next week"}
      note={plan?.lines.length ? `${dayText(plan.from)} to ${dayText(plan.to)}, as this week. Untick or swap a line; all of it is booked or none.` : starting && weekDays > 0 ? `Pick a starter or tick what they start with, ${dayText(plan!.from)} to ${dayText(plan!.to)}; all of it is booked or none.` : undefined}
      foot={plan && (plan.lines.length || plan.review || (starting && therapies.length)) ? <Foot label={count > 1 ? `Book all ${count}` : count ? "Book it" : "Nothing ticked"} ok={count > 0} busy={busy} save={bookAll} /> : undefined}>
      {plan === null ? <Loading rows={3} /> : (<>
        {plan.brief ? <ListGroup title="Doctor's plan"><TextRow label="The brief for this week">{plan.brief}</TextRow></ListGroup> : null}
        {starting && starters.length && therapies.length ? (
          <ListGroup title="Starters">
            {starters.map((c) => c.blocked?.length
              ? <Row key={c.name} faint title={c.name} facts={c.blocked.join(" · ")} />
              : <Row key={c.name} title={c.name} facts={c.lines.map((l) => `${therapies.find((t) => t.id === l.therapy_id)?.name ?? "?"} ×${l.sessions}`).join(" · ")} trailing="Use ›" onClick={() => useStarter(c)} />)}
            {starters.every((c) => c.blocked?.length) ? <TextRow label="None of these can be given yet" faint>{[...new Set(starters.flatMap((c) => c.blocked!))].join(" · ")}. Add it in Staff or Rooms.</TextRow> : null}
          </ListGroup>
        ) : null}
        <ListGroup title="Therapies">
          {plan.lines.length ? plan.lines.map((l) => {
            // A swap is a choice to book the replacement, so it switches the line on: a line left off hid its flag and was skipped (#1133).
            const swapped = swaps[l.from_therapy_id];
            const name = swapped ? therapies.find((t) => t.id === swapped)?.name || l.therapy_name : l.therapy_name;
            const done = !l.sessions.length && !l.missing.length;
            return (
              <SwitchRow key={l.from_therapy_id} title={name} on={!off[l.from_therapy_id]} set={(v) => setOff({ ...off, [l.from_therapy_id]: !v })}
                facts={done ? "Already booked next week" : swapped ? `Instead of ${l.therapy_name} · ${plural(l.sessions.length + l.missing.length, "day")}` : `${l.start_time} · ${l.staff_name} · ${plural(l.sessions.length + l.missing.length, "day")}`}
                flag={!swapped && l.missing.length ? `${l.missing.map((m) => (m.why.startsWith("The centre is") ? `${m.why} on ${dayText(m.date)}` : `No free time on ${dayText(m.date)}`)).join(". ")}. Swap it, or book its days from Next days` : l.skipped?.length ? `Skips ${l.skipped.map((m) => dayText(m.date)).join(", ")}: ${l.skipped[0].why.replace("The centre is", "the centre is")}` : undefined}>
                {done ? null : <ChangeLine label="Swap" value="For another therapy" select={<LineSelect label={`Swap ${l.therapy_name}`} value={swapped || l.therapy_id} onChange={(v) => { setSwaps({ ...swaps, [l.from_therapy_id]: v }); setOff({ ...off, [l.from_therapy_id]: false }); }} free={therapies} />} />}
              </SwitchRow>
            );
          }) : therapies.length ? <>
            {listed.map((t) => (
              <SwitchRow key={t.id} title={t.name} on={!!starts[t.id]} set={(v) => setStarts({ ...starts, [t.id]: v })} facts={starts[t.id] ? `${sessionsOf(t.id)} of ${plural(Math.max(weekDays, 0), "day")}` : undefined}>
                {starts[t.id] && weekDays > 1 ? <ChangeLine label="Sessions" value={`${sessionsOf(t.id)} of ${weekDays} days`} select={<LineSelect label={`Sessions of ${t.name}`} value={String(sessionsOf(t.id))} onChange={(v) => setCounts({ ...counts, [t.id]: Number(v) })} free={dayChoices} />} /> : null}
              </SwitchRow>
            ))}
            <Row title="Book one by hand" trailing="›" onClick={() => bookDay(firstDay)} />
          </> : <Empty text="Nothing given yet to repeat. Book their first days; after the review, this repeats them." action={<Btn kind="primary" onClick={() => bookDay(firstDay)}>Book {dayText(firstDay)}</Btn>} />}
        </ListGroup>
        {starting && startIds.length ? (
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Text label={updating ? `Update the starter ${naming.trim()}, or type a new name` : "Save these as a starter"} value={naming} maxLength={60} placeholder={starters.length ? "A name, e.g. Shoulder pain" : "A name, e.g. Back pain"} onChange={(e) => setNaming(e.target.value)} />
            <Btn inline disabled={!naming.trim()} onClick={saveStarter}>{updating ? `Update` : "Save"}</Btn>
          </div>
        ) : null}
        {starting && starters.length ? (pruning
          ? <ListGroup title="Remove a starter">{starters.map((c) => <Row key={c.name} title={c.name} trailing="Remove" onClick={() => removeStarter(c.name)} />)}</ListGroup>
          : <Btn kind="quiet" inline className="-ml-2 mt-2" onClick={() => setPruning(true)}>Remove a starter</Btn>) : null}
        {plan.review || plan.review_missing ? (
          <ListGroup title="Next review">
            {plan.review ? <SwitchRow title={`${dayText(plan.review.date)} · ${plan.review.start_time}`} facts={plan.review.staff_name} on={withReview} set={setWithReview} />
              : <Row title="A week on" flag={`${plan.review_missing}: book it from Next days`} />}
          </ListGroup>
        ) : null}
      </>)}
    </BottomSheet>
  );
}
