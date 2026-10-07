/**
 * Settings → Packages and Accommodation (#285 stories 11 and 12): the centre's own
 * reference lists that a patient's card picks from. Prices are whole rupees and
 * nothing here bills. One editor for both, so they look and behave the same.
 */
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { confirmSheet } from "@/components/ConfirmSheet";
import { BottomSheet, Empty, Foot, Group, ListGroup, Loading, Row, SectionHead, Seg, Text, noteText, rupees, Btn } from "@/components/kit";

type Item = { id: string; name: string; notes: string | null; is_active: boolean; patients: number } & Record<string, unknown>;
type Fields = { key: string; label: string; number?: boolean; optional?: boolean; hint?: string }[];

function CatalogueEditor({ path, noun, fields, facts, trailing, extra }: { path: string; noun: string; fields: Fields; facts: (i: Item) => string; trailing: (i: Item) => string; /** More of the item, below its fields, once it exists. */ extra?: (i: Item, changed: () => void) => ReactNode }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; v: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchJsonWithTimeout<Item[]>(`${API_BASE}/${path}`).then((r) => setItems(Array.isArray(r) ? r : []));
  useEffect(() => { load(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (i?: Item) => setEdit({ id: i?.id ?? null, v: Object.fromEntries(fields.map((f) => [f.key, i ? String(i[f.key] ?? "") : ""])) });
  const ok = !!edit && fields.every((f) => f.optional || edit.v[f.key].trim() !== "");
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const body = Object.fromEntries(fields.map((f) => [f.key, f.number ? Number(edit.v[f.key]) : edit.v[f.key].trim() || (f.optional ? null : "")]));
    const res = await fetch(`${API_BASE}/${path}${edit.id ? `/${edit.id}` : ""}`, { method: edit.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { toast.error(res.status === 409 ? `There is already a ${noun} with that name.` : `The ${noun} was not saved. Check the numbers and try again.`); return; }
    toast.success(`${String(body.name)} saved`);
    setEdit(null);
    load();
  };
  const remove = async () => {
    const item = items?.find((i) => i.id === edit?.id);
    if (!item) return;
    // A retired one stays readable on the stays that chose it; only an unused one is deleted for good.
    if (!item.patients && !(await confirmSheet(`Remove ${item.name} from the list?`, "Remove"))) return;
    const res = await fetch(`${API_BASE}/${path}/${item.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("It was not removed. Try again."); return; }
    toast.success(item.patients ? `${item.name} retired: it is no longer offered, and ${item.patients} stay${item.patients === 1 ? " keeps" : "s keep"} it` : `${item.name} removed`);
    setEdit(null);
    load();
  };
  return (
    <div>
      {items === null ? <Loading rows={3} /> : items.length ? (
        <ListGroup>{items.map((i) => <Row key={i.id} title={i.name} facts={[facts(i), i.notes].filter(Boolean).join(" · ")} trailing={i.is_active ? trailing(i) : "Retired"} onClick={() => open(i)} />)}</ListGroup>
      ) : <Empty text={`No ${noun}s yet.`} />}
      <Btn kind="quiet" inline className="-ml-2 mt-2" onClick={() => open()}>Add {/^[aeiou]/.test(noun) ? "an" : "a"} {noun}</Btn>
      <p className={`mt-1 ${noteText}`}>For reference only: nothing here sends an invoice or takes a payment.</p>
      <BottomSheet open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} title={edit?.id ? `Edit ${noun}` : `New ${noun}`}
        foot={<Foot label={edit?.id ? "Save changes" : `Add the ${noun}`} ok={ok} busy={busy} save={save} remove={edit?.id ? remove : undefined} />}>
        {edit ? fields.map((f) => (
          <Text key={f.key} label={`${f.label}${f.optional ? " (optional)" : ""}`} note={f.hint} autoComplete="off" type={f.number ? "number" : "text"} inputMode={f.number ? "numeric" : undefined} min={f.number ? 0 : undefined}
            value={edit.v[f.key]} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, [f.key]: e.target.value } })} />
        )) : null}
        {edit?.id && extra ? extra(items!.find((i) => i.id === edit.id)!, load) : null}
      </BottomSheet>
    </div>
  );
}

export const PackagesEditor = () => (
  <CatalogueEditor path="packages" noun="package"
    fields={[{ key: "name", label: "Name" }, { key: "days", label: "Days", number: true }, { key: "price", label: "Price in rupees", number: true, hint: "One figure, with the registration charge included." }, { key: "notes", label: "Notes", optional: true }]}
    facts={(i) => `${i.days} days`} trailing={(i) => rupees(Number(i.price))} />
);

export const AccommodationEditor = () => (
  <CatalogueEditor path="accommodations" noun="accommodation type"
    fields={[{ key: "name", label: "Name" }, { key: "price_per_day", label: "Price a day in rupees", number: true, hint: "The total is this times the nights. No extra charges." }, { key: "notes", label: "Notes", optional: true }]}
    facts={(i) => [`${rupees(Number(i.price_per_day))} a day`, i.rooms ? `${i.rooms} guest room${i.rooms === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")} trailing={() => ""}
    extra={(i, changed) => <GuestRoomsOf type={i} changed={changed} />} />
);

type GuestRoom = { id: string; name: string; accommodation_id: string; beds: number; is_active: boolean; patients: number };
const BEDS: [number, string][] = [[1, "1"], [2, "2"], [3, "3"], [4, "4"]];
const bedsText = (n: number) => `${n} bed${n === 1 ? "" : "s"}`;

/** A type's guest rooms (#456): the rooms patients sleep in. "T1–T6" adds six at once. */
function GuestRoomsOf({ type, changed }: { type: Item; changed: () => void }) {
  const [rooms, setRooms] = useState<GuestRoom[] | null>(null);
  const [add, setAdd] = useState("");
  const [beds, setBeds] = useState(1);
  const [edit, setEdit] = useState<GuestRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchJsonWithTimeout<GuestRoom[]>(`${API_BASE}/guest-rooms`).then((r) => setRooms(Array.isArray(r) ? r.filter((g) => g.accommodation_id === type.id) : []));
  useEffect(() => { load(); }, [type.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    const res = await fetch(`${API_BASE}/guest-rooms${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error ? `${out.error}.` : "The guest room was not saved. Try again."); return null; }
    load(); changed();
    return out;
  };
  const addRooms = async () => {
    const out = await send("POST", "", { name: add.trim(), accommodation_id: type.id, beds });
    if (!out) return;
    toast.success(out.added.length === 1 ? `${out.added[0]} added` : `${out.added.length} guest rooms added: ${out.added[0]} to ${out.added[out.added.length - 1]}`);
    setAdd("");
  };
  const saveRoom = async () => {
    if (!edit) return;
    if (await send("PUT", `/${edit.id}`, { name: edit.name.trim(), beds: edit.beds, is_active: true })) { toast.success(`${edit.name.trim()} saved`); setEdit(null); }
  };
  const removeRoom = async () => {
    if (!edit) return;
    const out = await send("DELETE", `/${edit.id}`);
    if (out) { toast.success(out.retired ? `${edit.name} retired: it is no longer offered, and its past stays keep it` : `${edit.name} removed`); setEdit(null); }
  };
  const live = rooms?.filter((r) => r.is_active) ?? [];
  return (
    <>
      <SectionHead>Guest rooms</SectionHead>
      {rooms === null ? <Loading rows={2} /> : live.length ? (
        <ListGroup>{live.map((r) => <Row key={r.id} title={r.name} facts={bedsText(r.beds)} trailing="›" onClick={() => setEdit({ ...r })} />)}</ListGroup>
      ) : <p className={noteText}>No guest rooms yet. Without them, stays record the type only.</p>}
      <div className="mt-3 grid gap-3">
        <Text label="Add guest rooms" note="One name, or a range: T1–T6 adds six." placeholder="T1–T6" autoComplete="off" maxLength={80} value={add} onChange={(e) => setAdd(e.target.value)} />
        <Group label="Beds in each"><Seg<number> options={BEDS} value={beds} onChange={setBeds} /></Group>
        <Btn disabled={busy || !add.trim()} onClick={addRooms}>{busy ? "Saving…" : "Add guest rooms"}</Btn>
      </div>
      <BottomSheet open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} title={edit ? `Guest room ${edit.name}` : ""} note={`${String(type.name)}. Beds is how many patients may share it.`}
        foot={<Foot label="Save changes" ok={!!edit?.name.trim()} busy={busy} save={saveRoom} remove={removeRoom} removeLabel={edit ? `Remove ${edit.name}` : "Remove"} />}>
        {edit ? <div className="grid gap-3">
          <Text label="Name" autoComplete="off" maxLength={20} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Group label="Beds"><Seg<number> options={BEDS} value={edit.beds} onChange={(n) => setEdit({ ...edit, beds: n })} /></Group>
        </div> : null}
      </BottomSheet>
    </>
  );
}
