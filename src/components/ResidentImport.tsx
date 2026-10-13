import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomBar";
import { Area, Btn, ListGroup, Seg, Tag, dayText, noteText, plural } from "@/components/kit";
import { API_BASE } from "@/lib/apiBase";

/** A resident row from a spreadsheet, as the server read it (#741). An empty `problems` is ready to save. */
export type Resident = { name: string; gender: "" | "female" | "male" | "other"; arriving: string; leaving: string; phone: string; problems: string[] };

const SAY: Record<string, string> = {
  no_name: "No name",
  no_gender: "Woman or man?",
  bad_date: "Dates could not be read",
  leaving_past: "Already left",
  leaving_before_arriving: "Leaves before arriving",
  invalid: "Cannot be saved as it is",
};

/** The rows are read and judged by the server, never here, so a fixed row is sent back to be checked again. */
export async function checkResidents(text: string): Promise<Resident[]> {
  const res = await fetch(`${API_BASE}/patients/import/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) { toast.error("Those rows could not be read. Try again."); return []; }
  const { rows } = await res.json();
  return rows.map((r: Resident & { gender: Resident["gender"] | null; arriving: string | null; leaving: string | null }) => ({ ...r, gender: r.gender ?? "", arriving: r.arriving ?? "", leaving: r.leaving ?? "" }));
}

const asTable = (rows: Resident[]) => ["name\tgender\tarriving\tleaving\tphone", ...rows.map((r) => [r.name, r.gender, r.arriving, r.leaving, r.phone].join("\t"))].join("\n");

/** A CSV saved from Excel or Google Sheets. */
export function FromFile({ onText }: { onText: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void f.text().then(onText); }} />
      <Btn kind="quiet" inline className="-ml-1 mt-1" onClick={() => input.current?.click()}>Choose a CSV file</Btn>
    </>
  );
}

/** Ready rows first as they came; a row that does not fit is red and fixed where it stands. Nothing is dropped. */
export function ResidentRows({ rows, set }: { rows: Resident[]; set: Dispatch<SetStateAction<Resident[]>> }) {
  const fix = async (i: number, patch: Partial<Resident>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    set(next);
    set(await checkResidents(asTable(next)));
  };
  const wrong = rows.filter((r) => r.problems.length).length;
  return (
    <ListGroup title={wrong ? `${wrong} to fix` : "Ready"} count={rows.length}>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 border-b border-border px-3 py-2 last:border-b-0">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-row font-semibold">{r.name || "—"}</span>
            {r.problems.length ? <Tag tone="alert">{SAY[r.problems[0]] ?? r.problems[0]}</Tag> : null}
          </div>
          <span className={noteText}>{r.arriving && r.leaving ? `${dayText(r.arriving)} – ${dayText(r.leaving)}` : "No dates"}{r.phone ? ` · ${r.phone}` : ""}</span>
          {r.problems.includes("no_name") ? <input aria-label="Name" className="h-11 rounded-xl border border-input/45 bg-background px-3 text-base" defaultValue={r.name} onBlur={(e) => { if (e.target.value.trim()) void fix(i, { name: e.target.value.trim() }); }} /> : null}
          {r.problems.includes("no_gender") ? <Seg<Resident["gender"]> options={[["female", "Woman"], ["male", "Man"]]} value={r.gender} onChange={(gender) => void fix(i, { gender })} /> : null}
          {r.problems.some((p) => p === "bad_date" || p === "leaving_past" || p === "leaving_before_arriving") ? (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" aria-label={`${r.name} arriving`} className="h-11 rounded-xl border border-input/45 bg-background px-3 text-base" value={r.arriving} onChange={(e) => void fix(i, { arriving: e.target.value })} />
              <input type="date" aria-label={`${r.name} leaving`} className="h-11 rounded-xl border border-input/45 bg-background px-3 text-base" value={r.leaving} onChange={(e) => void fix(i, { leaving: e.target.value })} />
            </div>
          ) : null}
        </div>
      ))}
    </ListGroup>
  );
}

/** Residents on the Patients screen: many at once from a spreadsheet, each saved as one added by hand would be. */
export function ResidentsFromSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (created: unknown[]) => void }) {
  const [rows, setRows] = useState<Resident[]>([]);
  const [busy, setBusy] = useState(false);
  const read = async (text: string) => setRows(text.trim() ? await checkResidents(text) : []);
  const ready = rows.length > 0 && rows.every((r) => !r.problems.length);
  const save = async () => {
    setBusy(true);
    const created: unknown[] = [];
    for (const r of rows) {
      const res = await fetch(`${API_BASE}/patients`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r.name, gender: r.gender, phone: r.phone || undefined, on_site: true, stay: { start_date: r.arriving, end_date: r.leaving } }) });
      if (res.ok) created.push(await res.json());
    }
    const added = created.length;
    setBusy(false);
    if (added < rows.length) toast.error(`${added} of ${rows.length} residents added. Try the rest again.`); else toast.success(`${plural(added, "resident")} added`);
    setRows([]);
    onAdded(created);
    onClose();
  };
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) { setRows([]); onClose(); } }} title="Residents from a spreadsheet"
      note="Name, gender, arriving, leaving and phone. Copy the rows from Excel or Google Sheets and paste them, or choose a CSV."
      foot={<Btn kind="primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? "Adding…" : rows.length ? `Add ${plural(rows.length, "resident")}` : "Add residents"}</Btn>}>
      <Area label="Rows" rows={4} placeholder="Paste here" onChange={(e) => void read(e.target.value)} />
      <FromFile onText={(t) => void read(t)} />
      {rows.length ? <ResidentRows rows={rows} set={setRows} /> : null}
    </BottomSheet>
  );
}
