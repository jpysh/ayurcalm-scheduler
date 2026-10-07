import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Lock, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * The form kit (#283): every form is built from these parts, so a field has one
 * height, one radius, one label size and one focus ring (the global one). Taken
 * from the room, therapist and therapy sheets, which are the reference look.
 */

// The boundary is dark enough to read as a box to type in; focus is a soft halo on the box itself.
export const field = `h-11 w-full rounded-xl border border-[hsl(var(--input)/0.45)] bg-background px-3.5 text-base tabular-nums transition-shadow placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] focus-visible:outline-none disabled:opacity-60`;
const chevron = <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none h-4 w-4 flex-none text-muted-foreground"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const lbl = "mt-3 mb-1 block text-sm font-semibold text-muted-foreground";
export const noteText = "text-sm text-muted-foreground";
export const chip = "min-h-11 rounded-full border border-[hsl(var(--input)/0.45)] px-3.5 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";
export const wide = "min-h-11 w-full rounded-full font-semibold";
// Seeded names are stored as massage_table; the admin reads "massage table".
export const say = (s: string) => s.replace(/_/g, " ");

/** The line under a sheet's title that says what the sheet is for. */
export const SheetNote = ({ children }: { children: ReactNode }) => <p className={noteText}>{children}</p>;

/** A label over one control. */
const Field = ({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) => (
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

/**
 * A long list (more than ~15) is a sheet with a search field, never a phone's wheel of 150 names.
 * The field looks like a Dropdown; groups keep their headings and typing filters across them.
 */
export function PickField({ label, value, placeholder, groups, onPick }: { label: string; value: string; placeholder: string; groups: { title: string; options: { id: string; name: string }[] }[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = groups.flatMap((g) => g.options);
  const chosen = all.find((o) => o.id === value);
  const needle = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, options: g.options.filter((o) => !needle || o.name.toLowerCase().includes(needle)) })).filter((g) => g.options.length);
  return (
    <>
      <Field label={label}>
      <button type="button" aria-label={`${label}: ${chosen?.name ?? placeholder}`} onClick={() => { setQ(""); setOpen(true); }} className={`${field} flex items-center justify-between text-left ${chosen ? "" : "text-muted-foreground"}`}>
        <span className="truncate">{chosen?.name ?? placeholder}</span>{chevron}
      </button>
      </Field>
      <BottomSheet open={open} onOpenChange={setOpen} title={label} foot={<SearchField value={q} onChange={setQ} placeholder="Type a name" />}>
        {shown.length ? shown.map((g) => (
          <ListGroup key={g.title} title={g.title} count={g.options.length}>
            {g.options.map((o) => <Row key={o.id} title={o.name} trailing={o.id === value ? "✓" : undefined} onClick={() => { onPick(o.id); setOpen(false); }} />)}
          </ListGroup>
        )) : <Empty text="No one by that name." />}
      </BottomSheet>
    </>
  );
}

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
          className="min-h-11 min-w-0 rounded-lg border border-transparent text-base font-medium text-foreground/75 transition-colors aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:border-input/40">{l}</button>
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
        <input className="h-11 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm" placeholder={addLabel} aria-label={addLabel} value={draft}
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
export function BottomSheet({ open, onOpenChange, title, note, children, foot, onBack }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; note?: ReactNode; children: ReactNode; foot?: ReactNode; /** A sheet's second page: Back above the title. */ onBack?: () => void }) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-t-sheet bg-card p-0 outline-none"
        // The sheet takes the focus, not its first field: that raised the phone's keyboard over half the form before it had been read.
        onOpenAutoFocus={(e) => { const was = document.activeElement as HTMLElement | null; opener.current = was && was !== document.body ? was : null; e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
        // Focus goes back to what opened the sheet; when the menu hands it to Search, Search keeps it (#311).
        onCloseAutoFocus={(e) => { e.preventDefault(); const from = opener.current; setTimeout(() => { if (document.activeElement && document.activeElement !== document.body) return; (from?.isConnected ? from : document.querySelector<HTMLElement>('button[aria-label=Menu]'))?.focus(); }, 0); }}>
        <div className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-border" />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {onBack ? <BackLink onBack={onBack} /> : null}
          {/* A sheet with no title in the design still names itself to a screen reader. */}
          <SheetTitle className={title ? "mb-3 text-xl font-bold" : "sr-only"}>{title || "Menu"}</SheetTitle>
          {note ? <p className={`-mt-2 mb-3 ${noteText}`}>{note}</p> : null}
          {children}
        </div>
        {foot ? <div className="flex-none border-t bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{foot}</div> : <div className="h-[env(safe-area-inset-bottom)] flex-none" />}
      </SheetContent>
    </Sheet>
  );
}

/** Search takes the bar's place: its field sits at the bottom, above the keyboard. */
export function BottomSearch({ value, onChange, onClose, placeholder, label }: { value: string; onChange: (v: string) => void; onClose: () => void; placeholder: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  // After the menu's own focus handling has finished; a phone still counts it as the tap that opened search, so the keyboard rises.
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 30); return () => clearTimeout(t); }, []);
  return (
  <nav aria-label="Search" data-kit="bar" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} className="fixed inset-x-[var(--bar-gap)] bottom-[calc(var(--bar-gap)+env(safe-area-inset-bottom))] z-40 mx-auto grid h-[var(--bar-h)] max-w-xl grid-cols-[auto_1fr_auto] items-center rounded-full border bg-card p-1 shadow-float">
    <SearchIcon className="ml-3 h-5 w-5 text-muted-foreground" />
    <input ref={input} autoFocus type="text" enterKeyHint="search" placeholder={placeholder} aria-label={label} autoComplete="off" className="h-12 min-w-0 bg-transparent px-2 text-base outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" className="min-h-12 rounded-full px-3.5 font-semibold text-primary" onClick={onClose}>Cancel</button>
  </nav>
  );
}

