/**
 * A group booking (#1196): who came with it, and the organiser's new dates applied to everyone not yet here in
 * one move. Whoever could not move is named. Undo moves them back by the same days.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { BottomSheet } from "@/components/BottomBar";
import { Btn, ChangeLine, Consequence, LineDate, ListGroup, Row, dayText, plural, toastUndo, undoWrite } from "@/components/kit";

export type Group = { name: string; count: number; start_date: string; end_date: string; guests: { stay_id: string; patient_id: string; name: string; start_date: string; end_date: string; room: string | null; started: boolean }[] };
export const fetchGroups = () => fetchJsonWithTimeout<Group[]>(`${API_BASE}/groups`).then((r) => (Array.isArray(r) ? r : []));
const DAY_MS = 86400000;

export function GroupSheet({ group, today, onClose, onChanged, openPatient }: { group: Group | null; today: string; onClose: () => void; onChanged: () => void; openPatient: (id: string) => void }) {
  const [arrive, setArrive] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setArrive(group?.start_date ?? ""), [group?.name, group?.start_date]);
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
  return (
    <BottomSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={group.name} note={`${plural(group.count, "guest")}, ${dayText(group.start_date)} to ${dayText(group.end_date)}.`}
      foot={waiting ? <Btn kind="primary" disabled={busy || !days} onClick={save}>{days ? `Move ${plural(waiting, "guest")} to ${dayText(arrive)}` : "Choose the new arrival day"}</Btn> : undefined}>
      {waiting ? <div className="border-y border-border">
        <ChangeLine label="Group arrives" value={dayText(arrive)} select={<LineDate label="Group arrives" value={arrive} min={today} onChange={setArrive} />} />
      </div> : null}
      {days && waiting ? <Consequence>{`Everyone not yet here moves ${plural(Math.abs(days), "day")} ${days > 0 ? "later" : "earlier"}, with their treatments and meals; each room is checked first. Anyone who cannot move is named.`}</Consequence> : null}
      <div className="mt-3"><ListGroup title="Guests" count={group.count}>
        {group.guests.map((g) => <Row key={g.stay_id} title={g.name} facts={`${dayText(g.start_date)} to ${dayText(g.end_date)}${g.room ? ` · ${g.room}` : ""}${g.started ? " · here" : ""}`} trailing="›" onClick={() => openPatient(g.patient_id)} />)}
      </ListGroup></div>
    </BottomSheet>
  );
}
