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
  Area, BottomSheet, ChangeLine, Consequence, Empty, Foot, Group, ListGroup, Loading, LineDate, Picker, QuickDates, Row, Seg, Text, Timeline,
  dayText, noteText, rupees, toastUndo, Btn } from "@/components/kit";

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
  accommodation: { id: string; name: string; price_per_day: number; room_number: string | null } | null;
  discharge: { total: number; done: number; missing: { key: string; label: string; where: "details" | "summary" }[] } | null;
};
type Who = { id: string; name: string };

/* ------------------------------ Story 7: meals by date ------------------------------ */

export type Plan = { id: string; name: string; description?: string | null; is_active: boolean; patients: number; medication?: string | null } & Record<string, unknown>;
type DietLine = { id: string; from: string; to: string; template_id: string | null; name: string; patients: number; changed_for_patient: boolean };
type Line = { stay: { id: string; start: string; end: string }; entries: DietLine[] };

const MEALS: [string, string][] = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];

export function DietSheet({ patient, today, onClose, onChanged, onDayMeals }: { patient: Who | null; today: string; onClose: () => void; onChanged: () => void; onDayMeals: (p: Who) => void }) {
  const [line, setLine] = useState<Line | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [from, setFrom] = useState(today);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const load = () => Promise.all([
    fetchJsonWithTimeout<Line | { error: string }>(`${API_BASE}/patients/${patient!.id}/diet?date=${today}`),
    fetchJsonWithTimeout<Plan[]>(`${API_BASE}/diet-templates`),
  ]).then(([l, p]) => { const ok = l && "entries" in l ? l : null; setLine(ok); setPlans(Array.isArray(p) ? p : []); if (ok) setFrom((f) => (f < ok.stay.start ? ok.stay.start : f > ok.stay.end ? ok.stay.end : f)); });
  useEffect(() => {
    if (!patient) return;
    setLine(null); setChosen(""); setFrom(today); setEditing(null);
    load();
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
  return (
    <BottomSheet open={!!patient} onOpenChange={(o) => { if (!o) onClose(); }} title={patient ? `Diet for ${first(patient.name)}` : "Diet"}
      note={line ? `Runs to the leaving date, ${dayText(line.stay.end)}. Each change starts where the last ended.` : undefined}
      foot={line ? <Foot label={plan ? `Start this plan on ${dayText(from)}` : "Choose a plan"} ok={!!plan} busy={busy} save={start} /> : undefined}>
      {line === null ? <Loading rows={3} /> : (<>
        <Timeline items={line.entries.map((e) => ({
          key: e.id || "gap", from: dayText(e.from), title: e.name,
          note: e.id ? [e.changed_for_patient ? "Changed for this patient" : "", e.patients > 1 ? `Used by ${e.patients} patients` : ""].filter(Boolean).join(" · ") : "Choose a plan below",
          // Tapping a step sets its date, so a plan is replaced from where it began.
          onClick: () => setFrom(e.from),
        }))} />
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">Change diet from</div>
        <QuickDates label="Starts" value={from} today={today} min={line.stay.start} max={line.stay.end} onChange={setFrom} />
        {plan && patient ? <Consequence>{`${first(patient.name)} eats ${plan.name} from ${dayText(from)} to ${dayText(line.stay.end)}. What ran before ends the day before.`}</Consequence> : null}
        <div className="mt-3">
          <Picker value={chosen} onChange={setChosen}
            options={plans.filter((p) => p.is_active || p.id === chosen).map((p) => ({ id: p.id, name: p.name, note: p.description ? String(p.description) : undefined, fact: p.patients ? plural(p.patients, "patient") : undefined }))} />
        </div>
        {plan ? <ChangeLine label="Edit this plan" value={running ? `${plural(plan.patients, "patient")} on it` : plan.name} onClick={() => setEditing(plan)} /> : null}
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
      const all = [...PLAN_FIELDS, "medication", ...(patient ? [] : ["name", "description", "pre_therapy_notes", "post_therapy_notes"])];
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
        <Text label="Medication (optional)" maxLength={2000} value={text.medication} onChange={(e) => setText({ ...text, medication: e.target.value })} />
        {!patient ? (<>
          <Text label="Before treatment (optional)" maxLength={2000} value={text.pre_therapy_notes} onChange={(e) => setText({ ...text, pre_therapy_notes: e.target.value })} />
          <Text label="After treatment (optional)" maxLength={2000} value={text.post_therapy_notes} onChange={(e) => setText({ ...text, post_therapy_notes: e.target.value })} />
          <p className={`mt-3 ${noteText}`}>Medication prints in the patient's own row. The two treatment notes print once, under "Around treatment".</p>
        </>) : null}
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
          options={[{ id: "none", name: "Not decided yet" }, ...list.filter((p) => p.is_active || p.id === stay.package?.id).map((p) => ({ id: p.id, name: p.name, note: p.notes || undefined, fact: rupees(p.price) }))]} />
        </div>
        <p className={`mt-2 ${noteText}`}>The price includes the registration charge. For reference, not an invoice.</p>
      </>)}
    </BottomSheet>
  );
}

export function AccommodationSheet({ patient, stay, onClose, onSaved, editList }: { patient: Who | null; stay: CardStay | null; onClose: () => void; onSaved: () => void; editList: () => void }) {
  const [list, setList] = useState<House[] | null>(null);
  const [pick, setPick] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!patient || !stay) return;
    setList(null); setPick(stay.accommodation?.id ?? ""); setRoom(stay.accommodation?.room_number ?? "");
    fetchJsonWithTimeout<House[]>(`${API_BASE}/accommodations`).then((r) => setList(Array.isArray(r) ? r : []));
  }, [patient?.id, stay?.id, stay?.accommodation?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient || !stay) return null;
  const nights = between(stay.start_date, stay.end_date);
  const chosen = list?.find((h) => h.id === pick);
  const save = async () => {
    setBusy(true);
    const before = { accommodation_id: stay.accommodation?.id ?? null, room_number: stay.accommodation?.room_number ?? null };
    const res = await saveStay(patient.id, stay.id, chosen ? { accommodation_id: chosen.id, room_number: room.trim() || null } : { accommodation_id: null, room_number: null });
    setBusy(false);
    if (!res.ok) { toast.error("The accommodation was not saved. Try again."); return; }
    toastUndo(chosen ? `${first(patient.name)}: ${chosen.name}` : `${first(patient.name)}: no accommodation`, async () => { await saveStay(patient.id, stay.id, before); onSaved(); });
    onSaved();
    onClose();
  };
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={`Accommodation for ${first(patient.name)}`} note={`${plural(nights, "night")}, ${dayText(stay.start_date)} to ${dayText(stay.end_date)}.`}
      foot={<Foot label={chosen ? `Use ${chosen.name}` : pick === "none" ? "No accommodation" : "Choose a type"} ok={!!pick} busy={busy} save={save} />}>
      {list === null ? <Loading rows={3} /> : (<>
        {chosen ? <Consequence>{`${plural(nights, "night")} × ${rupees(chosen.price_per_day)} = ${rupees(chosen.price_per_day * nights)}. For reference, not an invoice.`}</Consequence> : null}
        <div className="mt-3">
        <Picker value={pick} onChange={setPick} onEdit={editList}
          options={[{ id: "none", name: "No accommodation" }, ...list.filter((h) => h.is_active || h.id === stay.accommodation?.id).map((h) => ({ id: h.id, name: h.name, note: `${rupees(h.price_per_day)} a day${h.notes ? ` · ${h.notes}` : ""}`, fact: rupees(h.price_per_day * nights) }))]} />
        </div>
        {chosen ? <Text label="Room number (optional)" placeholder="e.g. N-4" autoComplete="off" maxLength={20} value={room} onChange={(e) => setRoom(e.target.value)} /> : null}
      </>)}
    </BottomSheet>
  );
}

