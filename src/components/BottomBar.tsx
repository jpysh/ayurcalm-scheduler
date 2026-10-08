import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Menu, Plus } from "lucide-react";
import { BottomSearch, BottomSheet, DateRow, dayText, Group, ListGroup, plural, Row, Seg, Btn, Tile } from "@/components/kit";

/**
 * The phone frame from docs/design/phone.html (#66): one bar at the bottom, in
 * reach of the thumb, and everything else opens as a sheet from it. On a desktop
 * the bar is the same, only centred.
 */

export const SCREENS = [
  ["patients", "Patients", "Who is staying"],
  // Only when the centre has guest rooms: its hint is filled in then (#456).
  ["guestrooms", "Guest rooms", "Who sleeps where"],
  ["team", "Team", "Who is in today"],
  ["rooms", "Rooms", "Where treatments happen"],
  ["timeoff", "Leave", "Future time off"],
  ["diet", "Diet plans", "Meals by plan"],
  ["settings", "Settings", "Centre, users, AI"],
  ["schedule", "Back to the day", "The list"],
  // Reached from Team, not the menu (#137).
  ["therapies", "Therapies", ""],
  ["events", "Events", ""],
  ["log", "Log", ""],
] as const;
/** The menu's tiles, as the design (#137): the rest open from Team. */
const MENU = SCREENS.filter(([, , hint]) => hint);

