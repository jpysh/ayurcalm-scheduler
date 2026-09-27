/**
 * The day as one list (#62), built to docs/design/phone.html: hour groups with
 * sticky headers, finished treatments dimmed above, a line at now, and the
 * screen opening there. The same rows regroup by therapist, room or resident.
 * Everything shown comes from the server's appointments; the list only sorts.
 */
import { useEffect } from "react";

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

// One colour per therapist, as the design does; kept away from red and orange,
// which mean attention and now.
const COLOURS = ["#4C7A9E", "#9A5E86", "#5E8A5A", "#8C7A5B", "#3E7F86", "#7A6AA8", "#6B7A8F", "#8A8F3E"];
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
};

export default function DayList({ appointments, isToday, nowMinutes: NOW, view, setView, query, patients, roomsList, staff, therapyNameById, onOpen, onNotIn, headerAction }: Props) {
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
    const el = document.getElementById("nowhour");
    window.scrollTo({ top: el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 110) : 0 });
  }, [view, q, isToday, appointments.length]);

  const withText = (r: Row, except?: string) => {
    const others = r.team.filter((t) => t.id !== except).map((t) => t.name);
    return others.length ? `with ${others.join(" & ")}` : "no therapist";
  };

  const rowEl = (r: Row, top = r.who, line = `${r.therapy} · ${withText(r)}`) => {
    const p = past(r), n = now(r);
    const stripe = r.team.length > 1 ? `linear-gradient(${r.team[0].colour} 50%, ${r.team[1].colour} 50%)` : r.team[0]?.colour || "#8A979C";
    return (
      <button key={`${r.a.id}-${top}`} type="button" onClick={() => onOpen(r.a)}
        className="flex w-full gap-2.5 items-stretch min-h-[54px] py-2 pr-3 border-b border-border last:border-b-0 bg-card text-left">
        <span className={`w-1 rounded-r flex-none ${p ? "opacity-35" : ""}`} style={{ background: stripe }} />
        <span className={`w-12 flex-none tabular-nums text-[15px] leading-tight ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
          {hm(r.st)}
          <small className={`block text-xs whitespace-nowrap ${n ? "text-now font-bold" : "font-normal text-muted-foreground"}`}>{n ? `${r.en - NOW}m left` : hm(r.en)}</small>
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span className={`text-[16px] ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
              {r.a.status === "no_show" ? <><s>{top}</s> <span className="text-xs font-medium text-muted-foreground">didn't come</span></> : top}
            </span>
            <span className="ml-auto pt-0.5 text-xs text-muted-foreground whitespace-nowrap">{r.room}</span>
          </span>
          <span className="block text-[13px] text-muted-foreground">{line}</span>
        </span>
      </button>
    );
  };

  const nowLine = <div key="now" id="nowline" className="flex items-center h-[22px] bg-card pointer-events-none after:flex-1 after:h-0.5 after:bg-now after:content-['']">
    <b className="ml-2 rounded-md bg-now px-1.5 text-[11px] font-bold text-white tabular-nums">{hm(NOW)}</b>
  </div>;
  const group = "rounded-xl overflow-hidden bg-card";
  const sticky = "sticky top-0 z-[2] bg-background flex items-baseline gap-2 px-1 pt-3 pb-1.5";

  let body: React.ReactNode;
  if (view === "time") {
    const hours = [...new Set(rows.map((r) => Math.floor(r.st / 60)))];
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
          <div id={nowH ? "nowhour" : undefined} className={sticky}>
            <b className={`text-[15px] tabular-nums ${done ? "text-muted-foreground" : nowH ? "text-now" : ""}`}>{hm(H * 60)}</b>
            <span className="text-xs text-muted-foreground">{g.length} starting{done ? " · done" : ""}</span>
          </div>
          <div className={group}>{items}</div>
        </section>
      );
    });
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
          <div className={`${sticky} justify-between text-[13px] font-bold`}>
            {g.label}
            <span className="flex items-baseline gap-2 font-medium text-muted-foreground whitespace-nowrap">
              {summary}
              {view === "therapist" && onNotIn && left.length ? (
                <button type="button" aria-label={`${g.label} not in`} className="min-h-9 px-2 font-semibold text-primary" onClick={() => onNotIn(g.id!, g.label)}>Not in</button>
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
      {view === "time" ? (
        <div className="sticky top-0 z-[3] bg-background flex justify-between items-baseline px-1 pt-3 pb-1.5 text-[13px] text-muted-foreground">
          <b className="text-[15px] text-foreground">{isToday ? "Today" : "The day"}</b>
          <span className="flex items-center gap-2">{rows.length} treatments{headerAction}</span>
        </div>
      ) : (
        <div className="flex justify-between items-center px-1 pt-3 text-sm font-semibold">
          By {view}
          <button type="button" className="min-h-9 px-2.5 rounded-full font-semibold text-primary" onClick={() => setView("time")}>Back to by time</button>
        </div>
      )}
      {rows.length ? body : <div className="p-3 text-center text-[13px] text-muted-foreground">{q ? `Nothing matches "${query}" on this day.` : "Nothing booked on this day."}</div>}
      {rows.length ? <div className="p-3 text-center text-[13px] text-muted-foreground">End of the day</div> : null}
    </div>
  );
}
