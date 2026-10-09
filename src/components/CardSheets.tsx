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
  dayText, noteText, money, toastUndo, Btn } from "@/components/kit";

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
type Own = { medication: string | null; before_treatment: string | null; after_treatment: string | null };
type Line = { stay: { id: string; start: string; end: string }; entries: DietLine[]; own?: Own | null };
const OWN: [keyof Own, string][] = [["medication", "Medication"], ["before_treatment", "Before treatment"], ["after_treatment", "After treatment"]];

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
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} onBack={() => setOwn(null)} title={`${first(patient.name)}'s medication and notes`}
      note="Printed in their own row of the day sheet. The two notes print only on a day they have treatment."
      foot={<Foot label={`Save for ${first(patient.name)}`} busy={busy} save={saveOwn} />}>
      <div className="grid gap-4">{OWN.map(([k, t]) => <Area key={k} label={`${t} (optional)`} rows={2} maxLength={2000} value={own[k]} onChange={(e) => setOwn({ ...own, [k]: e.target.value })} />)}</div>
    </BottomSheet>
  );
  return (
    <BottomSheet open={!!patient} onOpenChange={(o) => { if (!o) onClose(); }} title={patient ? `Diet for ${first(patient.name)}` : "Diet"}
      note={line ? `Runs to the leaving date, ${dayText(line.stay.end)}. Each change starts where the last ended.` : undefined}
      foot={line ? <Foot label={plan ? `Start this plan on ${dayText(from)}` : "Choose a plan"} ok={!!plan} busy={busy} save={start} /> : undefined}>
      {line === null ? <Loading rows={3} /> : (<>
        <Timeline items={line.entries.map((e) => {
          const p = plans.find((x) => x.id === e.template_id);
          return {
            key: e.id || "gap", from: dayText(e.from), title: e.name,
            note: e.id ? [e.changed_for_patient ? "Changed for this patient" : "", e.patients > 1 ? `Used by ${e.patients} patients` : "", p ? "Edit ›" : ""].filter(Boolean).join(" · ") : "Choose a plan below",
            // The plan already running is edited where it shows (#355).
            onClick: p ? () => setEditing(p) : undefined,
          };
        })} />
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">Change to</div>
        <div className="mt-2">
          <Picker value={chosen} onChange={setChosen}
            options={plans.filter((p) => p.is_active || p.id === chosen).map((p) => ({ id: p.id, name: p.name, note: p.description ? String(p.description) : undefined, fact: p.patients ? plural(p.patients, "patient") : undefined }))} />
        </div>
        <QuickDates label="Starts" value={from} today={today} min={line.stay.start} max={line.stay.end} onChange={setFrom} />
        {plan && patient ? <Consequence>{`${first(patient.name)} eats ${plan.name} from ${dayText(from)} to ${dayText(line.stay.end)}. What ran before ends the day before.`}</Consequence> : null}
        {plan ? <ChangeLine label="Edit this plan" value={running ? `${plural(plan.patients, "patient")} on it` : plan.name} onClick={() => setEditing(plan)} /> : null}
        <div className="mt-3"><TextRow label="Medication and notes" faint={!ownText} onClick={() => setOwn(Object.fromEntries(OWN.map(([k]) => [k, line.own?.[k] ?? ""])) as Record<keyof Own, string>)}>{ownText || "None yet"}</TextRow></div>
        {meals.length ? <ListGroup title="Meals today">{meals.map((m) => <TextRow key={m.meal} label={m.meal}>{m.text}</TextRow>)}</ListGroup> : null}
        <Btn kind="quiet" inline className="-ml-2 mt-2" onClick={() => patient && onDayMeals(patient)}>Change one day's meals</Btn>
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
    })();
  }, [plan, patient?.id, segmentId]);
  const save = async () => {
    if (!text) return;
    setBusy(true);
    if (!patient && !text.name.trim()) { toast.error("Give the plan a name."); setBusy(false); return; }
    const res = scope === "all"
      ? await fetch(`${API_BASE}/diet-templates${isNew ? "" : `/${plan.id}`}`, { method: isNew ? "POST" : "PUT", headers: json, body: JSON.stringify(text) })
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
    toastUndo(chosen ? `${first(patient.name)}: ${chosen.name}` : `${first(patient.name)}: no package yet`, async () => { await saveStay(patient.id, stay.id, { package_id: before }); onSaved(); });
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
          options={[{ id: "none", name: "Not decided yet" }, ...list.filter((p) => p.is_active || p.id === stay.package?.id).map((p) => ({ id: p.id, name: p.name, note: p.notes || undefined, fact: money(p.price) }))]} />
        </div>
        <p className={`mt-2 ${noteText}`}>The price includes the registration charge. For reference, not an invoice.</p>
      </>)}
    </BottomSheet>
  );
}

