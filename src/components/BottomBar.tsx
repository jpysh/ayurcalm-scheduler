import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Menu, Printer, Search } from "lucide-react";
import { Bar, BarButton, BarCapsule, BottomSearch, BottomSheet, Pill, PlusButton } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The phone frame from docs/design/phone.html (#66): one bar at the bottom, in
 * reach of the thumb, and everything else opens as a sheet from it. On a desktop
 * the bar is the same, only centred.
 */

export const SCREENS = [
  ["patients", "Patients", "Who is staying"],
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
  printing: boolean;
  /** What + adds on this screen ("Book a treatment", "New patient"); none on a screen with nothing to add. */
  plus: { adds: string; run: () => void } | null;
  /** How the day is grouped (#62). */
  view: string;
  setView: (v: "time" | "therapist" | "room" | "resident") => void;
  /** The one search: on the day it filters the day, on Patients the list. */
  search: { query: string; setQuery: (q: string) => void; on: boolean; setOn: (on: boolean) => void; placeholder: string; label: string; start: () => void };
  /** The attention pill: what is waiting on the day, and where tapping goes. */
  attention?: { fix: number; done: number; note: number; open: () => void } | null;
};

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function BottomBar({ activeTab, go, day, today, now, setDay, print, printing, plus, view, setView, search, attention }: Props) {
  const [sheet, setSheet] = useState<"menu" | "day" | null>(null);
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
    ]).then(([residents, days, staff, settings]: [unknown[], { staff_id: string; off: string | null }[], { id: string; name: string }[], { support_whatsapp?: string | null }]) => {
      setHelpWa(settings.support_whatsapp || null);
      const out = days.filter((d) => d.off).map((d) => staff.find((s) => s.id === d.staff_id)?.name.split(" ")[0]).filter(Boolean);
      setHints({
        patients: `${residents.length} in house`,
        team: out.length === 0 ? "Everyone in" : out.length === 1 ? `${out[0]} not in` : `${out.length} not in`,
        schedule: label(day),
      });
    }).catch(() => setHints({}));
  }, [sheet, today, day]);
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  const when = diff === 0 ? `Today · ${now}` : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
  const pick = (iso: string) => { setDay(iso); go("schedule"); setSheet(null); };
  const onDay = activeTab === "schedule";
  const pillHere = (onDay || activeTab === "patients") && !search.on;

  return (
    <>
      {pillHere && attention ? <Pill need={attention.fix} info={attention.done + attention.note} onClick={attention.open} /> : null}
      {search.on ? (
        <BottomSearch value={search.query} onChange={search.setQuery} onClose={() => { search.setOn(false); search.setQuery(""); }} placeholder={search.placeholder} label={search.label} />
      ) : (
        <Bar grow={onDay}
          left={<>
            <BarButton label="Menu" onClick={() => setSheet("menu")}><Menu className="h-6 w-6" /></BarButton>
            <BarButton label={search.label} onClick={search.start}><Search className="h-6 w-6" /></BarButton>
            {onDay ? (
              <button type="button" className="ml-1 flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-full leading-tight active:bg-secondary" aria-label={`Change day, now ${label(day)}`} onClick={() => setSheet("day")}>
                <span className="whitespace-nowrap text-base font-semibold">{label(day)}</span>
                <span className={`whitespace-nowrap text-xs ${diff === 0 ? "font-semibold text-now" : "text-muted-foreground"}`}>{when}</span>
              </button>
            ) : null}
          </>}
          right={<>
            {onDay ? <BarCapsule label="Print the day's sheets" disabled={printing} onClick={print}><Printer className="h-6 w-6" /></BarCapsule> : null}
            {plus ? <PlusButton adds={plus.adds} onClick={plus.run} /> : null}
          </>} />
      )}

      <BottomSheet open={sheet === "menu"} onOpenChange={(o) => setSheet(o ? "menu" : null)} title="">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show the day by</div>
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-background p-1">
          {(["time", "therapist", "room", "resident"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={activeTab === "schedule" && view === v}
              className="min-h-10 rounded-lg text-[13px] font-semibold text-center text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow"
              onClick={() => { setView(v); go("schedule"); setSheet(null); }}>
              {v === "resident" ? "Patient" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MENU.flatMap(([key, name, hint]) => [
            <button key={key} type="button"
              className="min-h-[60px] rounded-xl border-2 px-3 py-2 text-left"
              onClick={() => { go(key); setSheet(null); }}>
              <b className="block text-base">{name}</b>
              <span className="block text-xs text-muted-foreground">{hints[key] || hint}</span>
            </button>,
            key === "settings" && helpWa ? (
              <a key="help" href={`https://wa.me/${helpWa}`} target="_blank" rel="noopener noreferrer"
                className="min-h-[60px] rounded-xl border-2 px-3 py-2 text-left" onClick={() => setSheet(null)}>
                <b className="block text-base">Help · WhatsApp</b>
                <span className="block text-xs text-muted-foreground">Ask us anything</span>
              </a>
            ) : null,
          ])}

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
