import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";
import { Empty, ListGroup, Loading, Text, noteText, Btn } from "@/components/kit";

type Item = {
  name: string; description: string; minutes: number; staff: number;
  amenities: string[]; products: string[]; gender: boolean; consultation?: boolean; once?: boolean; added: boolean;
  /** The library's own name: the row's identity while the admin renames it. */
  key: string;
};

/**
 * Therapies → Add from library (#219): the standard list, minus what the centre
 * already has. Tick, adjust the name or minutes on the row, add. Any time, not
 * only at setup: a centre starts small and grows its menu.
 */
export function TherapyLibrarySheet({ open, onOpenChange, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; onImported: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems(null); setPicked({}); setEditing(null);
    fetch(`${API_BASE}/therapy-library`).then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d.filter((x: Item) => !x.added).map((x: Item) => ({ ...x, key: x.name })) : [])).catch(() => setItems([]));
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
          required_amenities: x.amenities, products: x.products, requires_gender_match: x.gender, is_consultation: Boolean(x.consultation), once_per_course: Boolean(x.once),
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
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add from library" note="Tick what the centre offers. Tap a therapy to change its name or minutes first."
      foot={items && items.length ? (
        <Btn kind="primary" disabled={!chosen.length || busy} onClick={add}>
          {busy ? "Adding…" : chosen.length ? `Add ${chosen.length} therap${chosen.length === 1 ? "y" : "ies"}` : "Tick the therapies to add"}
        </Btn>
      ) : undefined}>
      {items === null ? <Loading /> : items.length === 0 ? <Empty text="You already have every therapy in the library." /> : (<>
        <Btn kind="quiet" inline className="-ml-2 mb-2"
          onClick={() => setPicked(chosen.length === items.length ? {} : Object.fromEntries(items.map((x) => [x.key, true])))}>
          {chosen.length === items.length ? "Untick all" : `Tick all ${items.length}`}
        </Btn>
        <ListGroup>
          {items.map((x) => (
            <div key={x.key} className="border-b border-border px-3 py-1 last:border-b-0">
              <div className="flex items-start gap-1">
                <input type="checkbox" aria-label={`Add ${x.key}`} className="mt-3.5 h-6 min-h-0 w-6 min-w-0 flex-none accent-[hsl(var(--primary))]"
                  checked={!!picked[x.key]} onChange={(e) => setPicked((p) => ({ ...p, [x.key]: e.target.checked }))} />
                <button type="button" aria-expanded={editing === x.key} className="min-h-12 min-w-0 flex-1 py-2 pl-2 text-left" onClick={() => setEditing(editing === x.key ? null : x.key)}>
                  <span className="block text-base font-semibold">{x.name}</span>
                  <span className={`block ${noteText}`}>{x.minutes} min · {x.consultation ? "doctor" : `${x.staff} therapist${x.staff === 1 ? "" : "s"}`}{x.gender ? " · same gender" : ""}</span>
                  <span className={`block ${noteText}`}>{x.description}</span>
                  {x.products.length ? <span className={`block ${noteText}`}>Brings: {x.products.join(", ")}</span> : null}
                </button>
              </div>
              {editing === x.key ? (
                <div className="grid grid-cols-[1fr_7rem] gap-3 pb-2 pl-9">
                  <Text label="Name" value={x.name} onChange={(e) => change(x.key, { name: e.target.value })} />
                  <Text label="Minutes" type="number" inputMode="numeric" min={5} max={480} value={x.minutes} onChange={(e) => change(x.key, { minutes: Number(e.target.value) || 0 })} />
                </div>
              ) : null}
            </div>
          ))}
        </ListGroup>
      </>)}
    </BottomSheet>
  );
}
