import { useEffect, useState, type ReactNode } from "react";
import { Chips, Foot, Seg, Switch, field, lbl, say, wide } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import PageHead from "@/components/PageHead";
import type { UiRoom, UiStaff, UiTherapy } from "@/pages/tabs/shared";

/**
 * Therapists, rooms and therapies as the phone design's lists (#273 H1): a page
 * header, plain rows, and one bottom sheet to add or change an entry, with only
 * the fields a centre fills. Replaces the old desktop tables and dialogs.
 */

export function SetupPage({ title, note, add, extra, search, setSearch, placeholder, children }: {
  title: string; note?: ReactNode; add: [string, () => void]; extra?: ReactNode; search: string; setSearch: (s: string) => void; placeholder: string; children: ReactNode;
}) {
  return (
    <div className="pb-28">
      <PageHead title={title} note={note} />
      <div className="mb-2 flex gap-2">
        <button type="button" className={`${wide} flex-1 bg-primary text-primary-foreground`} onClick={add[1]}>+ {add[0]}</button>
        {extra}
      </div>
      <input className={`${field} mb-2 rounded-full`} placeholder={placeholder} aria-label={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
    </div>
  );
}

export const Row = ({ name, sub, onClick, dim }: { name: string; sub: string; onClick: () => void; dim?: boolean }) => (
  <button type="button" onClick={onClick} className="flex min-h-[58px] w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 active:bg-secondary">
    <span className="min-w-0 flex-1">
      <span className={`block font-semibold ${dim ? "text-muted-foreground" : ""}`}>{name}</span>
      <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
    </span>
    <span className="text-muted-foreground">›</span>
  </button>
);

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
  // A new room starts with everything the therapies need (#273 U2): with nothing ticked, no therapy fits any room and nothing books.
  useEffect(() => { if (open) { setName(room?.name ?? ""); setHas(room?.amenities ?? amenityOptions); } }, [open, room]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={room ? room.name : "Add room"}>
      <label className={lbl} htmlFor="room-name">Name</label>
      <input id="room-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Room 4 or Dhanvantari" />
      <span className={lbl}>What it has</span>
      <p className="-mt-1 mb-2 text-[13px] text-muted-foreground">A therapy that needs something is only booked into a room that has it. Untick what this room does not have.</p>
      <Chips options={amenityOptions} value={has} onChange={setHas} addLabel="Something else…" />
      <Foot busy={busy} ok={!!name.trim()} save={save} remove={room ? () => { onClose(); remove(room); } : undefined} />
    </BottomSheet>
  );
}

// ---- Therapists and doctors ----
export const personSub = (s: UiStaff) => [s.role === "doctor" ? "Doctor" : "Therapist", s.status !== "Active" ? "not working here now" : `${s.specializations.length} ${s.specializations.length === 1 ? "therapy" : "therapies"}`].join(" · ");

