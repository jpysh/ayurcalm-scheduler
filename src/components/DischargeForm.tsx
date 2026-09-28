/**
 * The discharge summary form (#194), the same on the resident card (admin) and
 * the doctor's private link. The server fills what the app knows; this edits
 * the rest. The admin can mark it final, which closes it to the doctor's link.
 */
import { useState } from "react";

export type Med = { name: string; dose: string; timing: string; from: string; days: string };
export type DischargeDraft = { meds_stay: Med[]; meds_home: Med[]; no: string; final: boolean; [k: string]: unknown };
export type DischargeView = {
  stay_id: string; patient_id: string; name: string; from: string; to: string; days: number; saved: boolean;
  draft: DischargeDraft; doctor: { name: string } | null;
};

const LINES: [string, string, string?][][] = [
  [["admitted_time", "Arrived at", "09:00"], ["discharged_time", "Leaves at", "11:00"], ["registration_no", "Registration no."]],
  [["address", "Address"], ["country", "Country"], ["passport", "Passport no."]],
  [["weight", "Weight", "68 kg"], ["bp", "BP", "120/80"], ["bowel", "Bowel"], ["appetite", "Appetite"], ["sleep", "Sleep"], ["menstrual", "Menstrual cycle"], ["dosha", "Doshic dominance"], ["discharge_type", "Type of discharge"]],
  [["payment_amount", "Total payment (optional)"], ["payment_mode", "Mode"], ["payment_date", "Date of payment"]],
];
const PARAS: [string, string][] = [["condition", "Condition at discharge"], ["diagnosis", "Final diagnosis"], ["reason", "Reason for admission"], ["investigations", "Investigations"]];
const AFTER: [string, string][] = [["instructions", "Special instructions"], ["follow_up", "Follow-up"], ["urgent_when", "When to obtain urgent care"], ["urgent_how", "How to obtain urgent care"]];
const blank = (): Med => ({ name: "", dose: "", timing: "", from: "", days: "" });

export default function DischargeForm({ view, admin, onSave, onPdf }: {
  view: DischargeView; admin: boolean;
  onSave: (body: Record<string, unknown>) => Promise<DischargeView | null>;
  onPdf: () => void;
}) {
  const [d, setD] = useState<DischargeDraft>(view.draft);
  const [busy, setBusy] = useState(false);
  const locked = !admin && view.draft.final;
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const field = "min-h-11 w-full rounded-lg border px-2 text-[16px] text-foreground disabled:opacity-60";
  const label = "grid gap-1 text-[13px] text-muted-foreground";
  const head = "mt-3 text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground";

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
    <section aria-label={title}>
      <div className={head}>{title}</div>
      <div className="grid gap-2">
        {d[key].map((m, i) => {
          const put = (k: keyof Med, v: string) => set(key, d[key].map((x, j) => (j === i ? { ...x, [k]: v } : x)));
          return (
            <div key={i} className="grid grid-cols-2 gap-1.5 rounded-xl border p-2">
              <div className="col-span-2 flex gap-1.5">
                <input aria-label="Medicine" className={field} placeholder="Tab. Yograj Guggulu" value={m.name} disabled={locked} onChange={(e) => put("name", e.target.value)} />
                <button type="button" aria-label={`Remove ${m.name || "medicine"}`} className="min-h-11 min-w-11 rounded-lg border" disabled={locked} onClick={() => set(key, d[key].filter((_, j) => j !== i))}>✕</button>
              </div>
              {([["dose", "Dose", "1-X-1", "text"], ["timing", "When", "after food", "text"], ["from", "From", "", "date"], ["days", "Days", "10", "numeric"]] as const).map(([k, t, hint, kind]) => (
                <label key={k} className="grid gap-0.5 text-[12px] text-muted-foreground">{t}
                  <input className={field} type={kind === "date" ? "date" : "text"} inputMode={kind === "numeric" ? "numeric" : undefined} placeholder={hint} value={m[k]} disabled={locked} onChange={(e) => put(k, e.target.value)} />
                </label>
              ))}
            </div>
          );
        })}
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full border px-4 font-semibold" onClick={() => set(key, [...d[key], blank()])}>+ Add a medicine</button>
            {key === "meds_stay" && d.meds_stay.length ? (
              <button type="button" className="min-h-11 rounded-full border px-4 font-semibold"
                onClick={() => set("meds_home", [...d.meds_home, ...d.meds_stay.filter((m) => m.name.trim() && !d.meds_home.some((h) => h.name === m.name)).map((m) => ({ ...m, from: "", days: "" }))])}>Copy to take-home</button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="grid gap-2">
      <div className="text-[13px] text-muted-foreground">
        {d.no ? `No. ${d.no} · ` : ""}{view.days} days{view.doctor ? ` · ${view.doctor.name}` : ""}{d.final ? " · final" : " · draft"}
      </div>
      {locked ? <div className="rounded-xl bg-muted p-3 text-[14px]">The centre has made this summary final. Ask them if something needs changing.</div> : null}
      {LINES.map((group, g) => (
        <div key={g} className="grid grid-cols-2 gap-2">
          {group.map(([k, t, hint]) => (
            <label key={k} className={`${label} ${k === "address" ? "col-span-2" : ""}`}>{t}
              <input className={field} placeholder={hint} value={String(d[k] ?? "")} disabled={locked} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
        </div>
      ))}
      {PARAS.map(([k, t]) => (
        <label key={k} className={label}>{t}<textarea rows={2} className={`${field} py-2`} value={String(d[k] ?? "")} disabled={locked} onChange={(e) => set(k, e.target.value)} /></label>
      ))}
      {meds("meds_stay", "Medication during the stay")}
      {meds("meds_home", "Medicines to take home")}
      <label className={label}>Take-home medicines for<input className={field} placeholder="1 month" value={String(d.meds_home_for ?? "")} disabled={locked} onChange={(e) => set("meds_home_for", e.target.value)} /></label>
      {AFTER.map(([k, t]) => (
        <label key={k} className={label}>{t}<textarea rows={2} className={`${field} py-2`} value={String(d[k] ?? "")} disabled={locked} onChange={(e) => set(k, e.target.value)} /></label>
      ))}
      <label className={label}>Signed on (date and time)<input className={field} placeholder="2026-10-01 11:00" value={String(d.signed_at ?? "")} disabled={locked} onChange={(e) => set("signed_at", e.target.value)} /></label>
      <div className="sticky bottom-0 mt-2 flex flex-wrap justify-end gap-2 bg-background py-2">
        <button type="button" className="min-h-11 rounded-full border px-4 font-semibold" disabled={busy} onClick={async () => { if (locked || (await save())) onPdf(); }}>PDF</button>
        {admin ? (
          <button type="button" className="min-h-11 rounded-full border px-4 font-semibold" disabled={busy} onClick={() => save({ final: !d.final })}>{d.final ? "Reopen for the doctor" : "Make final"}</button>
        ) : null}
        {locked ? null : <button type="button" className="min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground" disabled={busy} onClick={() => save()}>Save</button>}
      </div>
    </div>
  );
}