export { BottomSheet };

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
  /** The day Print gives: tomorrow once today is closed (#459). */
  printDay: string;
  printing: boolean;
  /** What + adds on this screen ("Book a treatment", "New patient"); none on a screen with nothing to add. */
  plus: { adds: string; run: () => void } | null;
  /** The one search: on the day it filters the day, on Patients the list. */
  search: { query: string; setQuery: (q: string) => void; on: boolean; setOn: (on: boolean) => void; placeholder: string; label: string; /** What it reaches, when the name alone does not say. */ hint?: string; start: () => void };
  /** The attention pill: what is waiting on the day, and where tapping goes. */
  attention?: { fix: number; done: number; note: number; open: () => void } | null;
};

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function BottomBar({ activeTab, go, day, today, now, setDay, print, printDay, printing, plus, search, attention }: Props) {
  const [sheet, setSheet] = useState<"menu" | "day" | null>(null);
  // Leaving Search brings the bar back; the keyboard's place goes to the menu button (#311).
  const menuBtn = useRef<HTMLButtonElement>(null);
  const wasSearching = useRef(false);
  useEffect(() => { if (wasSearching.current && !search.on) menuBtn.current?.focus(); wasSearching.current = search.on; }, [search.on]);
  // Live subtitles, read when the menu opens (#67): who is in house, who is not in.
  const [hints, setHints] = useState<Record<string, string>>({});
  // The maintainer's WhatsApp from Settings; the Help tile shows only with one.
  const [helpWa, setHelpWa] = useState<string | null>(null);
  useEffect(() => {
    if (sheet !== "menu") return;
    Promise.all([
      fetch(`${API_BASE}/patients?resident_on=${today}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/staff`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/settings`).then((r) => (r.ok ? r.json() : {})),
      fetch(`${API_BASE}/rooms`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/timeoff?from=${today}&to=${today}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/guest-rooms/free?from=${today}&to=${shift(today, 1)}`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([residents, days, staff, settings, rooms, off, guestRooms]: [unknown[], { staff_id: string; off: string | null }[], { id: string; name: string }[], { support_whatsapp?: string | null }, { id: string }[], { entity_type: string; entity_id: string }[], { free: boolean }[]]) => {
      const roomsOut = new Set(off.filter((x) => x.entity_type === "room").map((x) => x.entity_id)).size;
      setHelpWa(settings.support_whatsapp || null);
      const out = days.filter((d) => d.off).map((d) => staff.find((s) => s.id === d.staff_id)?.name.split(" ")[0]).filter(Boolean);
      setHints({
        patients: `${residents.length} in house`,
        rooms: `${plural(rooms.length, "room")}${roomsOut ? ` · ${roomsOut} out` : ""}`,
        team: out.length === 0 ? "Everyone in" : out.length === 1 ? `${out[0]} not in` : `${out.length} not in`,
        schedule: dayText(day),
        ...(guestRooms.length ? { guestrooms: `${guestRooms.filter((r) => r.free).length} free tonight` } : {}),
      });
    }).catch(() => setHints({}));
  }, [sheet, today, day]);
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  const when = diff === 0 ? `Today · ${now}` : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
  const pick = (iso: string) => { setDay(iso); go("schedule"); setSheet(null); };
  const onDay = activeTab === "schedule";
  // The one control the admin sees (5 Oct): everything else is a row in its sheet. The badge keeps what needs them in view.
  const need = attention?.fix ?? 0;
  const info = (attention?.done ?? 0) + (attention?.note ?? 0);
  // On every screen (#537): an SOS raised while the admin is in Settings must still show.
  const inbox = attention && (need || info) ? { need, info } : null;
  const close = (run: () => void) => () => { setSheet(null); run(); };

  return (
    <>
      {search.on ? (
        <BottomSearch value={search.query} onChange={search.setQuery} onClose={() => { search.setOn(false); search.setQuery(""); }} placeholder={search.placeholder} label={search.label} />
      ) : (
        <nav aria-label="Main" data-kit="bar" className="pointer-events-none fixed inset-x-[var(--bar-gap)] bottom-[calc(var(--bar-gap)+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl justify-end gap-3">
          {/* The screen's one main action, beside the menu and only where it means something (#313). */}
          {plus ? <button type="button" aria-label={plus.adds} onClick={plus.run} className="pointer-events-auto grid h-[var(--bar-h)] w-[var(--bar-h)] place-items-center rounded-full bg-primary text-primary-foreground shadow-float active:bg-[hsl(var(--primary-hover))]"><Plus className="h-7 w-7" /></button> : null}
          <button ref={menuBtn} type="button" aria-label="Menu" onClick={() => setSheet("menu")} className="pointer-events-auto relative grid h-[var(--bar-h)] w-[var(--bar-h)] place-items-center rounded-full bg-primary text-primary-foreground shadow-float active:bg-[hsl(var(--primary-hover))]">
            <Menu className="h-6 w-6" />
            {inbox ? <span aria-hidden className={`absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-background px-1 text-xs font-bold text-white ${inbox.need ? "bg-destructive" : "bg-muted-foreground"}`}>{inbox.need || inbox.info}</span> : null}
          </button>
        </nav>
      )}

      {sheet === "menu" ? <BottomSheet open onOpenChange={(o) => setSheet(o ? "menu" : null)} title="">
        {/* What needs doing first, then the rest of what can be done here. The main action is the + beside the menu. */}
        {inbox?.need ? <div className="mb-3"><ListGroup><Row key="inbox" title={`${inbox.need} need you`} facts="Things to fix or decide" trailing="›" onClick={close(attention!.open)} /></ListGroup></div> : null}
        <div className="mt-2">
          <ListGroup>
            {inbox && !inbox.need ? <Row key="inbox" title={`${inbox.info} to know`} trailing="›" onClick={close(attention!.open)} /> : null}
            <Row key="search" title={search.label} facts={search.hint} trailing="›" onClick={close(search.start)} />
            {onDay ? <Row key="day" title="Change day" facts={`${dayText(day)} · ${when}`} trailing="›" onClick={() => setSheet("day")} /> : null}
            {onDay ? <Row key="print" title={printDay === day ? "Print the day's sheets" : "Print tomorrow's sheets"} facts={printing ? "Making the PDF…" : printDay === day ? undefined : dayText(printDay)} trailing="›" onClick={() => { setSheet(null); if (!printing) print(); }} /> : null}
          </ListGroup>
        </div>
        <div className="mt-3 pb-3">
          <div className="mb-1 pt-2 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">Go to</div>
          <div className="grid grid-cols-2 gap-2">
            {MENU.filter(([key]) => !(onDay && key === "schedule") && (key !== "guestrooms" || hints.guestrooms)).flatMap(([key, name]) => [
              <Tile key={key} title={name} facts={hints[key]} onClick={() => { go(key); setSheet(null); }} />,
              key === "settings" && helpWa ? <Tile key="help" title="Help · WhatsApp" facts="Ask us anything" href={`https://wa.me/${helpWa}`} onClick={() => setSheet(null)} /> : null,
            ])}
          </div>
        </div>
      </BottomSheet> : null}

      <BottomSheet open={sheet === "day"} onOpenChange={(o) => setSheet(o ? "day" : null)} title={dayText(day)}>
        <div className="grid grid-cols-[1.25fr_1fr_1.25fr] gap-2 [&>button]:whitespace-nowrap [&>button]:px-2">
          <Btn kind="secondary" inline onClick={() => pick(shift(day, -1))}>Day before</Btn>
          <Btn kind="primary" inline onClick={() => pick(today)}>Today</Btn>
          <Btn kind="secondary" inline onClick={() => pick(shift(day, 1))}>Next day</Btn>
        </div>
        <div className="mt-3"><DateRow label="Pick a date" value={day} onChange={pick} /></div>
      </BottomSheet>
    </>
  );
}

/**
 * The day, as Apple Calendar draws it (5 Oct): one week across, swipe for the next or last, tap a day.
 * Today carries a ring, the chosen day is filled. Far-off dates are in the Menu's Change day.
 */
export function WeekStrip({ day, today, setDay, moves }: { day: string; today: string; setDay: (iso: string) => void; moves?: Map<string, { in: number; out: number }> }) {
  const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekOf = (iso: string) => shift(iso, -dow(iso));
  const weeksBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / (7 * 86400000));
  // 26 weeks either side of today, or of the chosen day when it was picked from further away.
  const centre = Math.abs(weeksBetween(weekOf(day), weekOf(today))) > 20 ? weekOf(day) : weekOf(today);
  const weeks = Array.from({ length: 53 }, (_, i) => shift(centre, (i - 26) * 7));
  const box = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = box.current; if (!el || compact) return;
    const left = (weeks.indexOf(weekOf(day))) * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) > 4) el.scrollTo({ left, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [day, centre, compact]); // eslint-disable-line react-hooks/exhaustive-deps
  // The heading names the week on show, not the chosen day, as Apple Calendar does while you swipe.
  const [shown, setShown] = useState(weekOf(day));
  useEffect(() => setShown(weekOf(day)), [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const month = new Date(`${shift(shown, 3)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  // Past the first screenful the week folds to one line, as Apple Calendar does, and hands the rows back their room (#313 follow-up).
  // It unfolds only at the very top: the strip is taller than any gap between two thresholds, so unfolding
  // lower pushed the page back past the fold point and it flickered (#332). The list is moved by exactly what the strip lost so nothing jumps.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setCompact((c) => (c ? window.scrollY > 0 : window.scrollY > 140));
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const height = useRef(0);
  useLayoutEffect(() => {
    const el = bar.current; if (!el) return;
    const h = el.offsetHeight;
    if (height.current && h !== height.current && window.scrollY > 0) window.scrollBy(0, h - height.current);
    height.current = h;
  }, [compact]);
  // The day's hour headers stick just under the strip: publish where it ends, whatever its height is.
  useLayoutEffect(() => {
    const el = bar.current; if (!el) return;
    const put = () => document.documentElement.style.setProperty("--strip-h", `${el.offsetHeight}px`);
    put();
    const ro = new ResizeObserver(put); ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--strip-h"); };
  }, []);
  const dayName = dayText(day);
  return (
    <div ref={bar} className="sticky top-0 z-[4] -mx-1 border-b bg-background px-1 pt-2">
      <div className="flex min-h-6 items-center justify-between px-1 text-sm">
        {compact
          ? <button type="button" className="-my-2.5 min-h-11 text-left text-base font-bold" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>{dayName}<span className="ml-1 font-normal text-muted-foreground">· week ›</span></button>
          : <b className="text-base">{month}</b>}
        {day !== today ? <button type="button" className="min-h-11 px-2 font-semibold text-primary -my-2.5" onClick={() => setDay(today)}>Today</button> : null}
      </div>
      <div ref={box} aria-label="Week" onScroll={(e) => { const el = e.currentTarget; const w = weeks[Math.round(el.scrollLeft / el.clientWidth)]; if (w && w !== shown) setShown(w); }} className={`${compact ? "hidden" : "flex"} snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {weeks.map((w) => (
          <div key={w} className="flex w-full flex-none snap-start justify-between">
            {Array.from({ length: 7 }, (_, i) => shift(w, i)).map((d) => {
              const on = d === day, now = d === today, m = moves?.get(d);
              return (
                <button key={d} type="button" aria-label={dayText(d)} title={m ? `${m.in} arriving, ${m.out} leaving` : undefined} aria-pressed={on} onClick={() => setDay(d)} className="flex min-h-14 w-[14.28%] flex-col items-center justify-center gap-0.5">
                  <span className={`text-xs font-semibold ${dow(d) % 6 === 0 ? "text-muted-foreground" : ""}`}>{"SMTWTFS"[dow(d)]}</span>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${on ? "bg-primary font-bold text-primary-foreground" : now ? "border-2 border-primary font-bold text-primary" : ""}`}>{Number(d.slice(8))}</span>
                  {/* Monday planning (#421): who comes and goes, read off the stays already loaded. A fixed line so the days stay level. */}
                  {moves ? <span aria-hidden className="h-3.5 text-[11px] font-semibold leading-none tabular-nums">{m?.in ? <span className="text-primary">+{m.in}</span> : null}{m?.in && m?.out ? " " : null}{m?.out ? <span className="text-muted-foreground">−{m.out}</span> : null}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
