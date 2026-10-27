/**
 * A group booking (#1196): who came with it, the rooms held for it before the names arrive, the organiser's list
 * filling them, and the organiser's new dates applied to everyone not yet here in one move. Whoever could not move
 * is named. Undo moves them back by the same days.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { BottomSheet } from "@/components/BottomBar";
import { ResidentsFromSheet } from "@/components/ResidentImport";
import { Btn, Callout, ChangeLine, Consequence, DateRow, LineDate, ListGroup, Row, Switch, Text, TimeList, datePair, dayText, plural, timesBetween, toastUndo, undoWrite } from "@/components/kit";

type Hold = { accommodation_id: string; type: string; rooms: number; filled: number; start_date: string; end_date: string; keep_until: string | null; lapsed: boolean };
type Part = { id: string; activity_name: string; start_time: string; end_time: string; is_optional: boolean };
export type Group = { name: string; count: number; start_date: string; end_date: string; holds: Hold[]; programme: Part[]; guests: { stay_id: string; patient_id: string; name: string; start_date: string; end_date: string; room: string | null; started: boolean }[] };
export const fetchGroups = () => fetchJsonWithTimeout<Group[]>(`${API_BASE}/groups`).then((r) => (Array.isArray(r) ? r : []));
const DAY_MS = 86400000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function GroupSheet({ group, today, onClose, onChanged, openPatient }: { group: Group | null; today: string; onClose: () => void; onChanged: () => void; openPatient: (id: string) => void }) {
  const [arrive, setArrive] = useState("");
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(false);
  const [listing, setListing] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => setArrive(group?.start_date ?? ""), [group?.name, group?.start_date]);
  // Days the group needs more therapist time than is free (#1242), as the server counts it.
  const [short, setShort] = useState<{ date: string; guests: number; needed: number; free: number }[]>([]);
  useEffect(() => {
    setShort([]);
    if (!group) return;
    let stale = false;
    fetchJsonWithTimeout<typeof short>(`${API_BASE}/groups/capacity?name=${encodeURIComponent(group.name)}`).then((r) => { if (!stale && Array.isArray(r)) setShort(r); }).catch(() => {});
    return () => { stale = true; };
  }, [group]);
  if (!group) return null;
  const days = Math.round((Date.parse(arrive) - Date.parse(group.start_date)) / DAY_MS);
  const waiting = group.guests.filter((g) => !g.started).length;
  const move = (n: number) => fetch(`${API_BASE}/groups/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: group.name, days: n }) });
  const save = async () => {
    setBusy(true);
    const res = await move(days).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast.error("The group was not moved. Try again."); return; }
    const out: { moved: string[]; not_moved: { name: string; why: string }[] } = await res.json();
    toastUndo(`${group.name}: ${plural(out.moved.length, "guest")} moved ${plural(Math.abs(days), "day")} ${days > 0 ? "later" : "earlier"}`, () => undoWrite(() => move(-days), onChanged));
    if (out.not_moved.length) toast.warning(`${plural(out.not_moved.length, "guest")} not moved`, { description: out.not_moved.map((n) => `${n.name}: ${n.why}`).join(" · ") });
    onChanged();
    onClose();
  };
  const notHere = group.start_date > today;
  const removePart = async (e: Part) => {
    const res = await fetch(`${API_BASE}/groups/programme/${e.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { toast.error("That was not removed. Try again."); return; }
    toastUndo(`${e.activity_name} removed from ${group.name}`, () => undoWrite(() => addPart(group.name, e), onChanged));
    onChanged();
  };
  return (
    <>
      <BottomSheet open={!holding && !listing && !adding} onOpenChange={(o) => { if (!o) onClose(); }} title={group.name} note={`${plural(group.count, "guest")}, ${dayText(group.start_date)} to ${dayText(group.end_date)}.`}
        foot={waiting || (notHere && group.holds.length) ? <Btn kind="primary" disabled={busy || !days} onClick={save}>{days ? `Move ${waiting ? plural(waiting, "guest") : "the held rooms"} to ${dayText(arrive)}` : "Choose the new arrival day"}</Btn> : undefined}>
        {waiting || (notHere && group.holds.length) ? <div className="border-y border-border">
          <ChangeLine label="Group arrives" value={dayText(arrive)} select={<LineDate label="Group arrives" value={arrive} min={today} onChange={setArrive} />} />
        </div> : null}
        {days && (waiting || group.holds.length) ? <Consequence>{`Everyone not yet here moves ${plural(Math.abs(days), "day")} ${days > 0 ? "later" : "earlier"}, with their treatments, meals and held rooms; each room is checked first. Anyone who cannot move is named.`}</Consequence> : null}
        {short.length ? <div className="mt-2"><Callout tone="notice" title={`Short of therapists on ${plural(short.length, "day")}`}>{`${short.slice(0, 3).map((d) => `${dayText(d.date)}: about ${Math.round(d.needed / 60)} h needed, ${Math.round(d.free / 60)} h free`).join(" · ")}${short.length > 3 ? ` · and ${short.length - 3} more` : ""}. Ask a therapist in, or spread the treatments.`}</Callout></div> : null}
        <div className="mt-3"><ListGroup title="Held rooms" count={group.holds.reduce((n, h) => n + h.rooms, 0) || undefined}>
          {group.holds.map((h) => <Row key={h.accommodation_id} title={`${plural(h.rooms, "room")} · ${h.type}`} facts={`${dayText(h.start_date)} to ${dayText(h.end_date)} · ${h.filled} named${h.keep_until ? (h.lapsed ? ` · lapsed ${dayText(h.keep_until)}, free again` : ` · kept until ${dayText(h.keep_until)}`) : ""}`} flag={h.lapsed ? "Lapsed" : undefined} />)}
          <Row title={group.holds.length ? "Change the held rooms" : "Hold rooms before the names arrive"} trailing="›" onClick={() => setHolding(true)} />
          {group.holds.length ? <Row title="Add guests from the organiser's list" trailing="›" onClick={() => setListing(true)} /> : null}
        </ListGroup></div>
        <div className="mt-3"><ListGroup title="Programme for everyone">
          {group.programme.map((e) => <Row key={e.id} title={e.activity_name} facts={`${e.start_time}–${e.end_time} every day${e.is_optional ? " · optional" : ""}`} trailing="Remove" onClick={() => void removePart(e)} />)}
          <Row title="Add to the programme" facts={group.programme.length ? undefined : "Yoga at 7 for the whole group; each guest's own treatments go on top."} trailing="›" onClick={() => setAdding(true)} />
        </ListGroup></div>
        {group.count ? <div className="mt-3"><ListGroup title="Guests" count={group.count}>
          {group.guests.map((g) => <Row key={g.stay_id} title={g.name} facts={`${dayText(g.start_date)} to ${dayText(g.end_date)}${g.room ? ` · ${g.room}` : ""}${g.started ? " · here" : ""}`} trailing="›" onClick={() => openPatient(g.patient_id)} />)}
        </ListGroup></div> : null}
      </BottomSheet>
      <PartSheet open={adding} group={group.name} onClose={() => setAdding(false)} onSaved={onChanged} />
      <HoldSheet open={holding} group={group} today={today} onClose={() => setHolding(false)} onSaved={onChanged} />
      <ResidentsFromSheet open={listing} group={group.holds[0] ? { name: group.name, start_date: group.holds[0].start_date, end_date: group.holds[0].end_date } : undefined} onClose={() => setListing(false)} onAdded={() => onChanged()} />
    </>
  );
}

const addPart = (name: string, p: Omit<Part, "id">) => fetch(`${API_BASE}/groups/programme`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, activity_name: p.activity_name, start_time: p.start_time, end_time: p.end_time, is_optional: p.is_optional }) });

/** One part of a group's shared programme (#1196), every day of the group's dates. */
function PartSheet({ open, group, onClose, onSaved }: { open: boolean; group: string; onClose: () => void; onSaved: () => void }) {
  const [what, setWhat] = useState("");
  const [from, setFrom] = useState("07:00");
  const [to, setTo] = useState("08:00");
  const [optional, setOptional] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setWhat(""); setFrom("07:00"); setTo("08:00"); setOptional(false); } }, [open]);
  const save = async () => {
    setBusy(true);
    const res = await addPart(group, { activity_name: what.trim(), start_time: from, end_time: to, is_optional: optional }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast.error("That was not added. Try again."); return; }
    toast.success(`${what.trim()} added for ${group}, ${from}–${to} every day`);
    onSaved();
    onClose();
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Add to the programme" note={`For everyone in ${group}, every day they are here. It prints in each guest's row of the day sheet.`}
      foot={<Btn kind="primary" disabled={busy || !what.trim() || to <= from} onClick={() => void save()}>{what.trim() ? `Add ${what.trim()} at ${from}` : "Name it first"}</Btn>}>
      <div className="grid gap-3">
        <Text label="What" placeholder="Yoga" maxLength={80} value={what} onChange={(e) => setWhat(e.target.value)} />
        <div className={datePair}>
          <TimeList label="From" value={from} onChange={(t) => { setFrom(t); if (to <= t) setTo(t.replace(/^(\d\d)/, (h) => String(Math.min(23, Number(h) + 1)).padStart(2, "0"))); }} times={timesBetween("05:00", "22:00", 15)} />
          <TimeList label="To" value={to} onChange={setTo} times={timesBetween("05:15", "23:00", 15)} />
        </div>
        <Switch label="Optional" note="Off: a treatment across it is named on the day check." on={optional} set={setOptional} />
      </div>
    </BottomSheet>
  );
}