/** A guest room for some nights (#456), as `/guest-rooms/free` gives it. */
export type GuestRoomNight = { id: string; name: string; beds: number; accommodation_id: string; type: string; free: boolean; full_on: { date: string; names: string[] } | null };
/** Taken rooms say by whom and from when, so a clash is never picked by accident. */
export const takenBy = (r: GuestRoomNight) => r.full_on ? `${r.full_on.names.join(" & ")} · ${dayText(r.full_on.date)}` : "";

export function AccommodationSheet({ patient, stay, onClose, onSaved, editList }: { patient: Who | null; stay: CardStay | null; onClose: () => void; onSaved: () => void; editList: () => void }) {
  const [list, setList] = useState<House[] | null>(null);
  const [rooms, setRooms] = useState<GuestRoomNight[]>([]);
  const [pick, setPick] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!patient || !stay) return;
    setList(null); setPick(stay.accommodation?.id ?? ""); setRoom(stay.accommodation?.room?.id ?? "");
    Promise.all([
      fetchJsonWithTimeout<House[]>(`${API_BASE}/accommodations`),
      fetchJsonWithTimeout<GuestRoomNight[]>(`${API_BASE}/guest-rooms/free?from=${stay.start_date}&to=${stay.end_date}&stay=${stay.id}`),
    ]).then(([h, r]) => { setRooms(Array.isArray(r) ? r : []); setList(Array.isArray(h) ? h : []); });
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
    toastUndo(chosen ? `${first(patient.name)}: ${chosen.name}${chosenRoom ? ` · ${chosenRoom.name}` : ""}` : `${first(patient.name)}: no accommodation`, async () => { await saveStay(patient.id, stay.id, before); onSaved(); });
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
            note: [`${money(h.price_per_day)} a day`, rooms.some((r) => r.accommodation_id === h.id) ? `${freeOf(h.id).length} free` : "", h.notes || ""].filter(Boolean).join(" · "), fact: money(h.price_per_day * nights) }))]} />
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
      : await fetch(`${API_BASE}/patients/${patient.id}/stays`, { method: "POST", headers: json, body: JSON.stringify({ start_date: start, end_date: end, package_id: target.package?.id ?? null, ...(visit ? { consultation: { date: visit.date, start_time: visit.start_time, staff_id: visit.staff_id, room_id: visit.room_id } } : {}) }) });
    setBusy(false);
    if (!res.ok) { const why = await res.json().catch(() => ({})); toast.error(why.message || "The stay was not saved. Try again."); return; }
    const out = await res.json().catch(() => ({}));
    const undo = target.id ? async () => {
      await saveStay(patient.id, target.id!, { start_date: target.start, end_date: target.end, ...(room ? { guest_room_id: target.accommodation?.room?.id ?? null } : {}) });
      if (out.batch_id) await fetch(`${API_BASE}/replan/undo`, { method: "POST", headers: json, body: JSON.stringify({ batch_id: out.batch_id }) });
      onSaved();
    } : null;
    const text = target.id
      ? `${first(patient.name)}: ${dayText(start)} to ${dayText(end)}${out.cancelled ? `, ${plural(out.cancelled, "treatment")} cancelled` : ""}`
      : `Stay added for ${first(patient.name)}: ${dayText(start)} to ${dayText(end)}${visit ? `, consultation ${dayText(visit.date)} ${visit.start_time}` : ""}`;
    if (undo) toastUndo(text, undo); else toast.success(text);
    onSaved();
    onClose();
  };
  const label = !target.id ? "Add the stay" : delta < 0 ? `Leave on ${dayText(end)}` : delta > 0 ? `Stay until ${dayText(end)}` : "Save the stay";
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={target.id ? `Stay for ${first(patient.name)}` : "New stay"}
      note={target.id ? `Now ${dayText(target.start)} to ${dayText(target.end)} · ${plural(oldDays, "day")}` : "Arriving, leaving, and the rest follows."}
      foot={<Foot label={label} ok={end >= start && (changed || !target.id)} busy={busy} save={save} />}>
      <div className="border-t border-border">
        <ChangeLine label="Arrived" value={dayText(start)} select={<LineDate label="Arrived" value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} />} />
        <ChangeLine label="Leaving" value={dayText(end)} select={<LineDate label="Leaving" value={end} min={start} onChange={setEnd} />} />
      </div>
      {target.id && start <= today && end > today ? <Btn kind="quiet" inline className="-ml-2 mt-1" onClick={() => setEnd(today)}>Leaves today</Btn> : null}
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

