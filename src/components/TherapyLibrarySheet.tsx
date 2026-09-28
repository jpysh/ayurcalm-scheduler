import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet } from "@/components/BottomBar";

type Item = {
  name: string; description: string; minutes: number; staff: number;
  amenities: string[]; products: string[]; gender: boolean; consultation?: boolean; added: boolean;
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
          required_amenities: x.amenities, products: x.products, requires_gender_match: x.gender, is_consultation: Boolean(x.consultation),
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

  const input = "min-h-11 rounded-lg border px-2 text-[16px]";
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add from library">
      <div className="max-h-[62dvh] overflow-y-auto">
        {items === null ? <div className="py-6 text-center text-muted-foreground">…</div>
          : items.length === 0 ? <div className="py-6 text-center text-muted-foreground">You already have every therapy in the library.</div>
          : (
            <>
              <button type="button" className="mb-2 min-h-10 text-sm font-semibold text-primary"
                onClick={() => setPicked(chosen.length === items.length ? {} : Object.fromEntries(items.map((x) => [x.key, true])))}>
                {chosen.length === items.length ? "Untick all" : `Tick all ${items.length}`}
              </button>
              <div className="overflow-hidden rounded-xl border">
                {items.map((x) => (
                  <div key={x.key} className="border-b border-border px-3 py-2.5 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" aria-label={`Add ${x.key}`} className="mt-1 h-5 w-5 flex-none accent-primary"
                        checked={!!picked[x.key]} onChange={(e) => setPicked((p) => ({ ...p, [x.key]: e.target.checked }))} />
                      <button type="button" className="flex-1 text-left" onClick={() => setEditing(editing === x.key ? null : x.key)}>
                        <div className="text-[16px] font-semibold">{x.name}</div>
                        <div className="text-[13px] text-muted-foreground">
                          {x.minutes} min · {x.consultation ? "doctor" : `${x.staff} therapist${x.staff === 1 ? "" : "s"}`}{x.gender ? " · same gender" : ""}
                        </div>
                        <div className="text-[13px] text-muted-foreground">{x.description}</div>
                        {x.products.length ? <div className="text-[13px] text-muted-foreground">Brings: {x.products.join(", ")}</div> : null}
                      </button>
                      <span className="text-sm text-muted-foreground">{editing === x.key ? "Done" : "Edit"}</span>
                    </div>
                    {editing === x.key ? (
                      <div className="mt-2 grid grid-cols-[1fr_6rem] gap-2 pl-8">
                        <input aria-label="Name" className={input} value={x.name} onChange={(e) => change(x.key, { name: e.target.value })} />
                        <input aria-label="Minutes" className={input} type="number" inputMode="numeric" min={5} max={480} value={x.minutes}
                          onChange={(e) => change(x.key, { minutes: Number(e.target.value) || 0 })} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
      </div>
      <button type="button" disabled={!chosen.length || busy} onClick={add}
        className="mt-3 min-h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">
        {chosen.length ? `Add ${chosen.length} therap${chosen.length === 1 ? "y" : "ies"}` : "Tick the therapies to add"}
      </button>
    </BottomSheet>
  );
}