type Night = { accommodation_id: string; type: string; free: boolean };

/** Rooms held for a group (#1196): the dates and how many of each type. A new group starts here, before any name. */
export function HoldSheet({ open, group, today, onClose, onSaved }: { open: boolean; group: Group | null; today: string; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [want, setWant] = useState<Record<string, string>>({});
  // Tentative (#1203): a phone enquiry's rooms are kept until a day, then free again unless confirmed.
  const [keep, setKeep] = useState<string | null>(null);
  const [types, setTypes] = useState<{ id: string; type: string; free: number }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = group?.holds[0];
    setName(group?.name ?? "");
    setFrom(h?.start_date ?? group?.start_date ?? addDays(today, 30));
    setTo(h?.end_date ?? group?.end_date ?? addDays(today, 37));
    setWant(Object.fromEntries((group?.holds ?? []).map((x) => [x.accommodation_id, String(x.rooms)])));
    setKeep(h?.keep_until ?? null);
  }, [open, group, today]);
  useEffect(() => {
    if (!open || !from || to <= from) return;
    let stale = false;
    // The group's own held rooms count as free to it, so changing a hold never refuses itself.
    fetchJsonWithTimeout<Night[]>(`${API_BASE}/guest-rooms/free?from=${from}&to=${to}${group ? `&group=${encodeURIComponent(group.name)}` : ""}`).then((rooms) => {
      if (stale || !Array.isArray(rooms)) return;
      const by = new Map<string, { id: string; type: string; free: number }>();
      for (const r of rooms) { const t = by.get(r.accommodation_id) ?? { id: r.accommodation_id, type: r.type, free: 0 }; t.free += Number(r.free); by.set(r.accommodation_id, t); }
      setTypes([...by.values()]);
    }).catch(() => {});
    return () => { stale = true; };
  }, [open, from, to, group]);
  const total = Object.values(want).reduce((n, v) => n + (Number(v) || 0), 0);
  const save = async () => {
    setBusy(true);
    const res = await fetch(`${API_BASE}/groups/hold`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), start_date: from, end_date: to, rooms: types.map((t) => ({ accommodation_id: t.id, rooms: Number(want[t.id]) || 0 })), keep_until: keep }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast.error(res?.status === 409 ? (await res.json()).message : "The rooms were not held. Try again."); return; }
    toast.success(total ? `${plural(total, "room")} held for ${name.trim()}` : `The held rooms for ${name.trim()} were let go`);
    onSaved(name.trim());
    onClose();
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={group ? `Rooms for ${group.name}` : "Hold rooms"}
      note="How many rooms of each type, held before the names arrive. Others see them as taken."
      foot={<Btn kind="primary" disabled={busy || !name.trim() || to <= from || (!total && !group?.holds.length)} onClick={() => void save()}>{total ? `Hold ${plural(total, "room")}` : group?.holds.length ? "Let the held rooms go" : "Choose how many rooms"}</Btn>}>
      <div className="grid gap-3">
        {group ? null : <Text label="Group or enquiry" placeholder="Rishikesh Yoga, Nov" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
        <div className={datePair}>
          <DateRow label="Arriving" value={from} min={today} onChange={(d) => { setFrom(d); if (to <= d) setTo(addDays(d, 7)); }} />
          <DateRow label="Leaving" value={to} min={addDays(from || today, 1)} onChange={setTo} />
        </div>
        <Switch label="Tentative" note="For an enquiry not yet confirmed: the rooms are free again after the day you choose." on={keep !== null} set={(on) => setKeep(on ? addDays(today, 3) : null)} />
        {keep !== null ? <DateRow label="Keep until" value={keep} min={today} max={from} onChange={setKeep} /> : null}
        {types.map((t) => <Text key={t.id} label={t.type} note={`${plural(t.free, "room")} free for all those nights`} type="number" inputMode="numeric" min={0} placeholder="0" value={want[t.id] ?? ""} onChange={(e) => setWant({ ...want, [t.id]: e.target.value })} />)}
      </div>
    </BottomSheet>
  );
}
