import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import { Empty, ListGroup, Loading, Text, Tick, noteText, Btn } from "@/components/kit";

type Item = {
  name: string; description: string; minutes: number; staff: number;
  amenities: string[]; products: string[]; gender: boolean; consultation?: boolean; once?: boolean; before?: boolean; added: boolean; common?: boolean;
  /** The library's own name: the row's identity while the admin renames it. */
  key: string;
};

/**
 * Therapies → Add from library (#219): the standard list, minus what the centre
 * already has. Tick, adjust the name or minutes on the row, add. Any time, not
 * only at setup: a centre starts small and grows its menu.
 */
export function TherapyLibrarySheet({ open, onOpenChange, onImported, onOwn }: {
  open: boolean; onOpenChange: (o: boolean) => void; onImported: () => void;
  /** The way to a therapy that is not on the list (#595): the Add therapy sheet. */
  onOwn?: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems(null); setPicked({}); setEditing(null);
    fetch(`${API_BASE}/therapy-library`).then((r) => r.json()).then((d: Item[]) => {
      const list = Array.isArray(d) ? d : [];
      setItems(list.filter((x) => !x.added).map((x) => ({ ...x, key: x.name })));
      // A centre with no therapies yet starts from what most centres offer, ticked (#1020): edit, untick, add.
      if (!list.some((x) => x.added)) setPicked(Object.fromEntries(list.filter((x) => x.common).map((x) => [x.name, true])));
    }).catch(() => setItems([]));
  }, [open]);

  // Editing a row ticks it: the admin is changing it to add it.
  const change = (key: string, patch: Partial<Item>) => {
    setItems((prev) => prev && prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    setPicked((p) => ({ ...p, [key]: true }));
  };
  const chosen = (items || []).filter((x) => picked[x.key] && x.name.trim());

  async function add() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/therapies/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen.map((x) => ({
          name: x.name.trim(), description: x.description, duration_minutes: x.minutes, staff_required: x.staff,
          required_amenities: x.amenities, products: x.products, requires_gender_match: x.gender, is_consultation: Boolean(x.consultation), once_per_course: Boolean(x.once), before_purification: Boolean(x.before),
        })) }),
      });
      if (!res.ok) { toast.error("Those therapies could not be added"); return; }
      const { created } = await res.json();
      toast.success(`${created} therap${created === 1 ? "y" : "ies"} added`);
      onImported();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add from library" note={chosen.length ? "Untick what the centre does not give; Change sets a name or the minutes." : "Tick what the centre offers; Change sets a name or the minutes."}
      foot={items && items.length ? (
        <Btn kind="primary" disabled={!chosen.length || busy} onClick={add}>
          {busy ? "Adding…" : chosen.length ? `Add ${chosen.length} therap${chosen.length === 1 ? "y" : "ies"}` : "Tick the therapies to add"}
        </Btn>
      ) : undefined}>
      {onOwn ? <Btn kind="quiet" inline className="-ml-2 mb-1" onClick={onOwn}>Not on the list? Add one of your own ›</Btn> : null}
      {items === null ? <Loading /> : items.length === 0 ? <Empty text="You already have every therapy in the library." /> : (<>
        <Btn kind="quiet" inline className="-ml-2 mb-2"
          onClick={() => setPicked(chosen.length === items.length ? {} : Object.fromEntries(items.map((x) => [x.key, true])))}>
          {chosen.length === items.length ? "Untick all" : `Tick all ${items.length}`}
        </Btn>
        {[["Most centres offer", items.filter((x) => x.common)], ["More", items.filter((x) => !x.common)]].map(([title, list]) => (list as Item[]).length ? (
          <div key={title as string} className="mb-3"><ListGroup title={title as string} count={(list as Item[]).length}>
            {(list as Item[]).map((x) => (
              <div key={x.key} className="border-b border-border px-3 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  {/* One line a row (#1020): forty rows of four lines was thirteen screens. What it is shows on Change. */}
                  <Tick on={!!picked[x.key]} set={(v) => setPicked((p) => ({ ...p, [x.key]: v }))}
                    label={<span className="grid py-1.5"><span className="font-semibold">{x.name}</span><span className={noteText}>{x.minutes} min · {x.consultation ? "doctor" : `${x.staff} therapist${x.staff === 1 ? "" : "s"}`}{x.gender ? " · same gender" : ""}</span></span>} />
                  <button type="button" aria-expanded={editing === x.key} aria-label={`Change ${x.key}`} className="min-h-11 flex-none px-1 text-sm font-semibold text-primary" onClick={() => setEditing(editing === x.key ? null : x.key)}>{editing === x.key ? "Done" : "Change"}</button>
                </div>
                {editing === x.key ? (
                  <div className="pb-3 pl-9">
                    <p className={noteText}>{x.description}{x.products.length ? ` Brings: ${x.products.join(", ")}.` : ""}</p>
                    <div className="mt-2 grid grid-cols-[1fr_7rem] gap-3">
                      <Text label="Name" value={x.name} onChange={(e) => change(x.key, { name: e.target.value })} />
                      <Text label="Minutes" type="number" inputMode="numeric" min={5} max={480} value={x.minutes} onChange={(e) => change(x.key, { minutes: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </ListGroup></div>
        ) : null)}
      </>)}
    </BottomSheet>
  );
}