export function PersonSheet({ person, open, onClose, therapies, onSaved, remove }: {
  person: UiStaff | null; open: boolean; onClose: () => void; therapies: UiTherapy[]; onSaved: (s: UiStaff) => void; remove: (s: UiStaff) => void;
}) {
  const [name, setName] = useState(""); const [role, setRole] = useState<"therapist" | "doctor">("therapist");
  const [gender, setGender] = useState<"Female" | "Male">("Female"); const [gives, setGives] = useState<string[]>([]);
  const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? ""); setRole(person?.role ?? "therapist"); setGender(person?.gender === "Male" ? "Male" : "Female");
    setGives(person?.specializations ?? []); setPhone(person?.phone ?? "");
  }, [open, person]);
  const save = async () => {
    setBusy(true);
    try {
      const ids = gives.map((n) => therapies.find((t) => t.name === n)?.id).filter(Boolean);
      const body = { name: name.trim(), role, gender: gender.toLowerCase(), specializations: ids, phone: phone.trim(), ...(person ? {} : { weekly_schedule: {} }) };
      const x = await send(person ? `/staff/${person.id}` : "/staff", person ? "PUT" : "POST", body);
      onSaved({ id: x.id, name: x.name, role: x.role ?? role, gender: x.gender === "male" ? "Male" : x.gender === "female" ? "Female" : "Other",
        specializations: (x.specializations || []).map((id: string) => therapies.find((t) => String(t.id) === String(id))?.name).filter(Boolean),
        phone: x.phone || "", schedule: "", status: x.is_active === false ? "Inactive" : "Active" });
      toast(person ? `${x.name} saved` : `${x.name} added`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={person ? person.name : "Add therapist or doctor"}>
      <label className={lbl} htmlFor="person-name">Name</label>
      <input id="person-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
      <span className={lbl}>Role</span>
      <Seg options={[["therapist", "Therapist"], ["doctor", "Doctor"]]} value={role} onChange={setRole} />
      <span className={lbl}>Gender</span>
      <p className="-mt-1 mb-2 text-[13px] text-muted-foreground">Used when a therapy needs a therapist of the resident's gender.</p>
      <Seg options={[["Female", "Female"], ["Male", "Male"]]} value={gender} onChange={setGender} />
      {role === "therapist" ? (<>
        <span className={lbl}>Therapies they give</span>
        {therapies.length ? <Chips options={therapies.map((t) => t.name)} value={gives} onChange={setGives} /> : <p className="text-sm text-muted-foreground">Add therapies first, then tick the ones they give.</p>}
      </>) : null}
      <label className={lbl} htmlFor="person-phone">Phone (optional)</label>
      <input id="person-phone" className={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Foot busy={busy} ok={!!name.trim()} save={save} remove={person ? () => { onClose(); remove(person); } : undefined} />
    </BottomSheet>
  );
}

// ---- Therapies ----
export const VITALS: [string, string][] = [["bp", "BP"], ["pulse", "Pulse"], ["weight", "Weight"], ["temp", "Temperature"], ["spo2", "SpO₂"], ["sugar", "Blood sugar"]];
export const therapySub = (t: UiTherapy) => [`${t.duration} min`, (t.staffRequired ?? 1) > 1 ? `${t.staffRequired} therapists` : "", t.amenities.length ? `needs ${t.amenities.map(say).join(", ")}` : "", t.genderMatch ? "same gender" : ""].filter(Boolean).join(" · ");

export function TherapySheet({ therapy, open, onClose, amenityOptions, onSaved, remove }: {
  therapy: UiTherapy | null; open: boolean; onClose: () => void; amenityOptions: string[]; onSaved: (t: UiTherapy) => void; remove: (t: UiTherapy) => void;
}) {
  const [name, setName] = useState(""); const [mins, setMins] = useState(60); const [needs, setNeeds] = useState<string[]>([]);
  const [staff, setStaff] = useState(1); const [same, setSame] = useState(false);
  const [checks, setChecks] = useState<{ text: string; required: boolean }[]>([]); const [vitals, setVitals] = useState<string[]>(["bp"]); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(therapy?.name ?? ""); setMins(therapy?.duration ?? 60); setNeeds(therapy?.amenities ?? []); setStaff(therapy?.staffRequired ?? 1);
    setSame(therapy?.genderMatch ?? false); setChecks(therapy?.checklist ?? []); setVitals(therapy?.vitals ?? ["bp"]);
  }, [open, therapy]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), duration_minutes: mins, required_amenities: needs, staff_required: staff, requires_gender_match: same, checklist: checks.filter((c) => c.text.trim()), vitals };
      const x = await send(therapy ? `/therapies/${therapy.id}` : "/therapies", therapy ? "PUT" : "POST", body);
      onSaved({ id: x.id, name: x.name, duration: x.duration_minutes ?? mins, amenities: x.required_amenities || needs, genderMatch: !!x.requires_gender_match, staffRequired: x.staff_required ?? staff, checklist: x.checklist || [], vitals: x.vitals || vitals });
      toast(therapy ? `${x.name} saved` : `${x.name} added`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const vitalNames = VITALS.map(([, l]) => l);
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={therapy ? therapy.name : "Add therapy"}>
      <label className={lbl} htmlFor="therapy-name">Name</label>
      <input id="therapy-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Abhyanga" />
      <span className={lbl}>How long</span>
      <Seg options={[...new Set([20, 30, 45, 60, 75, 90, mins])].sort((a, b) => a - b).map((m) => [m, `${m}`] as [number, string])} value={mins} onChange={setMins} />
      <p className="mt-1 text-[13px] text-muted-foreground">minutes</p>
      <span className={lbl}>Therapists needed</span>
      <Seg options={[[1, "1"], [2, "2"], [3, "3"]]} value={staff} onChange={setStaff} />
      <span className={lbl}>What the room needs</span>
      <Chips options={amenityOptions} value={needs} onChange={setNeeds} addLabel="Something else…" />
      <Switch label="Therapist of the resident's gender" on={same} set={setSame} />
      <span className={lbl}>Readings the therapist takes</span>
      <Chips options={vitalNames} value={vitals.map((k) => VITALS.find(([v]) => v === k)?.[1] || k)} onChange={(v) => setVitals(v.map((l) => VITALS.find(([, x]) => x === l)?.[0] || l))} />
      <span className={lbl}>Checks the therapist ticks</span>
      <div className="grid gap-2">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={`${field} flex-1`} aria-label="Check" value={c.text} onChange={(e) => setChecks(checks.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
            <button type="button" aria-label="Remove check" className="h-11 w-11 rounded-full text-muted-foreground" onClick={() => setChecks(checks.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className={`${wide} border`} onClick={() => setChecks([...checks, { text: "", required: false }])}>Add a check</button>
      </div>
      <Foot busy={busy} ok={!!name.trim() && mins > 0} save={save} remove={therapy ? () => { onClose(); remove(therapy); } : undefined} />
    </BottomSheet>
  );
}