/** A screen to go to, two across: its name and, when there is one, a live fact ("65 in house"). */
export const Tile = ({ title, facts, onClick, href }: { title: ReactNode; facts?: ReactNode; onClick?: () => void; href?: string }) => {
  const cls = "flex min-h-14 flex-col justify-center rounded-xl border bg-card px-3 py-2 text-left active:bg-secondary";
  const body = <><span className="line-clamp-2 text-row font-semibold leading-snug">{title}</span>{facts ? <span className="line-clamp-1 text-sm text-muted-foreground">{facts}</span> : null}</>;
  return href ? <a className={cls} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>{body}</a> : <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

/** One row: title, up to two facts, one trailing fact, and a flag line only when something needs doing. */
export const Row = ({ title, facts, trailing, flag, onClick, href }: { title: ReactNode; facts?: ReactNode; trailing?: ReactNode; flag?: ReactNode; onClick?: () => void; /** A row that leaves the app (WhatsApp) is a link, so it can be opened in a new tab. */ href?: string }) => {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-row font-semibold">{title}</span>
        {facts ? <span className="line-clamp-2 text-sm text-muted-foreground">{facts}</span> : null}
        {flag ? <span className="block text-sm font-semibold text-destructive">{flag}</span> : null}
      </span>
      {trailing ? <span className="flex-none text-sm text-muted-foreground">{trailing}</span> : null}
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0";
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>{body}</a>;
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
export function InboxSheet({ open, onOpenChange, title, sections, empty = "Nothing needs you.", children, foot }: { foot?: ReactNode; open: boolean; onOpenChange: (o: boolean) => void; title: string; sections: { name: string; /** What needs action; information rows are not counted. */ count: number; body: ReactNode }[]; empty?: string; children?: ReactNode }) {
  const shown = sections.filter((x) => x.body);
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} foot={foot}>
      {children}
      {shown.length ? shown.map((x) => <div key={x.name}><div className="pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{x.name}{x.count > 0 ? ` · ${x.count}` : ""}</div>{x.body}</div>) : <Empty text={empty} />}
    </BottomSheet>
  );
}

/** Under a field that changes other things: one live line saying what will change. */
export const Consequence = ({ children }: { children: ReactNode }) => <p role="status" className="mt-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-primary">{children}</p>;

/** "Discharge summary · 5 of 8 ready", with a slim line. Informs, never blocks. */
export const ChecklistBar = ({ label, done, total, onClick, unit = "ready" }: { label: string; done: number; total: number; onClick: () => void; unit?: string }) => (
  <button type="button" onClick={onClick} className="block w-full rounded-xl border bg-card px-3 py-2.5 text-left">
    <span className="flex justify-between text-sm font-semibold"><span>{label}</span><span className="text-muted-foreground">{done} of {total} {unit}</span></span>
    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
  </button>
);

/** Dated changes in order; each starts where the last ended. */
export const Timeline = ({ items }: { items: { key: string; from: string; title: string; note?: string; onClick?: () => void }[] }) => (
  <ol className="border-l-2 border-primary/30 pl-3">
    {items.map((i) => (
      <li key={i.key} className="py-1.5">
        <button type="button" disabled={!i.onClick} onClick={i.onClick} className="block min-h-11 w-full text-left">
          <span className="block text-sm font-semibold text-muted-foreground">From {i.from}</span>
          <span className="block text-base font-semibold">{i.title}</span>
          {i.note ? <span className={`block ${noteText}`}>{i.note}</span> : null}
        </button>
      </li>
    ))}
  </ol>
);

/** A list of options: name, one line, a trailing fact; the chosen one has a border and a check. Edit opens the catalogue. */
export function Picker<T extends string>({ options, value, onChange, onEdit }: { options: { id: T; name: string; note?: string; fact?: string; faint?: boolean }[]; value: T | ""; onChange: (id: T) => void; onEdit?: () => void }) {
  // Opened with one already chosen (or ready), it is in view rather than somewhere down the list.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" }); }, []);
  return (
    <div ref={box} className="grid gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`flex min-h-14 items-center gap-3 rounded-xl border-[1.5px] border-border px-3 py-2 text-left aria-pressed:border-primary aria-pressed:bg-secondary ${o.faint ? "opacity-60" : ""}`}>
          <span className="min-w-0 flex-1"><b className="block text-base">{o.name}</b>{o.note ? <span className={`line-clamp-1 ${noteText}`}>{o.note}</span> : null}</span>
          {o.fact ? <span className="flex-none text-sm text-muted-foreground">{o.fact}</span> : null}
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
    <button type="button" className={`${wide} text-sm font-semibold text-primary`} disabled={busy || !ok} onClick={onAlt}>{alt}</button>
  </div>
);

/** Done, with a way back: one line, one Undo, five seconds. */
export const toastUndo = (text: string, undo: () => void | Promise<void>) => toast(text, { duration: 5000, action: { label: "Undo", onClick: () => { void undo(); } } });

/** Empty: one line saying why, and the action if there is one. */
export const Empty = ({ text, action }: { text: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-base text-muted-foreground"><span>{text}</span>{action}</div>
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
  <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><span>{text}</span>{retry ? <button type="button" className="min-h-11 flex-none font-semibold" onClick={retry}>Try again</button> : null}</div>
);

/**
 * Booking on one sheet (story 5). "Who" first: at most five suggestions, and the
 * search field (`SearchField`, in the sheet's foot, at the bottom above the keyboard)
 * filters everyone. Choosing one fills the rest in place.
 */
export function WhoPicker<T extends { id: string; name: string; note?: string }>({ groups, all, q, chosen, onChoose, onAdd }: { groups: { title: string; list: T[] }[]; all: T[]; q: string; chosen: string | null; onChoose: (p: T) => void; /** When nobody matches: the typed name as a new patient (#330). */ onAdd?: (name: string) => void }) {
  const ql = q.trim().toLowerCase();
  const row = (p: T) => <Row key={p.id} title={p.name} facts={p.note} trailing={chosen === p.id ? "✓" : undefined} onClick={() => onChoose(p)} />;
  if (ql) {
    const list = all.filter((p) => p.name.toLowerCase().includes(ql)).slice(0, 8);
    if (!list.length && onAdd) return <ListGroup title="No one found"><Row title={`Add “${q.trim()}” as a new patient`} trailing="+" onClick={() => onAdd(q.trim())} /></ListGroup>;
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
  const cls = "relative flex min-h-12 w-full items-center justify-between gap-3 border-b border-border py-2 text-left last:border-b-0";
  const inner = (
    <>
      <span className={noteText}>{label}</span>
      <span className={`flex min-w-0 items-center gap-1 ${faint ? "text-muted-foreground" : "font-semibold"}`}><span className="line-clamp-2 text-right">{value}</span>{onClick || select ? <span aria-hidden className="text-muted-foreground">›</span> : null}</span>
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

/** A row whose trailing control is a switch: the name, one line of state, and the switch at the right (#288). `locked` shows a lock and cannot be switched. */
export const SwitchRow = ({ title, facts, on, set, locked, flag, children }: { title: ReactNode; facts?: ReactNode; on: boolean; set: (v: boolean) => void; locked?: boolean; flag?: ReactNode; children?: ReactNode }) => (
  <div className="border-b border-border px-3 py-2 last:border-b-0">
    <label className="flex min-h-[48px] items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        {facts ? <span className="block text-sm text-muted-foreground">{facts}</span> : null}
        {flag ? <span className="block text-sm font-semibold text-notice">{flag}</span> : null}
      </span>
      {locked ? <Lock aria-label="Always on" className="h-4 w-4 flex-none text-muted-foreground" /> : null}
      <input type="checkbox" role="switch" aria-label={typeof title === "string" ? title : undefined} checked={on} disabled={locked} onChange={(e) => set(e.target.checked)} />
    </label>
    {children}
  </div>
);

/** A photo chosen from the phone, as a button: the browser's own "Choose File · No file chosen" is cut off on a phone (#265 P4). */
export const PickPhoto = ({ id, has, disabled, onPick }: { id: string; has: boolean; disabled?: boolean; onPick: (f?: File) => void }) => (
  <label className="flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold">
    {has ? "Change photo" : "Choose a photo"}
    <input id={id} type="file" accept="image/png,image/jpeg" className="sr-only" disabled={disabled} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
  </label>
);

/** A caption over a part of a long sheet or page ("Centre", "Letterhead"): the same words ListGroup puts over its list. */
export const SectionHead = ({ children }: { children: ReactNode }) => <div className="pb-1.5 pt-5 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{children}</div>;

/** One dated line of a record (the Log): time, the sentence wrapped in full, who did it, and one action such as Undo. */
export const EntryRow = ({ time, text, by, muted, action }: { time: string; text: ReactNode; by?: ReactNode; muted?: boolean; action?: { label: string; run: () => void } }) => (
  <div className="flex min-h-[56px] items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
    <span className="w-12 flex-none pt-px text-base font-semibold tabular-nums">{time}</span>
    <span className="min-w-0 flex-1">
      <span className={`block text-base leading-snug ${muted ? "text-muted-foreground" : ""}`}>{text}</span>
      {by ? <span className={`block ${noteText}`}>{by}</span> : null}
    </span>
    {action ? <button type="button" className="-my-1 min-h-11 flex-none rounded-full px-3 text-sm font-bold text-primary" onClick={action.run}>{action.label}</button> : null}
  </div>
);

/** An inbox item: what it is, one or two facts, and its actions as quiet buttons under it. `stacked` puts a choice of actions one under another. */
export const ItemRow = ({ title, facts, children, stacked, form }: { title: ReactNode; facts?: ReactNode; children?: ReactNode; stacked?: boolean; /** The children are fields, one under another, not actions. */ form?: boolean }) => (
  <div className="border-b border-border px-3 py-2.5 last:border-b-0">
    <span className="block text-base font-semibold leading-snug">{title}</span>
    {facts ? <span className={`block ${noteText}`}>{facts}</span> : null}
    {children ? <div className={form ? "mt-1 grid gap-1" : `mt-1 flex gap-1 ${stacked ? "flex-col items-end" : "flex-wrap justify-end"}`}>{children}</div> : null}
  </div>
);

/* ---- Session 8 (#285): the card, sign-in, setup and the private links ---- */

const btnKinds = { primary: "bg-primary text-primary-foreground", secondary: "border-[1.5px] border-border", quiet: "text-primary", destructive: "text-destructive" };
const btnClass = (kind: keyof typeof btnKinds, inline?: boolean) => `inline-flex min-h-11 items-center justify-center rounded-full ${kind === "quiet" || kind === "destructive" ? "px-2" : "px-4"} font-semibold disabled:opacity-50 ${inline ? "" : "w-full"} ${btnKinds[kind]}`;

/** A button that says its action: primary (fill), secondary (border), quiet (text) or destructive (alert text). One primary per view. `inline` gives it its own width, not the row's. */
export const Btn = ({ kind = "secondary", inline, className = "", ...rest }: { kind?: keyof typeof btnKinds; inline?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...rest} className={`${btnClass(kind, inline)} ${className}`} />
);

/** A button that leaves the app (WhatsApp, a PDF): a link, so it opens in a new tab, in a button's look. */
export const LinkBtn = ({ kind = "secondary", inline, className = "", ...rest }: { kind?: keyof typeof btnKinds; inline?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a target="_blank" rel="noopener noreferrer" {...rest} className={`${btnClass(kind, inline)} ${className}`} />
);

/** A small state word on a card ("Finished", "Didn't come", "In progress"). The word carries the state; the tint only backs it. */
export const Tag = ({ tone = "quiet", children }: { tone?: "quiet" | "good" | "alert" | "now"; children: ReactNode }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${{ quiet: "bg-secondary text-muted-foreground", good: "bg-secondary text-primary", alert: "bg-destructive/10 text-destructive", now: "bg-now/10 text-now" }[tone]}`}>{children}</span>
);

/** What is wrong, in words, with the fix under it. Alert tint only when it must be fixed now. */
export const Callout = ({ tone = "plain", title, children, actions }: { tone?: "alert" | "notice" | "plain"; title: ReactNode; children?: ReactNode; actions?: ReactNode }) => (
  <div role="group" aria-label={typeof title === "string" ? title : undefined} className={`rounded-xl px-3 py-2.5 ${tone === "alert" ? "bg-destructive/10" : tone === "notice" ? "bg-notice-bg text-notice" : "bg-secondary"}`}>
    <b className={`block text-sm ${tone === "alert" ? "text-destructive" : ""}`}>{title}</b>
    {children ? <span className="block text-sm">{children}</span> : null}
    {actions ? <div className="mt-0.5 flex flex-wrap justify-end gap-1">{actions}</div> : null}
  </div>
);

/** Back, for BottomSheet's `onBack`. */
const BackLink = ({ onBack }: { onBack: () => void }) => (
  <button type="button" className="-ml-1 -mt-2 mb-1 flex min-h-11 items-center px-1 font-semibold text-primary" onClick={onBack}>‹ Back</button>
);

/** A screen that is not the app (sign-in, setup, a private link): the page colour, one centred column, the sheet's gutter. */
export const FullPage = ({ title, note, children }: { title?: ReactNode; note?: ReactNode; children: ReactNode }) => (
  <main className="min-h-dvh bg-background px-4 pb-10 pt-8">
    <div className="mx-auto max-w-md">
      {title ? <h1 className="text-xl font-bold">{title}</h1> : null}
      {note ? <p className={`mt-1 ${noteText}`}>{note}</p> : null}
      {children}
    </div>
  </main>
);

/** Whatever a small link reads as: quiet, primary, 44 high. */
export const QuietLink = ({ className = "", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a className={`inline-flex min-h-11 items-center text-sm font-semibold text-primary ${className}`} {...rest} />
);
