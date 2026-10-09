/**
 * Settings → Packages and Accommodation (#285 stories 11 and 12): the centre's own
 * reference lists that a patient's card picks from. Prices are whole numbers in the centre's currency and
 * nothing here bills. One editor for both, so they look and behave the same.
 */
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import { confirmSheet } from "@/components/ConfirmSheet";
import { BottomSheet, Empty, Foot, ListGroup, LinkRow, Loading, Row, SectionHead, Text, noteText, money, Btn } from "@/components/kit";
import { ManageGuestRooms } from "@/components/GuestRoomManage";

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
    fields={[{ key: "name", label: "Name" }, { key: "days", label: "Days", number: true }, { key: "price", label: "Price", number: true, hint: "One figure, with the registration charge included." }, { key: "notes", label: "Notes", optional: true }]}
    facts={(i) => `${i.days} days`} trailing={(i) => money(Number(i.price))} />
);

export const AccommodationEditor = ({ openTypes = () => {} }: { openTypes?: () => void }) => (
  <CatalogueEditor path="accommodations" noun="accommodation type"
    fields={[{ key: "name", label: "Name" }, { key: "price_per_day", label: "Price a day", number: true, hint: "The total is this times the nights. No extra charges." }, { key: "notes", label: "Notes", optional: true }]}
    facts={(i) => [`${money(Number(i.price_per_day))} a day`, i.rooms ? `${i.rooms} guest room${i.rooms === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")} trailing={() => ""}
    extra={(i, changed) => <GuestRoomsOf type={i} changed={changed} openTypes={openTypes} />} />
);

/** A type's guest rooms (#456, #559): one line opening the same sheet the Guest rooms screen uses, kept to this type. */
function GuestRoomsOf({ type, changed, openTypes }: { type: Item; changed: () => void; openTypes: () => void }) {
  const [open, setOpen] = useState(false);
  const n = Number(type.rooms ?? 0);
  return (
    <>
      <SectionHead>Guest rooms</SectionHead>
      <ListGroup><LinkRow label="Guest rooms" value={n ? `${n} · names and beds` : "None yet · add some"} onClick={() => setOpen(true)} /></ListGroup>
      <ManageGuestRooms open={open} onOpenChange={setOpen} typeId={type.id} onChanged={changed} openTypes={openTypes} />
    </>
  );
}
