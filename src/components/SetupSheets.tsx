import { useEffect, useState } from "react";
import { ChangeLine, LineSelect, WEEK, Chips, Dropdown, Group, More, Seg, SheetFoot, Switch, Text, noteText, say, field, Btn } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import type { UiRoom, UiStaff, UiTherapy } from "@/pages/tabs/shared";

/**
 * One sheet each to add or change a therapist, a room or a therapy (#285 session 6):
 * the fields a centre fills first, the rest under "More details". Opened from the
 * Team screen's rows, the Therapies list and the choice +.
 */

async function send(path: string, method: string, body: unknown) {
  const r = await fetch(`${API_BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out?.error || `Could not save (${r.status})`);
  return out;
}

// ---- Rooms ----
export const roomSub = (r: UiRoom) => r.status !== "Active" ? "Out of use" : r.amenities.length ? `Has ${r.amenities.map(say).join(", ")}` : "Nothing special";

export function RoomSheet({ room, open, onClose, amenityOptions, onSaved, remove }: {
  room: UiRoom | null; open: boolean; onClose: () => void; amenityOptions: string[]; onSaved: (r: UiRoom) => void; remove: (r: UiRoom) => void;
}) {
  const [name, setName] = useState(""); const [has, setHas] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  // A new room starts with nothing ticked: a consultation needs a BP monitor and an examination bed, which a therapy room does not have, so ticking everything would send doctors into it. "Something else…" adds equipment the list lacks.
  useEffect(() => { if (open) { setName(room?.name ?? ""); setHas(room?.amenities ?? []); } }, [open, room]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), amenities: has, ...(room ? {} : { weekly_schedule: {} }) };
      const x = await send(room ? `/rooms/${room.id}` : "/rooms", room ? "PUT" : "POST", body);
      onSaved({ id: x.id, name: x.name, amenities: x.amenities || has, schedule: "", status: x.is_active === false ? "Maintenance" : "Active" });
      toast(room ? `${x.name} saved` : `${x.name} added`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={room ? room.name : "Add room"} note={room ? "Change anything, then save." : "Give it a name and tick what it has."}
      foot={<SheetFoot busy={busy} ok={!!name.trim()} save={save} label={room ? "Save the room" : "Add the room"} remove={room ? () => { onClose(); remove(room); } : undefined} removeLabel="Delete this room" />}>
      <Text label="Name" id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Room 4 or Dhanvantari" />
      <Group label="What it has" note="A therapy that needs something is only booked into a room that has it.">
        <Chips options={[...new Set([...amenityOptions, ...has])]} value={has} onChange={setHas} addLabel="Something else…" />
      </Group>
    </BottomSheet>
  );
}

// ---- Therapists and doctors ----
export const personSub = (s: UiStaff) => [s.role === "doctor" ? "Doctor" : "Therapist", s.status !== "Active" ? "not working here now" : `${s.specializations.length} ${s.specializations.length === 1 ? "therapy" : "therapies"}`].join(" · ");

/** One range a weekday (#351): "07:00-15:00", or "" for a day off. */
type Week = Record<string, string>;
const short = (d: string) => d[0].toUpperCase() + d.slice(1, 3);
const shown = (r: string) => (r ? r.replace("-", "–") : "Day off");
/** "07:00–15:00 · Wed off": the usual range, then the days that differ. */
const weekText = (w: Week) => {
  const usual = Object.entries(WEEK.reduce((n, d) => ({ ...n, [w[d]]: (n[w[d]] || 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0][0];
  const odd = WEEK.filter((d) => w[d] !== usual).map((d) => (w[d] ? `${short(d)} ${shown(w[d])}` : `${short(d)} off`));
  return [usual ? shown(usual) : "Days off", ...odd].join(" · ") + (odd.length ? "" : usual ? " every day" : "");
};

export function PersonSheet({ person, open, onClose, therapies, onSaved, remove, preset, centre }: {
  person: UiStaff | null; open: boolean; onClose: () => void; therapies: UiTherapy[]; onSaved: (s: UiStaff) => void; remove: (s: UiStaff) => void;
  /** The centre's hours: a full day, and what a person never given hours works. */
  centre: { opening: string; closing: string };
  /** A new person started from a refusal (#330): the gender and therapy the booking is short of. */
  preset?: { gender?: "Female" | "Male"; gives?: string[] };
}) {
  const [name, setName] = useState(""); const [role, setRole] = useState<"therapist" | "doctor">("therapist");
  const [gender, setGender] = useState<"Female" | "Male">("Female"); const [gives, setGives] = useState<string[]>([]);
  const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const full = `${centre.opening}-${centre.closing}`;
  const [week, setWeek] = useState<Week>({}); const [hoursPage, setHoursPage] = useState(false); const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = person?.hours && Object.keys(person.hours).length ? person.hours : null;
    setWeek(Object.fromEntries(WEEK.map((d) => [d, h ? (h[d] ? `${h[d]!.start}-${h[d]!.end}` : "") : full])));
    setHoursPage(false); setTouched(false);
    setName(person?.name ?? ""); setRole(person?.role ?? "therapist"); setGender(person ? (person.gender === "Male" ? "Male" : "Female") : preset?.gender ?? "Female");
    setGives(person?.specializations ?? preset?.gives ?? []); setPhone(person?.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person]);
  const save = async () => {
    setBusy(true);
    try {
      const ids = gives.map((n) => therapies.find((t) => t.name === n)?.id).filter(Boolean);
      const hours = Object.fromEntries(WEEK.map((d) => [d, week[d] ? { start: week[d].slice(0, 5), end: week[d].slice(6) } : null]));
      const body = { name: name.trim(), role, gender: gender.toLowerCase(), specializations: ids, phone: phone.trim(), ...(touched ? { weekly_schedule: hours } : person ? {} : { weekly_schedule: {} }) };
      const x = await send(person ? `/staff/${person.id}` : "/staff", person ? "PUT" : "POST", body);
      onSaved({ id: x.id, name: x.name, role: x.role ?? role, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other",
        specializations: (x.specializations || []).map((id: string) => therapies.find((t) => String(t.id) === String(id))?.name).filter(Boolean),
        phone: x.phone || "", schedule: "", hours: x.weekly_schedule, status: x.is_active === false ? "Inactive" : "Active" });
      toast(person ? `${x.name} saved` : `${x.name} added`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={hoursPage ? `${name.trim() || "Their"} hours` : person ? person.name : "Add therapist or doctor"}
      note={hoursPage ? "The same every week. A one-off change is leave for part of the day." : person ? "Change anything, then save." : "Name, role and gender are needed. The rest can wait."}
      onBack={hoursPage ? () => setHoursPage(false) : undefined}
      foot={<SheetFoot busy={busy} ok={!!name.trim()} save={save} label={hoursPage && person ? "Save the hours" : person ? "Save" : `Add ${name.trim() || "them"}`} remove={person && !hoursPage ? () => { onClose(); remove(person); } : undefined} removeLabel="Delete this person" />}>
      {hoursPage ? <div>
        {WEEK.map((d) => {
          const opts = [...new Set([full, "07:00-15:00", "13:00-20:00", week[d], ""])].filter((r) => r !== undefined);
          const names: Record<string, string> = { [full]: "Full day", "07:00-15:00": "Early", "13:00-20:00": "Afternoon", "": "Day off" };
          return <ChangeLine key={d} label={d[0].toUpperCase() + d.slice(1)} value={shown(week[d])}
            select={<LineSelect label={`${d} hours`} value={week[d]} onChange={(v) => { setWeek({ ...week, [d]: v }); setTouched(true); }} free={opts.map((r) => ({ id: r, name: r ? `${names[r] ? `${names[r]} · ` : ""}${shown(r)}` : "Day off" }))} />} />;
        })}
      </div> : <>
      <Text label="Name" id="person-name" value={name} onChange={(e) => setName(e.target.value)} />
      <Group label="Role"><Seg<"therapist" | "doctor"> options={[["therapist", "Therapist"], ["doctor", "Doctor"]]} value={role} onChange={setRole} /></Group>
      <Group label="Gender" note="Used when a therapy needs a therapist of the patient's gender."><Seg<"Female" | "Male"> options={[["Female", "Female"], ["Male", "Male"]]} value={gender} onChange={setGender} /></Group>
      <div className="mt-3"><ChangeLine label="Hours" value={weekText(week)} onClick={() => setHoursPage(true)} /></div>
      {role === "therapist" ? (
        <Group label="Therapies they give (optional)">
          {therapies.length ? <Chips options={therapies.map((t) => t.name)} value={gives} onChange={setGives} /> : <p className={noteText}>Add therapies first, then tick the ones they give.</p>}
        </Group>
      ) : null}
      <Text label="Phone (optional)" id="person-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </>}
    </BottomSheet>
  );
}

// ---- Therapies ----
export const VITALS: [string, string][] = [["bp", "BP"], ["pulse", "Pulse"], ["weight", "Weight"], ["temp", "Temperature"], ["spo2", "SpO₂"], ["sugar", "Blood sugar"]];
export const therapySub = (t: UiTherapy) => [`${t.duration} min`, (t.staffRequired ?? 1) > 1 ? `${t.staffRequired} therapists` : "", t.amenities.length ? `needs ${t.amenities.map(say).join(", ")}` : "", t.genderMatch ? "same gender" : "", t.once ? "once a stay" : ""].filter(Boolean).join(" · ");

export function TherapySheet({ therapy, open, onClose, amenityOptions, onSaved, remove }: {
  therapy: UiTherapy | null; open: boolean; onClose: () => void; amenityOptions: string[]; onSaved: (t: UiTherapy) => void; remove: (t: UiTherapy) => void;
}) {
  const [name, setName] = useState(""); const [mins, setMins] = useState(60); const [needs, setNeeds] = useState<string[]>([]);
  const [staff, setStaff] = useState(1); const [same, setSame] = useState(false); const [once, setOnce] = useState(false);
  const [checks, setChecks] = useState<{ text: string; required: boolean }[]>([]); const [vitals, setVitals] = useState<string[]>(["bp"]); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(therapy?.name ?? ""); setMins(therapy?.duration ?? 60); setNeeds(therapy?.amenities ?? []); setStaff(therapy?.staffRequired ?? 1);
    setSame(therapy?.genderMatch ?? false); setOnce(therapy?.once ?? false); setChecks(therapy?.checklist ?? []); setVitals(therapy?.vitals ?? ["bp"]);
  }, [open, therapy]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), duration_minutes: mins, required_amenities: needs, staff_required: staff, requires_gender_match: same, once_per_course: once, checklist: checks.filter((c) => c.text.trim()), vitals };
      const x = await send(therapy ? `/therapies/${therapy.id}` : "/therapies", therapy ? "PUT" : "POST", body);
      onSaved({ id: x.id, name: x.name, duration: x.duration_minutes ?? mins, amenities: x.required_amenities || needs, genderMatch: !!x.requires_gender_match, staffRequired: x.staff_required ?? staff, once: !!x.once_per_course, checklist: x.checklist || [], vitals: x.vitals || vitals });
      toast(therapy ? `${x.name} saved` : `${x.name} added`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const vitalNames = VITALS.map(([, l]) => l);
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={therapy ? therapy.name : "Add therapy"} note={therapy ? "Change anything, then save." : "Name and length are needed. The rest can wait."}
      foot={<SheetFoot busy={busy} ok={!!name.trim() && mins > 0} save={save} label={therapy ? "Save the therapy" : "Add the therapy"} remove={therapy ? () => { onClose(); remove(therapy); } : undefined} removeLabel="Delete this therapy" />}>
      <Text label="Name" id="therapy-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Abhyanga" />
      <Dropdown label="How long" value={String(mins)} onChange={(e) => setMins(Number(e.target.value))}>
        {[...new Set([15, 20, 30, 45, 60, 75, 90, 105, 120, mins])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes</option>)}
      </Dropdown>
      <Group label="Therapists needed"><Seg<number> options={[[1, "1"], [2, "2"], [3, "3"]]} value={staff} onChange={setStaff} /></Group>
      <Group label="What the room needs (optional)"><Chips options={amenityOptions} value={needs} onChange={setNeeds} addLabel="Something else…" /></Group>
      <Switch label="Therapist of the patient's gender" on={same} set={setSame} />
      <Switch label="Once a stay, like Virechana" on={once} set={setOnce} />
      <More hint="readings, checks (optional)">
        <Group label="Readings the therapist takes">
          <Chips options={vitalNames} value={vitals.map((k) => VITALS.find(([v]) => v === k)?.[1] || k)} onChange={(v) => setVitals(v.map((l) => VITALS.find(([, x]) => x === l)?.[0] || l))} />
        </Group>
        <Group label="Checks the therapist ticks">
          <div className="grid gap-2">
            {checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${field} flex-1`} aria-label="Check" value={c.text} onChange={(e) => setChecks(checks.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                <button type="button" aria-label="Remove check" className="h-11 w-11 flex-none rounded-full text-muted-foreground" onClick={() => setChecks(checks.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <Btn kind="quiet" inline className="-ml-2" onClick={() => setChecks([...checks, { text: "", required: false }])}>Add a check</Btn>
          </div>
        </Group>
      </More>
    </BottomSheet>
  );
}
