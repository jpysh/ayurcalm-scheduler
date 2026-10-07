/**
 * The discharge summary form (#194), the same on the resident card (admin) and
 * the doctor's private link. The server fills what the app knows; this edits
 * the rest. The admin can mark it final, which closes it to the doctor's link.
 */
import { useState } from "react";
import { Area, Dropdown, Text, noteText, Btn } from "@/components/kit";

export type Med = { name: string; dose: string; timing: string; from: string; days: string };
export type DischargeDraft = { meds_stay: Med[]; meds_home: Med[]; no: string; final: boolean; [k: string]: unknown };
export type DischargeView = {
  stay_id: string; patient_id: string; name: string; from: string; to: string; days: number; saved: boolean;
  draft: DischargeDraft; doctor: { name: string } | null;
};

const LINES: [string, string, string?][][] = [
  [["admitted_time", "Arrived at", "09:00"], ["discharged_time", "Leaves at", "11:00"], ["registration_no", "Registration no."]],
  [["address", "Address"], ["country", "Country"], ["passport", "Passport no."]],
  [["weight", "Weight"], ["bp", "BP"], ["bowel", "Bowel"], ["appetite", "Appetite"], ["sleep", "Sleep"], ["menstrual", "Menstrual cycle"], ["dosha", "Doshic dominance"], ["discharge_type", "Type of discharge"]],
  [["payment_amount", "Total payment (optional)"], ["payment_mode", "Mode"], ["payment_date", "Date of payment"]],
];
const PARAS: [string, string][] = [["condition", "Condition at discharge"], ["diagnosis", "Final diagnosis"], ["reason", "Reason for admission"], ["investigations", "Investigations"]];
const AFTER: [string, string][] = [["instructions", "Special instructions"], ["follow_up", "Follow-up"], ["urgent_when", "When to obtain urgent care"], ["urgent_how", "How to obtain urgent care"]];
const blank = (): Med => ({ name: "", dose: "", timing: "", from: "", days: "" });

/** A caption over a group of fields, the kit's group header. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section aria-label={title} className="mt-5">
    <div className="pb-1 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{title}</div>
    {children}
  </section>
);

export default function DischargeForm({ view, admin, onSave, onPdf, doctors }: {
  view: DischargeView; admin: boolean;
  /** The admin chooses who signs; from a doctor's link it is that doctor. */
  doctors?: { id: string; name: string }[];
  onSave: (body: Record<string, unknown>) => Promise<DischargeView | null>;
  onPdf: () => void;
}) {
  const [d, setD] = useState<DischargeDraft>(view.draft);
  const [busy, setBusy] = useState(false);
  const locked = !admin && view.draft.final;
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const str = (k: string) => String(d[k] ?? "");
  const one = (k: string, t: string, hint?: string) => <Text key={k} label={`${t} (optional)`} placeholder={hint} value={str(k)} disabled={locked} onChange={(e) => set(k, e.target.value)} />;

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const { no: _no, final: _final, ...rest } = d;
    const clean = (list: Med[]) => list.filter((m) => m.name.trim());
    const next = await onSave({ ...rest, meds_stay: clean(d.meds_stay), meds_home: clean(d.meds_home), ...extra });
    setBusy(false);
    if (next) setD(next.draft);
    return next;
  };

  const meds = (key: "meds_stay" | "meds_home", title: string) => (
    <Section title={title}>
      <div className="grid gap-2">
        {d[key].map((m, i) => {
          const put = (k: keyof Med, v: string) => set(key, d[key].map((x, j) => (j === i ? { ...x, [k]: v } : x)));
          return (
            <div key={i} className="rounded-xl border p-3">
              <Text label="Medicine" placeholder="Tab. Yograj Guggulu" value={m.name} disabled={locked} onChange={(e) => put("name", e.target.value)} />
              <div className="grid grid-cols-2 gap-x-3">
                <Text label="Dose (optional)" placeholder="1-X-1" value={m.dose} disabled={locked} onChange={(e) => put("dose", e.target.value)} />
                <Text label="When (optional)" placeholder="after food" value={m.timing} disabled={locked} onChange={(e) => put("timing", e.target.value)} />
                <Text label="From (optional)" type="date" value={m.from} disabled={locked} onChange={(e) => put("from", e.target.value)} />
                <Text label="Days (optional)" inputMode="numeric" placeholder="10" value={m.days} disabled={locked} onChange={(e) => put("days", e.target.value)} />
              </div>
              {locked ? null : <Btn kind="destructive" inline className="-ml-2 mt-2" onClick={() => set(key, d[key].filter((_, j) => j !== i))}>Remove {m.name || "this medicine"}</Btn>}
            </div>
          );
        })}
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            <Btn kind="secondary" onClick={() => set(key, [...d[key], blank()])}>Add a medicine</Btn>
            {key === "meds_stay" && d.meds_stay.length ? (
              <Btn kind="quiet"
                onClick={() => set("meds_home", [...d.meds_home, ...d.meds_stay.filter((m) => m.name.trim() && !d.meds_home.some((h) => h.name === m.name)).map((m) => ({ ...m, from: "", days: "" }))])}>Copy to take-home</Btn>
            ) : null}
          </div>
        )}
      </div>
    </Section>
  );

  return (
    <div>
      <p className={noteText}>{d.no ? `No. ${d.no} · ` : ""}{view.days} days{view.doctor ? ` · ${view.doctor.name}` : ""}{d.final ? " · final" : " · draft"}. Nothing here is required; what is blank prints as a line to fill in by hand.</p>
      {locked ? <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold">The centre has made this summary final. Ask them if something needs changing.</p> : null}
      {LINES.map((group, g) => (
        <Section key={g} title={["The stay", "Where from", "On leaving", "Payment"][g]}>
          <div className="grid grid-cols-2 gap-x-3">
            {group.map(([k, t, hint]) => <div key={k} className={k === "address" ? "col-span-2" : ""}>{one(k, t, hint)}</div>)}
          </div>
        </Section>
      ))}
      <Section title="Condition and diagnosis">{PARAS.map(([k, t]) => <Area key={k} label={`${t} (optional)`} rows={2} value={str(k)} disabled={locked} onChange={(e) => set(k, e.target.value)} />)}</Section>
      {meds("meds_stay", "Medication during the stay")}
      {meds("meds_home", "Medicines to take home")}
      {one("meds_home_for", "Take-home medicines for", "1 month")}
      <Section title="After they leave">{AFTER.map(([k, t]) => <Area key={k} label={`${t} (optional)`} rows={2} value={str(k)} disabled={locked} onChange={(e) => set(k, e.target.value)} />)}</Section>
      <Section title="Signed">
        {doctors?.length ? (
          <Dropdown label="Signed by" value={str("doctor_id")} disabled={locked} onChange={(e) => set("doctor_id", e.target.value || null)}>
            <option value="">No doctor</option>
            {doctors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Dropdown>
        ) : null}
        {one("signed_at", "Signed on (date and time)", "2026-10-01 11:00")}
      </Section>
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 grid gap-1 border-t bg-card px-4 pb-3 pt-3">
        {locked ? null : <Btn kind="primary" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save the summary"}</Btn>}
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="quiet" disabled={busy} onClick={async () => { if (locked || (await save())) onPdf(); }}>Print summary</Btn>
          {admin ? <Btn kind="quiet" disabled={busy} onClick={() => save({ final: !d.final })}>{d.final ? "Reopen for the doctor" : "Make final"}</Btn> : <span />}
        </div>
      </div>
    </div>
  );
}
