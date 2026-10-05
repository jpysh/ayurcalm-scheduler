import { BottomSheet, Btn, Seg } from "@/components/kit";
/**
 * The day as one list (#62), built to docs/design/phone.html: hour groups with
 * sticky headers, finished treatments dimmed above, a line at now, and the
 * screen opening there. The same rows regroup by therapist, room or resident.
 * Everything shown comes from the server's appointments; the list only sorts.
 */
import { useEffect, useState } from "react";
import { DoorClosed } from "lucide-react";

type Appt = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status?: string;
};
type Named = { id: string | number; name: string };
export type DayView = "time" | "therapist" | "room" | "resident";
const VIEW_NAMES: Record<DayView, string> = { time: "Time", therapist: "Therapist", room: "Room", resident: "Patient" };

// One colour per therapist, as the design does; kept away from red and orange,
// which mean attention and now.
const COLOURS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `hsl(var(--t-${i}))`);
const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Row = { a: Appt; st: number; en: number; who: string; therapy: string; room: string; team: { id: string; name: string; colour: string }[] };

type Props = {
  appointments: Appt[];
  isToday: boolean;
  /** Minutes past midnight on the centre's clock. */
  nowMinutes: number;
  view: DayView;
  setView: (v: DayView) => void;
  query: string;
  patients: Named[];
  roomsList: Named[];
  staff: Named[];
  therapyNameById: Record<string, string>;
  onOpen: (a: Appt) => void;
  /** A therapist heading's action: not in from now (or all day, on another day), with Undo. */
  onNotIn?: (staffId: string, name: string) => void;
  headerAction?: React.ReactNode;
  /** Treatments the app moved off an absent therapist today: id → their name. */
  movedFrom?: Record<string, string>;
  /** The centre's rooms, for the day's heading. */
  roomCount?: number;
  /** The day check's problems on a treatment, shown on its row. */
  flags?: Record<string, { text: string; blocking: boolean }>;
};

