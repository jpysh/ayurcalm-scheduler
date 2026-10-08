/**
 * Adding and changing guest rooms (#559): the one place, opened from the Guest rooms screen (its +
 * adds, its "Guest rooms" line lists) and from an accommodation type in Settings. "T1–T6" adds six.
 * A room with past stays is retired, never deleted, so their cards keep it.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { BottomSheet, Btn, ChangeLine, Empty, Foot, Group, ListGroup, LinkRow, Loading, Row, Seg, Text, noteText } from "@/components/kit";

type Type = { id: string; name: string; is_active: boolean };
type Room = { id: string; name: string; accommodation_id: string; beds: number; is_active: boolean };
const BEDS: [number, string][] = [[1, "1"], [2, "2"], [3, "3"], [4, "4"]];
const bedsText = (n: number) => `${n} bed${n === 1 ? "" : "s"}`;
const typesNow = () => fetchJsonWithTimeout<Type[]>(`${API_BASE}/accommodations`).then((r) => (Array.isArray(r) ? r.filter((t) => t.is_active) : []));

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}/guest-rooms${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { toast.error(out.error ? `${out.error}.` : "The guest room was not saved. Try again."); return null; }
  return out;
}

export function AddGuestRooms({ open, onOpenChange, typeId, onChanged, openTypes }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Preselected type, when asked from one. */
  typeId?: string;
  onChanged: () => void;
  /** Settings → Packages and accommodation, for a centre with no type yet. */
  openTypes: () => void;
}) {
  const [types, setTypes] = useState<Type[] | null>(null);
  const [type, setType] = useState("");
  const [names, setNames] = useState("");
  const [beds, setBeds] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setNames(""); setBeds(1); typesNow().then((t) => { setTypes(t); setType(t.find((x) => x.id === typeId)?.id ?? t[0]?.id ?? ""); }); } }, [open, typeId]);
  const add = async () => {
    setBusy(true);
    const out = await send("POST", "", { name: names.trim(), accommodation_id: type, beds });
    setBusy(false);
    if (!out) return;
    toast.success(out.added.length === 1 ? `${out.added[0]} added` : `${out.added.length} guest rooms added: ${out.added[0]} to ${out.added[out.added.length - 1]}`);
    onChanged();
    onOpenChange(false);
  };
  const noTypes = types !== null && !types.length;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add guest rooms" note="The rooms patients sleep in. One name, or a range: T1–T6 adds six."
      foot={noTypes ? undefined : <Foot label="Add the guest rooms" ok={!!names.trim() && !!type} busy={busy} save={add} />}>
      {types === null ? <Loading rows={2} /> : noTypes ? (
        <Empty text="A guest room belongs to a type of accommodation, and there is none yet." action={<Btn kind="primary" inline onClick={() => { onOpenChange(false); openTypes(); }}>Add an accommodation type</Btn>} />
      ) : (
        <div className="grid gap-3">
          <Text label="Names" placeholder="T1–T6" autoComplete="off" maxLength={80} value={names} onChange={(e) => setNames(e.target.value)} />
          {types.length > 1 ? (
            <ChangeLine label="Type" value={types.find((t) => t.id === type)?.name ?? ""} select={
              <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>} />
          ) : <p className={noteText}>In {types[0].name}.</p>}
          <Group label="Beds in each" note="How many patients may share one."><Seg<number> options={BEDS} value={beds} onChange={setBeds} /></Group>
        </div>
      )}
    </BottomSheet>
  );
}

/** Every guest room by type, a tap to change one; `typeId` keeps one type's. */
export function ManageGuestRooms({ open, onOpenChange, typeId, onChanged, openTypes }: {
  open: boolean; onOpenChange: (o: boolean) => void; typeId?: string; onChanged: () => void; openTypes: () => void;
}) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [types, setTypes] = useState<Type[]>([]);
  const [edit, setEdit] = useState<Room | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([fetchJsonWithTimeout<Room[]>(`${API_BASE}/guest-rooms`), typesNow()]).then(([r, t]) => { setRooms(Array.isArray(r) ? r.filter((x) => x.is_active) : []); setTypes(t); });
  useEffect(() => { if (open) load(); }, [open]);
  const changed = () => { load(); onChanged(); };
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "";
  const shown = (rooms ?? []).filter((r) => !typeId || r.accommodation_id === typeId);
  const groups = [...new Set(shown.map((r) => r.accommodation_id))].map((id) => ({ id, rooms: shown.filter((r) => r.accommodation_id === id) }));
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const out = await send("PUT", `/${edit.id}`, { name: edit.name.trim(), beds: edit.beds });
    setBusy(false);
    if (out) { toast.success(`${edit.name.trim()} saved`); setEdit(null); changed(); }
  };
  const remove = async () => {
    if (!edit) return;
    setBusy(true);
    const out = await send("DELETE", `/${edit.id}`);
    setBusy(false);
    if (out) { toast.success(out.retired ? `${edit.name} retired: it is no longer offered, and its past stays keep it` : `${edit.name} removed`); setEdit(null); changed(); }
  };
  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title="Guest rooms" note={typeId ? `In ${typeName(typeId)}. A tap changes one.` : "The rooms patients sleep in, by type. A tap changes one."}>
        <ListGroup><LinkRow label="Add guest rooms" value="T1–T6 adds six" onClick={() => setAdding(true)} /></ListGroup>
        {rooms === null ? <Loading rows={4} /> : groups.length ? groups.map((g) => (
          <ListGroup key={g.id} title={typeName(g.id)} count={g.rooms.length}>
            {g.rooms.map((r) => <Row key={r.id} title={r.name} facts={bedsText(r.beds)} trailing="›" onClick={() => setEdit({ ...r })} />)}
          </ListGroup>
        )) : <Empty text="No guest rooms yet. Add the first." />}
      </BottomSheet>
      <AddGuestRooms open={adding} onOpenChange={setAdding} typeId={typeId} onChanged={changed} openTypes={() => { onOpenChange(false); openTypes(); }} />
      <BottomSheet open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} title={edit ? `Guest room ${edit.name}` : ""} note={edit ? `${typeName(edit.accommodation_id)}. Beds is how many patients may share it.` : undefined}
        foot={<Foot label="Save changes" ok={!!edit?.name.trim()} busy={busy} save={save} remove={remove} removeLabel={edit ? `Remove ${edit.name}` : "Remove"} />}>
        {edit ? <div className="grid gap-3">
          <Text label="Name" autoComplete="off" maxLength={20} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Group label="Beds"><Seg<number> options={BEDS} value={edit.beds} onChange={(n) => setEdit({ ...edit, beds: n })} /></Group>
        </div> : null}
      </BottomSheet>
    </>
  );
}
