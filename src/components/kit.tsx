import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

/**
 * The form kit (#283): every form is built from these parts, so a field has one
 * height, one radius, one label size and one focus ring (the global one). Taken
 * from the room, therapist and therapy sheets, which are the reference look.
 */

// The boundary is dark enough to read as a box to type in; focus is a soft halo on the box itself.
export const field = `h-11 w-full rounded-xl border border-[hsl(var(--input)/0.45)] bg-background px-3.5 text-base tabular-nums transition-shadow placeholder:text-muted-foreground/70 focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] focus-visible:outline-none disabled:opacity-60`;
const chevron = <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none h-4 w-4 flex-none text-muted-foreground"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const lbl = "mt-3 mb-1 block text-[13px] font-semibold text-muted-foreground";
export const noteText = "text-[13px] text-muted-foreground";
const chip = "min-h-10 rounded-full border border-[hsl(var(--input)/0.45)] px-3.5 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";
export const wide = "min-h-11 w-full rounded-full font-semibold";
// Seeded names are stored as massage_table; the admin reads "massage table".
export const say = (s: string) => s.replace(/_/g, " ");

/** The line under a sheet's title that says what the sheet is for. */
export const SheetNote = ({ children }: { children: ReactNode }) => <p className={`-mt-2 ${noteText}`}>{children}</p>;

/** A label over one control. */
export const Field = ({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) => (
  <label className="block min-w-0">
    <span className={lbl}>{label}</span>
    {note ? <span className={`-mt-1 mb-2 block font-normal ${noteText}`}>{note}</span> : null}
    {children}
  </label>
);

/** A label over a set of buttons: a <label> would press the first one when its text is tapped. */
export const Group = ({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) => (
  <div role="group" aria-label={label}>
    <span className={lbl}>{label}</span>
    {note ? <p className={`-mt-1 mb-2 ${noteText}`}>{note}</p> : null}
    {children}
  </div>
);

export const Text = ({ label, note, className = "", ...rest }: { label: string; note?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} note={note}><input className={`${field} ${className}`} {...rest} /></Field>
);

/** The phone's own list: one tap opens it, one picks. `required` with nothing chosen reads as a prompt, in grey. */
export const Dropdown = ({ label, note, children, ...rest }: { label: string; note?: ReactNode; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) => (
  <Field label={label} note={note}>
    <span className="relative block">
      <select className={`${field} appearance-none pr-10 ${rest.value === "" && rest.required ? "text-muted-foreground" : ""}`} {...rest}>{children}</select>
      <span className="absolute inset-y-0 right-3.5 flex items-center">{chevron}</span>
    </span>
  </Field>
);

/** "Wed 30 Sept", the stored calendar day read as itself, never through a clock (#189). Linux adds a comma. */
export const dayText = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/**
 * A date as a row reading "Wed 30 Sept ›" that opens the phone's own calendar.
 * The date box is there, unseen, over the whole row: a tap lands on it, which
 * is the one way every phone opens its calendar.
 */
export function DateRow({ label, value, onChange, min }: { label: string; value: string; onChange: (iso: string) => void; min?: string }) {
  return (
    <div className="min-w-0">
      <span className={lbl} aria-hidden>{label}</span>
      <div className={`${field} relative flex items-center justify-between gap-2 focus-within:border-primary focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]`}>
        <span className="truncate">{value ? dayText(value) : "Choose"}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 flex-none text-muted-foreground"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <input type="date" aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none" value={value.slice(0, 10)} min={min}
          // A desktop opens its calendar only from the box's small icon.
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* already open */ } }}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }} />
      </div>
    </div>
  );
}

/** Every "HH:MM" from one time to another, a step apart. */
export const timesBetween = (from: string, to: string, step: number) => {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out: string[] = [];
  for (let m = min(from); m <= min(to); m += step > 0 ? step : 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
};

/** A time picked from a list, 24-hour: no clock face and no AM/PM. A stored time off the list stays in it. */
export const TimeList = ({ label, value, onChange, times, after }: { label: string; value: string; onChange: (t: string) => void; times: string[]; /** Only later times than this are offered. */ after?: string }) => (
  <Dropdown label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    {[...new Set([...times.filter((t) => !after || t > after), value])].filter(Boolean).sort().map((t) => <option key={t}>{t}</option>)}
  </Dropdown>
);

/** A yes/no choice. */
export const Switch = ({ label, note, on, set }: { label: string; note?: ReactNode; on: boolean; set: (v: boolean) => void }) => (
  <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-base">
    <span className="min-w-0">{label}{note ? <span className={`mt-0.5 block ${noteText}`}>{note}</span> : null}</span>
    <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
  </label>
);

/** One of several things to tick in a list. */
export const Tick = ({ label, on, set }: { label: ReactNode; on: boolean; set: (v: boolean) => void }) => (
  <label className="flex min-h-11 items-center gap-3 text-base">
    <input type="checkbox" className="h-6 min-h-0 w-6 min-w-0 flex-none accent-[hsl(var(--primary))]" checked={on} onChange={(e) => set(e.target.checked)} />
    <span>{label}</span>
  </label>
);

/** One of a few, all in view. */
export function Seg<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-secondary p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className="min-h-9 min-w-0 rounded-lg text-[15px] font-medium text-foreground/75 transition-colors aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-[0_1px_3px_rgb(0_0_0/0.18)]">{l}</button>
      ))}
    </div>
  );
}

/** Any of many. */
export function Chips({ options, value, onChange, addLabel }: { options: string[]; value: string[]; onChange: (v: string[]) => void; addLabel?: string }) {
  const [draft, setDraft] = useState("");
  const all = [...new Set([...options, ...value])].sort((a, b) => a.localeCompare(b));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => <button key={o} type="button" className={chip} aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{say(o)}</button>)}
      {addLabel ? (
        <input className="h-10 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm" placeholder={addLabel} aria-label={addLabel} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); onChange([...new Set([...value, draft.trim()])]); setDraft(""); } }}
          onBlur={() => { if (draft.trim()) { onChange([...new Set([...value, draft.trim()])]); setDraft(""); } }} />
      ) : null}
    </div>
  );
}

export const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
/** The week as seven round buttons, two letters each: a full "Wed" does not fit a thumb-sized button on a phone. */
export const Days = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
  <div className="grid grid-cols-7 justify-items-center gap-1.5">
    {WEEK.map((d) => (
      <button key={d} type="button" aria-label={d[0].toUpperCase() + d.slice(1)} aria-pressed={value.includes(d)} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])}
        className="aspect-square min-h-0 w-full min-w-0 max-w-11 rounded-full border border-[hsl(var(--input)/0.45)] text-sm font-semibold capitalize text-foreground/75 transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">{d.slice(0, 2)}</button>
    ))}
  </div>
);

/**
 * The sheet's foot: one main button, always in view however long the sheet, and
 * for an existing entry a quiet Remove under it.
 */
export function Foot({ busy, save, label = "Save", remove, ok = true }: { busy?: boolean; save: () => void; label?: string; remove?: () => void; ok?: boolean }) {
  return (
    <div className="sticky bottom-[calc(-1rem-env(safe-area-inset-bottom))] z-10 -mx-4 -mb-[calc(1rem+env(safe-area-inset-bottom))] mt-4 grid gap-1 bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <button type="button" className={`${wide} bg-primary text-primary-foreground disabled:opacity-50`} disabled={busy || !ok} onClick={save}>{busy ? "Saving…" : label}</button>
      {remove ? <button type="button" className={`${wide} text-sm text-destructive`} onClick={remove}>Remove</button> : null}
    </div>
  );
}