export default function DayList({ appointments, isToday, nowMinutes: NOW, view, setView, query, patients, roomsList, staff, therapyNameById, onOpen, onNotIn, headerAction, movedFrom = {}, roomCount, flags = {} }: Props) {
  const [pickView, setPickView] = useState(false);
  const name = (list: Named[], id: string | null) => list.find((x) => String(x.id) === String(id))?.name || "";
  const colourOf = (id: string) => COLOURS[Math.max(0, staff.findIndex((s) => String(s.id) === id)) % COLOURS.length];
  const q = query.trim().toLowerCase();

  const rows: Row[] = appointments
    .filter((a) => a.status !== "cancelled")
    .map((a) => {
      const st = toM(a.start_time);
      const team = [a.staff_id, ...(a.co_staff_ids || [])].filter((x): x is string => Boolean(x)).map((id) => ({ id, name: name(staff, id), colour: colourOf(id) }));
      return { a, st, en: st + a.duration_minutes, who: name(patients, a.patient_id), therapy: therapyNameById[a.therapy_id] || "Treatment", room: name(roomsList, a.room_id), team };
    })
    .filter((r) => !q || [r.who, r.therapy, r.room, ...r.team.map((t) => t.name)].some((s) => s.toLowerCase().includes(q)))
    .sort((x, y) => x.st - y.st || x.room.localeCompare(y.room, undefined, { numeric: true }));

  const past = (r: Row) => isToday && r.en <= NOW;
  const now = (r: Row) => isToday && r.st <= NOW && r.en > NOW;

  // Opens at now, with the morning above: the next treatment is on the first screen.
  useEffect(() => {
    if (view !== "time" || q) return;
    // Opens on what is happening: the earliest treatment in progress, with the
    // line at now below it; with nothing in progress, the line itself.
    // A long treatment that began well before now must not push the line off
    // the screen: the line stays in the top 60% whatever is above it.
    const y = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : null);
    const first = y(document.querySelector("[data-now]")), line = y(document.getElementById("nowline"));
    const top = first ?? line;
    window.scrollTo({ top: top === null ? 0 : Math.max(0, top - 130, line === null ? 0 : line - window.innerHeight * 0.6) });
  }, [view, q, isToday, appointments.length]);

  const withText = (r: Row, except?: string) => {
    const others = r.team.filter((t) => t.id !== except).map((t) => t.name);
    return others.length ? `with ${others.join(" & ")}` : "no therapist";
  };

  const rowEl = (r: Row, top = r.who, line = `${r.therapy} · ${withText(r)}`) => {
    const p = past(r), n = now(r);
    const flag = flags[r.a.id];
    const stripe = r.team.length > 1 ? `linear-gradient(${r.team[0].colour} 50%, ${r.team[1].colour} 50%)` : r.team[0]?.colour || "hsl(var(--faint))";
    return (
      <button key={`${r.a.id}-${top}`} type="button" onClick={() => onOpen(r.a)} data-now={n || undefined} data-appt={r.a.id}
        className={`flex w-full gap-2.5 items-stretch min-h-14 py-2 pr-3 border-b border-border last:border-b-0 bg-card text-left ${flag?.blocking ? "ring-2 ring-inset ring-destructive" : ""}`}>
        <span className={`w-1 rounded-r flex-none ${p ? "opacity-35" : ""}`} style={{ background: stripe }} />
        <span className={`w-12 flex-none tabular-nums text-base leading-tight ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
          {hm(r.st)}
          {/* The end, always: a countdown in its place read as the treatment's length. */}
          <small className={`block text-sm whitespace-nowrap ${n ? "text-now font-semibold" : "font-normal text-muted-foreground"}`}>{hm(r.en)}</small>
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span className={`text-base ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
              {r.a.status === "no_show" ? <><s>{top}</s> <span className="text-sm font-medium text-muted-foreground">didn't come</span></> : top}
            </span>
            <span className="ml-auto pt-0.5 text-sm text-muted-foreground whitespace-nowrap inline-flex items-center gap-1"><DoorClosed className="h-3 w-3" aria-hidden />{r.room}</span>
          </span>
          <span className="block text-sm text-muted-foreground">{line}</span>
          {flag ? <span className={`block text-sm ${flag.blocking ? "font-semibold text-destructive" : "text-notice"}`}>{flag.text}</span> : null}
          {movedFrom[r.a.id] ? (
            <span className="flex items-center gap-1 text-sm text-notice"><i className="h-2 w-2 rounded-full bg-warning" />Was {movedFrom[r.a.id].split(" ")[0]}'s</span>
          ) : null}
        </span>
      </button>
    );
  };

  const nowLine = <div key="now" id="nowline" className="flex items-center h-6 bg-card pointer-events-none after:flex-1 after:h-0.5 after:bg-now after:content-['']">
    <b className="ml-2 rounded-md bg-now px-1.5 text-xs font-bold text-white tabular-nums">{hm(NOW)}</b>
  </div>;
  const group = "rounded-xl overflow-hidden bg-card";
  const sticky = "sticky top-[var(--strip-h,104px)] z-[2] bg-background flex items-baseline gap-2 px-1 pt-3 pb-1.5";

  let body: React.ReactNode;
  if (view === "time") {
    const hours = [...new Set(rows.map((r) => Math.floor(r.st / 60)))];
    // The line sits between what has started and what has not. When nothing
    // starts in the current hour it goes before the next hour, not nowhere.
    const nowHour = Math.floor(NOW / 60);
    const lineBefore = isToday && !hours.includes(nowHour) ? hours.find((H) => H > nowHour) ?? null : undefined;
    body = hours.map((H) => {
      const g = rows.filter((r) => Math.floor(r.st / 60) === H);
      const done = isToday && (H + 1) * 60 <= NOW && g.every(past);
      const nowH = isToday && H === Math.floor(NOW / 60);
      const items: React.ReactNode[] = [];
      let lineDone = !nowH;
      for (const r of g) {
        if (!lineDone && r.st > NOW) { items.push(nowLine); lineDone = true; }
        items.push(rowEl(r));
      }
      if (!lineDone) items.push(nowLine);
      return (
        <section key={H}>
          {lineBefore === H ? <div className="mt-3 overflow-hidden rounded-xl">{nowLine}</div> : null}
          <div id={nowH ? "nowhour" : undefined} className={sticky}>
            <b className={`text-base tabular-nums ${done ? "text-muted-foreground" : nowH ? "text-now" : ""}`}>{hm(H * 60)}</b>
            <span className="text-sm text-muted-foreground">{g.length} starting{done ? " · done" : ""}</span>
          </div>
          <div className={group}>{items}</div>
        </section>
      );
    });
    if (lineBefore === null) body = [...(body as React.ReactNode[]), <div key="end-now" className="mt-3 overflow-hidden rounded-xl">{nowLine}</div>];
  } else {
    const groups = new Map<string, { label: string; id?: string; rows: Row[] }>();
    const add = (key: string, label: string, r: Row, id?: string) => { if (!groups.has(key)) groups.set(key, { label, id, rows: [] }); groups.get(key)!.rows.push(r); };
    for (const r of rows) {
      if (view === "therapist") r.team.forEach((t) => add(t.id, t.name, r, t.id));
      else if (view === "room") add(r.room, r.room || "No room", r);
      else add(r.who, r.who, r);
    }
    body = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map((g) => {
      const left = g.rows.filter((r) => !past(r));
      const summary = `${left.length ? `${left.length} to go` : "all done"}${left[0] ? ` · next ${hm(left[0].st)}` : ""}`;
      return (
        <section key={g.label}>
          <div className={`${sticky} justify-between text-sm font-bold`}>
            {g.label}
            <span className="flex items-baseline gap-2 font-medium text-muted-foreground whitespace-nowrap">
              {summary}
              {view === "therapist" && onNotIn && left.length ? (
                <Btn kind="quiet" inline aria-label={`${g.label} not in`} onClick={() => onNotIn(g.id!, g.label)}>Not in</Btn>
              ) : null}
            </span>
          </div>
          <div className={group}>
            {g.rows.map((r) => view === "therapist" ? rowEl(r, r.who, `${r.therapy}${r.team.length > 1 ? ` · ${withText(r, g.id)}` : ""}`)
              : view === "resident" ? rowEl(r, r.therapy, withText(r)) : rowEl(r))}
          </div>
        </section>
      );
    });
  }

  return (
    <div className="flex flex-col pb-36">
      <div className="flex items-center justify-between px-1 pb-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">{rows.length} {rows.length === 1 ? "treatment" : "treatments"}{roomCount ? ` · ${roomCount} rooms` : ""}{headerAction}</span>
        <button type="button" aria-label={`Show the day by, now ${VIEW_NAMES[view]}`} onClick={() => setPickView(true)} className="-my-1.5 min-h-11 rounded-full px-3 font-semibold text-primary active:bg-secondary">By {VIEW_NAMES[view].toLowerCase()} ▾</button>
      </div>
      <BottomSheet open={pickView} onOpenChange={setPickView} title="Show the day by" note="The same treatments, grouped another way.">
        <Seg<DayView> options={[["time", "Time"], ["therapist", "Therapist"], ["room", "Room"], ["resident", "Patient"]]} value={view} onChange={(v) => { setView(v); setPickView(false); }} />
      </BottomSheet>
      {rows.length ? body : <div className="p-3 text-center text-sm text-muted-foreground">{q ? `Nothing matches "${query}" on this day.` : "Nothing booked on this day."}</div>}
      {rows.length ? <div className="p-3 text-center text-sm text-muted-foreground">End of the day</div> : null}
    </div>
  );
}
