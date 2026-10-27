/**
 * What the doctor ruled out for one guest (#1254): days with no treatments (Vamana, Virechana) and therapies not for
 * them (pregnancy, high BP). The server's guard refuses both; this sheet only writes them down.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { BottomSheet, Btn, DateRow, Foot, ListGroup, Row, Text, dayText } from "@/components/kit";

export type Limits = { rest_days: { date: string; why?: string }[]; not_for: { therapy_id: string; name?: string; why?: string }[] };
type Therapy = { id: string; name: string; is_consultation?: boolean; is_active?: boolean };

export const limitsText = (l: Limits | null | undefined) =>
  [...(l?.rest_days ?? []).map((r) => `No treatments ${dayText(r.date)}${r.why ? ` (${r.why})` : ""}`), ...(l?.not_for ?? []).map((n) => `No ${n.name ?? "therapy"}`)].join(" · ");

export function LimitsSheet({ open, patient, limits, from, onClose, onSaved }: { open: boolean; patient: { id: string; name: string }; limits: Limits | null; from: string; onClose: () => void; onSaved: (l: Limits) => void }) {
  const [rest, setRest] = useState<Limits["rest_days"]>([]);
  const [notFor, setNotFor] = useState<Limits["not_for"]>([]);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [day, setDay] = useState(from);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRest(limits?.rest_days ?? []); setNotFor(limits?.not_for ?? []); setDay(from); setWhy("");
    fetchJsonWithTimeout<Therapy[]>(`${API_BASE}/therapies`).then((t) => setTherapies(Array.isArray(t) ? t.filter((x) => !x.is_consultation && x.is_active !== false) : [])).catch(() => {});
  }, [open, limits, from]);
  const first = patient.name.split(" ")[0];
  const save = async () => {
    setBusy(true);
    const next = { rest_days: rest, not_for: notFor };
    const res = await fetch(`${API_BASE}/patients/${patient.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ treatment_limits: next }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast.error("That was not saved. Try again."); return; }
    toast.success(`Saved for ${first}`);
    onSaved(next);
    onClose();
  };
  const ruled = new Set(notFor.map((n) => n.therapy_id));
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={`Not for ${first}`} note="Nothing can be booked against these, by hand or by the planner. The consultation is never stopped."
      foot={<Foot label="Save" busy={busy} save={() => void save()} />}>
      <ListGroup title="Days with no treatments" count={rest.length || undefined}>
        {rest.map((r) => <Row key={r.date} title={dayText(r.date)} facts={r.why} trailing="Remove" onClick={() => setRest(rest.filter((x) => x.date !== r.date))} />)}
      </ListGroup>
      <div className="mt-2 grid gap-2">
        <DateRow label="Day" value={day} min={from} onChange={setDay} />
        <Text label="Why" placeholder="Vamana" maxLength={80} value={why} onChange={(e) => setWhy(e.target.value)} />
        <Btn inline disabled={!day || rest.some((r) => r.date === day)} onClick={() => { setRest([...rest, { date: day, why: why.trim() || undefined }].sort((a, b) => a.date.localeCompare(b.date))); setWhy(""); }}>Add {day ? dayText(day) : "the day"}</Btn>
      </div>
      <div className="mt-4"><ListGroup title="Therapies not for them" count={notFor.length || undefined}>
        {therapies.map((t) => <Row key={t.id} title={t.name} trailing={ruled.has(t.id) ? "Not for them" : "Allowed"} onClick={() => setNotFor(ruled.has(t.id) ? notFor.filter((n) => n.therapy_id !== t.id) : [...notFor, { therapy_id: t.id, name: t.name }])} />)}
      </ListGroup></div>
    </BottomSheet>
  );
}
