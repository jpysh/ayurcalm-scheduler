import { useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Menu, Plus, Printer, Search } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The phone frame from docs/design/phone.html (#66): one bar at the bottom, in
 * reach of the thumb, and everything else opens as a sheet from it. On a desktop
 * the bar is the same, only centred.
 */

export const SCREENS = [
  ["patients", "Residents", "Who is staying"],
  ["team", "Team and rooms", "Who is in today"],
  ["timeoff", "Leave", "Future time off"],
  ["diet", "Diet plans", "Meals by plan"],
  ["settings", "Settings", "Centre, users, AI"],
  ["schedule", "Back to the day", "The list"],
  // Reached from Team and rooms, not the menu (#137).
  ["staff", "Therapists", ""],
  ["rooms", "Rooms", ""],
  ["therapies", "Therapies", ""],
  ["events", "Events", ""],
  ["log", "Log", ""],
] as const;
/** The menu's tiles, as the design (#137): the rest open from Team and rooms. */
const MENU = SCREENS.filter(([, , hint]) => hint);

export function BottomSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" hideClose className="mx-auto max-w-xl rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto -mt-2 mb-3 h-1 w-9 rounded-full bg-border" />
        {/* A sheet with no title in the design still names itself to a screen reader. */}
        <SheetTitle className={title ? "text-lg mb-3" : "sr-only"}>{title || "Menu"}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

type Props = {
  activeTab: string;
  go: (tab: string) => void;
  /** The day on screen and today, both YYYY-MM-DD on the centre's clock. */
  day: string;
  today: string;
  /** "14:35" on the centre's clock. */
  now: string;
  setDay: (iso: string) => void;
  print: () => void;
  printing: boolean;
  book: () => void;
  /** How the day is grouped, and the search over it (#62). */
  view: string;
  setView: (v: "time" | "therapist" | "room" | "resident") => void;
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  setSearching: (on: boolean) => void;
  /** The attention pill: what is waiting on the day, and where tapping goes. */
  attention?: { fix: number; done: number; note: number; open: () => void } | null;
};

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function BottomBar({ activeTab, go, day, today, now, setDay, print, printing, book, view, setView, query, setQuery, searching, setSearching, attention }: Props) {
  const [sheet, setSheet] = useState<"menu" | "day" | null>(null);
  // Live subtitles, read when the menu opens (#67): who is in house, who is not in.
  const [hints, setHints] = useState<Record<string, string>>({});
  useEffect(() => {
    if (sheet !== "menu") return;
    Promise.all([
      fetch(`${API_BASE}/patients?resident_on=${today}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/staff`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([residents, days, staff]: [unknown[], { staff_id: string; off: string | null }[], { id: string; name: string }[]]) => {
      const out = days.filter((d) => d.off).map((d) => staff.find((s) => s.id === d.staff_id)?.name.split(" ")[0]).filter(Boolean);
      setHints({
        patients: `${residents.length} in house`,
        team: out.length === 0 ? "Everyone in" : out.length === 1 ? `${out[0]} not in` : `${out.length} not in`,
        schedule: label(day),
      });
    }).catch(() => setHints({}));
  }, [sheet, today, day]);
  const endSearch = () => { setSearching(false); setQuery(""); };
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  const when = diff === 0 ? `Today · ${now}` : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
  const pick = (iso: string) => { setDay(iso); go("schedule"); setSheet(null); };
  const icon = "h-12 w-12 rounded-full grid place-items-center active:bg-secondary";

  return (
    <>
      {attention && (attention.fix || attention.done || attention.note) && activeTab === "schedule" && !searching ? (
        <button type="button" onClick={attention.open}
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 min-h-10 px-3.5 rounded-full border bg-card text-sm font-semibold shadow-lg whitespace-nowrap after:content-['›'] after:text-lg after:text-muted-foreground after:-ml-1">
          {attention.fix ? <span className="inline-flex items-center"><i className="mr-1.5 h-2 w-2 rounded-full bg-destructive" />{attention.fix} to fix</span> : null}
          {attention.done ? <span className="inline-flex items-center"><i className="mr-1.5 h-2 w-2 rounded-full bg-warning" />{attention.done} done</span> : null}
          {attention.note ? <span className="inline-flex items-center"><i className="mr-1.5 h-2 w-2 rounded-full bg-muted-foreground/60" />{attention.note} note{attention.note === 1 ? "" : "s"}</span> : null}
        </button>
      ) : null}
      {searching ? (
        <nav aria-label="Search" className="fixed inset-x-2.5 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl grid grid-cols-[auto_1fr_auto] items-center h-[60px] p-1 rounded-full border bg-card/95 backdrop-blur shadow-lg">
          <Search className="ml-3 h-5 w-5 text-muted-foreground" />
          <input autoFocus type="text" enterKeyHint="search" placeholder="Name, therapy or room" aria-label="Search treatments" autoComplete="off"
            className="min-w-0 h-12 px-2 bg-transparent text-base outline-none" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="min-h-12 px-3.5 rounded-full font-semibold text-primary" onClick={endSearch}>Cancel</button>
        </nav>
      ) : (
      <nav aria-label="Main" className="fixed inset-x-2.5 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1 h-[60px] p-1 rounded-full border bg-card/95 backdrop-blur shadow-lg">
        <button type="button" className={icon} aria-label="Menu" onClick={() => setSheet("menu")}><Menu className="h-6 w-6" /></button>
        <button type="button" className={icon} aria-label="Search treatments" onClick={() => { go("schedule"); setSearching(true); }}><Search className="h-6 w-6" /></button>
        <button type="button" className="h-[52px] min-w-0 rounded-full flex flex-col items-center justify-center leading-tight active:bg-secondary" aria-label={`Change day, now ${label(day)}`} onClick={() => setSheet("day")}>
          <span className="text-base font-semibold whitespace-nowrap">{label(day)}</span>
          <span className={`text-xs whitespace-nowrap ${diff === 0 ? "text-now font-semibold" : "text-muted-foreground"}`}>{when}</span>
        </button>
        <button type="button" className={icon} aria-label="Print the day's sheets" disabled={printing} onClick={print}><Printer className="h-6 w-6" /></button>
        <button type="button" className="h-[52px] w-[52px] rounded-full grid place-items-center bg-primary text-primary-foreground" aria-label="Book a treatment" onClick={book}><Plus className="h-6 w-6" /></button>
      </nav>
      )}

      <BottomSheet open={sheet === "menu"} onOpenChange={(o) => setSheet(o ? "menu" : null)} title="">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show the day by</div>
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-background p-1">
          {(["time", "therapist", "room", "resident"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={activeTab === "schedule" && view === v}
              className="min-h-10 rounded-lg text-[13px] font-semibold text-center text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow"
              onClick={() => { setView(v); go("schedule"); setSheet(null); }}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MENU.map(([key, name, hint]) => (
            <button key={key} type="button"
              className="min-h-[60px] rounded-xl border-2 px-3 py-2 text-left"
              onClick={() => { go(key); setSheet(null); }}>
              <b className="block text-base">{name}</b>
              <span className="block text-xs text-muted-foreground">{hints[key] || hint}</span>
            </button>
          ))}

        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "day"} onOpenChange={(o) => setSheet(o ? "day" : null)} title={label(day)}>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="rounded-full px-2 text-sm" onClick={() => pick(shift(day, -1))}>‹ Day before</Button>
          <Button className="rounded-full px-2 text-sm" onClick={() => pick(today)}>Today</Button>
          <Button variant="outline" className="rounded-full px-2 text-sm" onClick={() => pick(shift(day, 1))}>Next day ›</Button>
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 text-base">
          Pick a date
          <Input type="date" className="w-auto" value={day} onChange={(e) => e.target.value && pick(e.target.value)} />
        </label>
      </BottomSheet>
    </>
  );
}