/* ------------------------------ Story 10: change a stay ------------------------------ */

export type StayTarget = { id: string | null; start: string; end: string; package: CardStay["package"]; accommodation: CardStay["accommodation"] };

export function StaySheet({ patient, target, today, onClose, onSaved }: { patient: Who | null; target: StayTarget | null; today: string; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cancels, setCancels] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setStart(target.start); setEnd(target.end); setCancels(0); } }, [target?.id, target?.start, target?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  // What a shorter stay would cancel, asked of the server before the tap.
  useEffect(() => {
    if (!patient || !target?.id || !end || end >= target.end) { setCancels(0); return; }
    let stale = false;
    fetchJsonWithTimeout<{ cancels: unknown[] }>(`${API_BASE}/patients/${patient.id}/stays/${target.id}/preview?end_date=${end}`).then((r) => { if (!stale) setCancels(r?.cancels?.length ?? 0); });
    return () => { stale = true; };
  }, [patient?.id, target?.id, target?.end, end]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient || !target) return null;
  const oldDays = between(target.start, target.end) + 1;
  const days = between(start, end) + 1;
  const delta = days - oldDays;
  const changed = start !== target.start || end !== target.end;
  const lines = [
    delta < 0 ? `${plural(-delta, "day")} shorter.${cancels ? ` ${plural(cancels, "treatment")} after ${dayText(end)} will be marked cancelled (stay shortened) and stay in the record.` : ""} Meals stop that day.` : "",
    delta > 0 ? `${plural(delta, "day")} longer. Meals carry on to ${dayText(end)}.` : "",
    changed && target.accommodation ? `Accommodation: ${plural(between(start, end), "night")}, ${rupees(between(start, end) * target.accommodation.price_per_day)}.` : "",
    changed && target.package && target.package.days !== days ? `Package: ${target.package.days} days; the stay is now ${days}.` : "",
  ].filter(Boolean);
  const save = async () => {
    setBusy(true);
    const res = target.id
      ? await saveStay(patient.id, target.id, { start_date: start, end_date: end, cancel_after: cancels > 0 })
      : await fetch(`${API_BASE}/patients/${patient.id}/stays`, { method: "POST", headers: json, body: JSON.stringify({ start_date: start, end_date: end }) });
    setBusy(false);
    if (!res.ok) { toast.error("The stay was not saved. Try again."); return; }
    const out = await res.json().catch(() => ({}));
    const undo = target.id ? async () => {
      await saveStay(patient.id, target.id!, { start_date: target.start, end_date: target.end });
      if (out.batch_id) await fetch(`${API_BASE}/replan/undo`, { method: "POST", headers: json, body: JSON.stringify({ batch_id: out.batch_id }) });
      onSaved();
    } : null;
    const text = `${first(patient.name)}: ${dayText(start)} to ${dayText(end)}${out.cancelled ? `, ${plural(out.cancelled, "treatment")} cancelled` : ""}`;
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
