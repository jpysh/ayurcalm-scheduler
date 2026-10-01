import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

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

/** `valid` puts the green check at the end of the box: the field is right, nothing more to do here. */
export const Text = ({ label, note, valid, className = "", ...rest }: { label: string; note?: ReactNode; valid?: boolean } & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} note={note}>
    <span className="relative block">
      <input className={`${field} ${valid ? "pr-10" : ""} ${className}`} {...rest} />
      {valid ? <span aria-hidden className="absolute inset-y-0 right-3.5 flex items-center font-bold text-primary">✓</span> : null}
    </span>
  </Field>
);

/** A few lines of free text, in the same box as Text. */
export const Area = ({ label, note, rows = 3, className = "", ...rest }: { label: string; note?: ReactNode; rows?: number } & TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <Field label={label} note={note}>
    <textarea rows={rows} className={`${field} h-auto py-2.5 leading-snug ${className}`} {...rest} />
  </Field>
);

/** "More details (optional)": what is not needed yet stays folded, one tap away. */
export function More({ label = "More details", hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed px-3 text-left">
        <span className="font-semibold">{label}</span>
        <span className={`flex min-w-0 items-center gap-1 ${noteText}`}><span className="truncate">{hint}</span><span aria-hidden>{open ? "⌄" : "›"}</span></span>
      </button>
      {open ? <div className="pt-1">{children}</div> : null}
    </div>
  );
}

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
export function DateRow({ label, value, onChange, min, max }: { label: string; value: string; onChange: (iso: string) => void; min?: string; max?: string }) {
  return (
    <div className="min-w-0">
      <span className={lbl} aria-hidden>{label}</span>
      <div className={`${field} relative flex items-center justify-between gap-2 focus-within:border-primary focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]`}>
        <span className="truncate">{value ? dayText(value) : "Choose"}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 flex-none text-muted-foreground"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <input type="date" aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none" value={value.slice(0, 10)} min={min} max={max}
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
export function Foot({ busy, save, label = "Save", remove, removeLabel = "Remove", ok = true }: { busy?: boolean; save: () => void; label?: string; remove?: () => void; removeLabel?: string; ok?: boolean }) {
  return (
    <div className="sticky bottom-[calc(-1rem-env(safe-area-inset-bottom))] z-10 -mx-4 -mb-[calc(1rem+env(safe-area-inset-bottom))] mt-4 grid gap-1 bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <button type="button" className={`${wide} bg-primary text-primary-foreground disabled:opacity-50`} disabled={busy || !ok} onClick={save}>{busy ? "Saving…" : label}</button>
      {remove ? <button type="button" className={`${wide} text-sm text-destructive`} onClick={remove}>{removeLabel}</button> : null}
    </div>
  );
}

/* ---- Navigation and feedback (#285, DESIGN.md §7). Colours, radii and the one shadow come from the tokens in index.css. ---- */

/**
 * A sheet: grab handle, title, one line saying what it is for, body, and a foot
 * that stays in view however long the body. Scrolls inside itself.
 */
export function BottomSheet({ open, onOpenChange, title, note, children, foot }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; note?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" hideClose className="mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-t-sheet bg-card p-0 outline-none"
        // The sheet takes the focus, not its first field: that raised the phone's keyboard over half the form before it had been read.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <div className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-border" />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {/* A sheet with no title in the design still names itself to a screen reader. */}
          <SheetTitle className={title ? "mb-3 text-lg font-bold" : "sr-only"}>{title || "Menu"}</SheetTitle>
          {note ? <p className={`-mt-2 mb-3 ${noteText}`}>{note}</p> : null}
          {children}
        </div>
        {foot ? <div className="flex-none border-t bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{foot}</div> : <div className="h-[env(safe-area-inset-bottom)] flex-none" />}
      </SheetContent>
    </Sheet>
  );
}

/** The bar: two floating pieces, left and right, nothing white between them. Gives way to any open sheet (index.css). */
export const Bar = ({ left, right, label = "Main", grow }: { left: ReactNode; right?: ReactNode; label?: string; /** The left piece fills the space (the day, with its date); otherwise it hugs its buttons. */ grow?: boolean }) => (
  <nav aria-label={label} data-kit="bar" className="pointer-events-none fixed inset-x-[var(--bar-gap)] bottom-[calc(var(--bar-gap)+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center justify-between gap-2">
    <div className={`pointer-events-auto flex h-[var(--bar-h)] min-w-0 items-center gap-1 rounded-full border bg-card/[0.97] p-1 shadow-float ${grow ? "flex-1" : "flex-none"}`}>{left}</div>
    {right ? <div className="pointer-events-auto flex flex-none items-center gap-2">{right}</div> : null}
  </nav>
);

/** A round button in the bar, 48 across. */
export const BarButton = ({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-12 w-12 flex-none place-items-center rounded-full active:bg-secondary disabled:opacity-50">{children}</button>
);

/** Print, in its own small capsule beside the +. */
export const BarCapsule = ({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-[var(--bar-h)] w-[var(--bar-h)] place-items-center rounded-full border bg-card/[0.97] shadow-float active:bg-secondary disabled:opacity-50">{children}</button>
);

/** The adaptive +: always a plus, its name says what it adds ("New patient"). */
export const PlusButton = ({ adds, onClick }: { adds: string; onClick: () => void }) => (
  <button type="button" aria-label={adds} onClick={onClick} className="grid h-[var(--bar-h)] w-[var(--bar-h)] place-items-center rounded-full bg-primary text-primary-foreground shadow-float active:bg-[hsl(var(--primary-hover))]"><Plus className="h-6 w-6" /></button>
);

/** Search takes the bar's place: its field sits at the bottom, above the keyboard. */
export const BottomSearch = ({ value, onChange, onClose, placeholder, label }: { value: string; onChange: (v: string) => void; onClose: () => void; placeholder: string; label: string }) => (
  <nav aria-label="Search" data-kit="bar" className="fixed inset-x-[var(--bar-gap)] bottom-[calc(var(--bar-gap)+env(safe-area-inset-bottom))] z-40 mx-auto grid h-[var(--bar-h)] max-w-xl grid-cols-[auto_1fr_auto] items-center rounded-full border bg-card p-1 shadow-float">
    <SearchIcon className="ml-3 h-5 w-5 text-muted-foreground" />
    <input autoFocus type="text" enterKeyHint="search" placeholder={placeholder} aria-label={label} autoComplete="off" className="h-12 min-w-0 bg-transparent px-2 text-base outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" className="min-h-12 rounded-full px-3.5 font-semibold text-primary" onClick={onClose}>Cancel</button>
  </nav>
);

/** The pill above the bar. Red-dotted while something needs the admin; grey when it only informs. */
export const Pill = ({ need, info, onClick }: { need: number; info: number; onClick: () => void }) => {
  if (!need && !info) return null;
  return (
    <button type="button" data-kit="pill" onClick={onClick}
      className="fixed bottom-[calc(var(--bar-h)+var(--bar-gap)*2+env(safe-area-inset-bottom))] left-1/2 z-40 flex min-h-10 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border bg-card px-3.5 text-sm font-semibold shadow-float after:-ml-0.5 after:text-lg after:text-muted-foreground after:content-['›']">
      <i className={`h-2 w-2 rounded-full ${need ? "bg-destructive" : "bg-muted-foreground/60"}`} />
      {need ? `${need} need you` : `${info} to know`}
    </button>
  );
};

/** One row: title, up to two facts, one trailing fact, and a flag line only when something needs doing. */
export const Row = ({ title, facts, trailing, flag, onClick }: { title: ReactNode; facts?: ReactNode; trailing?: ReactNode; flag?: ReactNode; onClick?: () => void }) => {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{title}</span>
        {facts ? <span className="block truncate text-[13px] text-muted-foreground">{facts}</span> : null}
        {flag ? <span className="block text-[13px] font-semibold text-destructive">{flag}</span> : null}
      </span>
      {trailing ? <span className="flex-none text-[13px] text-muted-foreground">{trailing}</span> : null}
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0";
  return onClick ? <button type="button" className={cls} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
};

/** White, radius 12, hairlines, a caption header with a count. */
export const ListGroup = ({ title, count, children }: { title?: string; count?: number; children: ReactNode }) => (
  <section>
    {title ? <div className="flex justify-between px-1 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{title}{count !== undefined ? <span className="font-normal normal-case tracking-normal">{count}</span> : null}</div> : null}
    <div className="overflow-hidden rounded-xl bg-card">{children}</div>
  </section>
);

/** The inbox behind the pill: sections, each a list of rows; empty sections do not show. */
export function InboxSheet({ open, onOpenChange, title, sections, empty = "Nothing needs you.", children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; sections: { name: string; /** What needs action; information rows are not counted. */ count: number; body: ReactNode }[]; empty?: string; children?: ReactNode }) {
  const shown = sections.filter((x) => x.body);
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      {children}
      {shown.length ? shown.map((x) => <div key={x.name}><div className="pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{x.name}{x.count > 0 ? ` · ${x.count}` : ""}</div>{x.body}</div>) : <Empty text={empty} />}
    </BottomSheet>
  );
}

/** Under a field that changes other things: one live line saying what will change. */
export const Consequence = ({ children }: { children: ReactNode }) => <p role="status" className="mt-2 rounded-xl bg-secondary px-3 py-2 text-[13px] font-semibold text-primary">{children}</p>;

/** "Discharge summary · 5 of 8 ready", with a slim line. Informs, never blocks. */
export const ChecklistBar = ({ label, done, total, onClick }: { label: string; done: number; total: number; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="block w-full rounded-xl border bg-card px-3 py-2.5 text-left">
    <span className="flex justify-between text-sm font-semibold"><span>{label}</span><span className="text-muted-foreground">{done} of {total} ready</span></span>
    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
  </button>
);

/** Dated changes in order; each starts where the last ended. */
export const Timeline = ({ items }: { items: { key: string; from: string; title: string; note?: string; onClick?: () => void }[] }) => (
  <ol className="border-l-2 border-primary/30 pl-3">
    {items.map((i) => (
      <li key={i.key} className="py-1.5">
        <button type="button" disabled={!i.onClick} onClick={i.onClick} className="block min-h-10 w-full text-left">
          <span className="block text-[13px] font-semibold text-muted-foreground">From {i.from}</span>
          <span className="block text-base font-semibold">{i.title}</span>
          {i.note ? <span className={`block ${noteText}`}>{i.note}</span> : null}
        </button>
      </li>
    ))}
  </ol>
);

/** A list of options: name, one line, a trailing fact; the chosen one has a border and a check. Edit opens the catalogue. */
export function Picker<T extends string>({ options, value, onChange, onEdit }: { options: { id: T; name: string; note?: string; fact?: string }[]; value: T | ""; onChange: (id: T) => void; onEdit?: () => void }) {
  // Opened with one already chosen (or ready), it is in view rather than somewhere down the list.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" }); }, []);
  return (
    <div ref={box} className="grid gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className="flex min-h-14 items-center gap-3 rounded-xl border-[1.5px] border-border px-3 py-2 text-left aria-pressed:border-primary aria-pressed:bg-secondary">
          <span className="min-w-0 flex-1"><b className="block text-base">{o.name}</b>{o.note ? <span className={`block truncate ${noteText}`}>{o.note}</span> : null}</span>
          {o.fact ? <span className="flex-none text-[13px] text-muted-foreground">{o.fact}</span> : null}
          {value === o.id ? <span aria-hidden className="flex-none font-bold text-primary">✓</span> : null}
        </button>
      ))}
      {onEdit ? <button type="button" className="min-h-11 text-sm font-semibold text-primary" onClick={onEdit}>Edit the list</button> : null}
    </div>
  );
}

/** The main action, and beneath it one quiet alternative. Never two fills. */
export const TwoFoot = ({ main, onMain, alt, onAlt, busy, ok = true }: { main: string; onMain: () => void; alt: string; onAlt: () => void; busy?: boolean; ok?: boolean }) => (
  <div className="grid gap-1">
    <button type="button" className={`${wide} bg-primary text-primary-foreground disabled:opacity-50`} disabled={busy || !ok} onClick={onMain}>{busy ? "Saving…" : main}</button>
    <button type="button" className={`${wide} text-sm font-semibold text-primary`} disabled={busy} onClick={onAlt}>{alt}</button>
  </div>
);

/** Done, with a way back: one line, one Undo, five seconds. */
export const toastUndo = (text: string, undo: () => void | Promise<void>) => toast(text, { duration: 5000, action: { label: "Undo", onClick: () => { void undo(); } } });

/** Empty: one line saying why, and the action if there is one. */
export const Empty = ({ text, action }: { text: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[15px] text-muted-foreground"><span>{text}</span>{action}</div>
);

/** Loading: rows the height of real ones, and nothing at all for the first 300ms. */
export function Loading({ rows = 4 }: { rows?: number }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 300); return () => clearTimeout(t); }, []);
  if (!late) return null;
  return <div aria-busy="true" aria-label="Loading" className="overflow-hidden rounded-xl bg-card">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-secondary/40 last:border-b-0" />)}</div>;
}

/** Error: where it happened, what failed, a retry. */
export const ErrorLine = ({ text, retry }: { text: string; retry?: () => void }) => (
  <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><span>{text}</span>{retry ? <button type="button" className="min-h-10 flex-none font-semibold" onClick={retry}>Try again</button> : null}</div>
);

/**
 * Booking on one sheet (story 5). "Who" first: at most five suggestions, and the
 * search field (`SearchField`, in the sheet's foot, at the bottom above the keyboard)
 * filters everyone. Choosing one fills the rest in place.
 */
export function WhoPicker<T extends { id: string; name: string; note?: string }>({ groups, all, q, chosen, onChoose }: { groups: { title: string; list: T[] }[]; all: T[]; q: string; chosen: string | null; onChoose: (p: T) => void }) {
  const ql = q.trim().toLowerCase();
  const row = (p: T) => <Row key={p.id} title={p.name} facts={p.note} trailing={chosen === p.id ? "✓" : undefined} onClick={() => onChoose(p)} />;
  if (ql) {
    const list = all.filter((p) => p.name.toLowerCase().includes(ql)).slice(0, 8);
    return <ListGroup title="Matches">{list.length ? list.map(row) : <Empty text="No one found." />}</ListGroup>;
  }
  const shown = groups.filter((g) => g.list.length);
  return <div>{shown.length ? shown.map((g) => <ListGroup key={g.title} title={g.title} count={g.list.length}>{g.list.map(row)}</ListGroup>) : <Empty text="No one is staying on this day." />}</div>;
}

/** The field at the bottom of a sheet, above the keyboard: the same box as Search in the bar. */
export const SearchField = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="flex h-12 items-center gap-2 rounded-full border bg-background px-3 focus-within:border-primary focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]">
    <SearchIcon className="h-5 w-5 flex-none text-muted-foreground" />
    <input type="text" enterKeyHint="search" autoComplete="off" placeholder={placeholder} aria-label={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-base outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

/**
 * A line: label on the left, the value on the right, tap to change ("Therapist · Kriti ›").
 * With `select` (a <select> or date box) the phone's own list opens under the tap, so a
 * line changes in one tap. With no `onClick` and no `select` it only tells.
 */
export const ChangeLine = ({ label, value, onClick, select, faint }: { label: string; value: ReactNode; onClick?: () => void; select?: ReactNode; faint?: boolean }) => {
  const cls = "relative flex min-h-12 w-full items-center justify-between gap-3 border-b border-border text-left last:border-b-0";
  const inner = (
    <>
      <span className={noteText}>{label}</span>
      <span className={`flex min-w-0 items-center gap-1 ${faint ? "text-muted-foreground" : "font-semibold"}`}><span className="truncate">{value}</span>{onClick || select ? <span aria-hidden className="text-muted-foreground">›</span> : null}</span>
      {select}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
};

/** A fact that needs its whole text (a plan, a meal): label above, the words wrapped below, a › when a tap edits it. */
export const TextRow = ({ label, children, onClick, faint }: { label: string; children: ReactNode; onClick?: () => void; faint?: boolean }) => {
  const cls = "flex min-h-12 w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0";
  const body = (<>
    <span className="min-w-0 flex-1"><span className={`block ${noteText}`}>{label}</span><span className={`block whitespace-pre-line text-base ${faint ? "text-muted-foreground" : ""}`}>{children}</span></span>
    {onClick ? <span aria-hidden className="flex-none text-muted-foreground">›</span> : null}
  </>);
  return onClick ? <button type="button" className={cls} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
};

/** The phone's calendar laid over a ChangeLine, the way DateRow does it. */
export const LineDate = ({ label, value, onChange, min }: { label: string; value: string; onChange: (iso: string) => void; min?: string }) => (
  <input type="date" aria-label={label} value={value.slice(0, 10)} min={min} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
    onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* already open */ } }}
    onChange={(e) => { if (e.target.value) onChange(e.target.value); }} />
);

/** The <select> laid over a ChangeLine: invisible, whole-row, so the tap lands on it. Free choices first; busy ones stay in the list, greyed. */
export const LineSelect = ({ label, value, onChange, free, busy = [] }: { label: string; value: string; onChange: (v: string) => void; free: { id: string; name: string; tag?: string }[]; busy?: { id: string; name: string; why?: string }[] }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
    {free.map((o) => <option key={o.id} value={o.id}>{o.name}{o.tag ? ` · ${o.tag}` : ""}</option>)}
    {busy.length ? <optgroup label="Busy then">{busy.map((o) => <option key={o.id} value={o.id} disabled>{o.name}{o.why ? ` · ${o.why}` : ""}</option>)}</optgroup> : null}
  </select>
);

/** "Rs 70,750": whole rupees, grouped the Indian way. Reference figures, never an invoice (#53). */
export const rupees = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

/**
 * Today and Tomorrow above the phone's own calendar: most changes start on one of them.
 * The chosen day is shown on the calendar row either way.
 */
export function QuickDates({ label, value, today, onChange, min, max }: { label: string; value: string; today: string; onChange: (iso: string) => void; min?: string; max?: string }) {
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const ok = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  return (
    <div>
      <div className="mt-3 flex gap-1.5">
        {([["Today", today], ["Tomorrow", tomorrow]] as const).map(([name, iso]) => (
          <button key={name} type="button" disabled={!ok(iso)} aria-pressed={value === iso} onClick={() => onChange(iso)} className={`${chip} disabled:opacity-40`}>{name}</button>
        ))}
      </div>
      <div className="mt-1"><DateRow label={label} value={value} min={min} max={max} onChange={onChange} /></div>
    </div>
  );
}

/** The foot of a BottomSheet (its `foot` slot): one main button, and for something that exists a quiet destructive line under it. */
export function SheetFoot({ busy, save, label = "Save", remove, removeLabel = "Delete", ok = true, tone }: { tone?: "destructive"; busy?: boolean; save: () => void; label?: string; remove?: () => void; removeLabel?: string; ok?: boolean }) {
  return (
    <div className="grid gap-1">
      <button type="button" className={`${wide} ${tone === "destructive" ? "border-[1.5px] border-destructive text-destructive" : "bg-primary text-primary-foreground"} disabled:opacity-50`} disabled={busy || !ok} onClick={save}>{busy ? "Saving…" : label}</button>
      {remove ? <button type="button" className={`${wide} text-sm text-destructive`} onClick={remove}>{removeLabel}</button> : null}
    </div>
  );
}

/** A list's first row when the list has somewhere else to go: "Add from the library ›". */
export const LinkRow = ({ label, value, onClick }: { label: string; value?: ReactNode; onClick: () => void }) => (
  <div className="px-3"><ChangeLine label={label} value={value ?? ""} onClick={onClick} /></div>
);