type WeekLine = { from_therapy_id: string; therapy_id: string; therapy_name: string; start_time: string; staff_name: string; sessions: { date: string }[]; missing: { date: string; why: string }[] };
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
  useEffect(() => {
    if (!patient) return;
    setPlan(null); setSwaps({}); setWithReview(true); setStarts({});
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
  const count = starting ? startIds.length * Math.max(weekDays, 0) : ticked.reduce((n, l) => n + l.sessions.length + l.missing.length, 0) + (withReview && plan?.review ? 1 : 0);
  const bookAll = async () => {
    if (!patient || !plan) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/patients/${patient.id}/next-week`, { method: "POST", headers: json, body: JSON.stringify({ date: review, review: withReview, lines: starting ? startIds.map((id) => ({ from_therapy_id: id, therapy_id: id })) : ticked.map((l) => ({ from_therapy_id: l.from_therapy_id, therapy_id: swaps[l.from_therapy_id] || l.therapy_id })) }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(body.message || "Nothing was booked. Try again."); return; }
    toastUndo(`Booked ${plural(body.count, "treatment")} for ${first(patient.name)}, ${dayText(plan.from)} to ${dayText(plan.to)}`, async () => {
      await Promise.all((body.ids as string[]).map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" })));
      onBooked();
    });
    onBooked();
    onClose();
  };
  return (
    <BottomSheet open={!!patient} onOpenChange={(o) => { if (!o) onClose(); }} title={patient ? `Next week · ${first(patient.name)}` : "Next week"}
      note={plan?.lines.length ? `${dayText(plan.from)} to ${dayText(plan.to)}, as this week. Untick or swap a line; all of it is booked or none.` : starting && weekDays > 0 ? `Tick what they start with. Each is booked on every day, ${dayText(plan!.from)} to ${dayText(plan!.to)}; all of it or none.` : undefined}
      foot={plan && (plan.lines.length || plan.review || (starting && therapies.length)) ? <Foot label={count ? `Book all ${count}` : "Nothing ticked"} ok={count > 0} busy={busy} save={bookAll} /> : undefined}>
      {plan === null ? <Loading rows={3} /> : (<>
        {plan.brief ? <ListGroup title="Doctor's plan"><TextRow label="The brief for this week">{plan.brief}</TextRow></ListGroup> : null}
        <ListGroup title="Therapies">
          {plan.lines.length ? plan.lines.map((l) => {
            const swapped = swaps[l.from_therapy_id];
            const name = swapped ? therapies.find((t) => t.id === swapped)?.name || l.therapy_name : l.therapy_name;
            const done = !l.sessions.length && !l.missing.length;
            return (
              <SwitchRow key={l.from_therapy_id} title={name} on={!off[l.from_therapy_id]} set={(v) => setOff({ ...off, [l.from_therapy_id]: !v })}
                facts={done ? "Already booked next week" : swapped ? `Instead of ${l.therapy_name} · ${plural(l.sessions.length + l.missing.length, "day")}, times found on Book all` : `${l.start_time} · ${l.staff_name} · ${plural(l.sessions.length + l.missing.length, "day")}`}
                flag={!swapped && l.missing.length ? `No free time on ${l.missing.map((m) => dayText(m.date)).join(", ")}. Swap it, or book its days from Next days` : undefined}>
                {done ? null : <ChangeLine label="Swap" value={name} select={<LineSelect label={`Swap ${l.therapy_name}`} value={swapped || l.therapy_id} onChange={(v) => setSwaps({ ...swaps, [l.from_therapy_id]: v })} free={therapies} />} />}
              </SwitchRow>
            );
          }) : therapies.length ? <>
            {therapies.map((t) => <SwitchRow key={t.id} title={t.name} on={!!starts[t.id]} set={(v) => setStarts({ ...starts, [t.id]: v })} facts={`${plural(Math.max(weekDays, 0), "day")}, times found on Book all`} />)}
            <Row title="Book one by hand" trailing="›" onClick={() => bookDay(firstDay)} />
          </> : <Empty text="Nothing given yet to repeat. Book their first days; after the review, this repeats them." action={<Btn kind="primary" onClick={() => bookDay(firstDay)}>Book {dayText(firstDay)}</Btn>} />}
        </ListGroup>
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
