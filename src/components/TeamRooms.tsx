/**
 * Team and rooms (#137, docs/design/phone.html; rebuilt from the kit in #285 session 6):
 * who is working today and which rooms there are, and the one thing each is asked
 * most: a therapist not in, in late or leaving early; a room out of use. Each is
 * time off from now, the same as the day's headings, so the server moves what it
 * touches at once, and Undo removes it. Details and therapies are one more row on
 * the same sheet, so editing is a tap on the thing itself.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import PageHead from "@/components/PageHead";
import { BottomSheet } from "@/components/BottomBar";
import { shareLink } from "@/lib/shareLink";
import { ChangeLine, DateRow, Empty, ListGroup, Row, SheetFoot, TimeList, timesBetween } from "@/components/kit";
import { roomSub } from "@/components/SetupSheets";
import type { UiRoom, UiStaff } from "@/pages/tabs/shared";

type Pick = { kind: "staff" | "room"; id: string; name: string } | null;
type Late = "late" | "early" | "away" | null;

export function TeamRooms({ staff, rooms, q, today, nowHM, opening, closing, refresh, openPerson, openRoom, openScreen }: {
  staff: UiStaff[];
  rooms: UiRoom[];
  /** The bar's search: filters both lists. */
  q: string;
  /** YYYY-MM-DD and "14:35", on the centre's clock. */
  today: string;
  nowHM: string;
  opening: string;
  closing: string;
  refresh: () => Promise<void>;
  /** The details sheets, for changing a therapist or a room. */
  openPerson: (id: string) => void;
  openRoom: (id: string) => void;
  openScreen: (screen: "therapies" | "events") => void;
}) {
  const [offToday, setOffToday] = useState<Record<string, string | null>>({});
  const [week, setWeek] = useState<Week | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const [pick, setPick] = useState<Pick>(null);
  const [late, setLate] = useState<Late>(null);
  const [at, setAt] = useState("");
  const [until, setUntil] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: { staff_id: string; off: string | null }[]) => setOffToday(Object.fromEntries(rows.map((x) => [x.staff_id, x.off]))))
      .catch(() => setOffToday({}));
  }, [today]);
  useEffect(() => { load(); }, [load]);
  // The week this day is in, from Monday: how full the team is, not what they do.
  useEffect(() => {
    const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    fetch(`${API_BASE}/staff-week?start=${monday}`).then((r) => (r.ok ? r.json() : null)).then(setWeek).catch(() => setWeek(null));
  }, [today]);

  const ql = q.trim().toLowerCase();
  const staffActive = (s: UiStaff) => s.status === "Active";
  const roomActive = (r: UiRoom) => r.status === "Active";
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const match = (n: string) => !ql || n.toLowerCase().includes(ql);
  const team = staff.filter((s) => staffActive(s) && match(s.name)).sort(byName);
  const notIn = staff.filter((s) => staffActive(s) && offToday[String(s.id)]);
  const roomRows = rooms.filter((r) => roomActive(r) && match(r.name)).sort(byName);
  const idle = [...staff.filter((s) => !staffActive(s) && match(s.name)).map((s) => ({ kind: "staff" as const, id: String(s.id), name: s.name, facts: "Not working here now" })),
    ...rooms.filter((r) => !roomActive(r) && match(r.name)).map((r) => ({ kind: "room" as const, id: String(r.id), name: r.name, facts: "Out of use" }))].sort(byName);

  /** Time off between from and until; null means the edge of the day. Days default to today. */
  async function takeOut(kind: "staff" | "room", id: string, name: string, from: string | null, until: string | null, what: string, days = { start: today, end: today }) {
    setPick(null);
    setLate(null);
    const res = await fetch(`${API_BASE}/timeoff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: kind, entity_id: id, date: days.start, start_date: days.start, end_date: days.end, start_time: from, end_time: from || until ? until || closing : null, description: what }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "That could not be saved."); return; }
    const moved = (body.replan || []).reduce((n: number, r: { moved: unknown[] }) => n + r.moved.length, 0);
    await refresh();
    load();
    toast(`${name}: ${what.toLowerCase()}${moved ? ` · ${moved} moved` : ""}`, {
      duration: 8000,
      action: { label: "Undo", onClick: async () => { await fetch(`${API_BASE}/timeoff/${body.id}`, { method: "DELETE" }); await refresh(); load(); } },
    });
  }

  const times = timesBetween(opening, closing, 15);
  const from = nowHM > opening ? nowHM : null;
  const close = () => { setPick(null); setLate(null); };
  const none = !team.length && !roomRows.length && !idle.length;

  return (
    <div>
      <PageHead title="Team and rooms" note={`${staff.filter(staffActive).length - notIn.length} in${notIn.length ? ` · ${notIn.length} not in` : ""}`} />
      {/* Always there, so the lists do not move under a tap when the week arrives. */}
      <ListGroup><Row title="This week" facts={week ? weekLine(week) : "…"} trailing="›" onClick={week ? () => setShowWeek(true) : undefined} /></ListGroup>
      {none ? <Empty text="No one or no room matches." /> : null}
      {team.length ? (
        <ListGroup title="Therapists and doctors" count={team.length}>
          {team.map((s) => (
            <Row key={s.id} title={s.name} facts={s.role === "doctor" ? "Doctor" : "Therapist"} flag={offToday[String(s.id)] ? "Not in today" : undefined} trailing="›"
              onClick={() => setPick({ kind: "staff", id: String(s.id), name: s.name })} />
          ))}
        </ListGroup>
      ) : null}
      {roomRows.length ? (
        <ListGroup title="Rooms" count={roomRows.length}>
          {roomRows.map((r) => <Row key={r.id} title={r.name} facts={roomSub(r)} trailing="›" onClick={() => setPick({ kind: "room", id: String(r.id), name: r.name })} />)}
        </ListGroup>
      ) : null}
      {idle.length ? (
        <ListGroup title="Not in use" count={idle.length}>
          {idle.map((x) => <Row key={`${x.kind}${x.id}`} title={x.name} facts={x.facts} trailing="›" onClick={() => (x.kind === "staff" ? openPerson(x.id) : openRoom(x.id))} />)}
        </ListGroup>
      ) : null}
      <ListGroup title="The centre's lists">
        <div className="px-3">
          <ChangeLine label="Therapies" value="What the centre offers" onClick={() => openScreen("therapies")} />
          <ChangeLine label="Classes and events" value="The daily round" onClick={() => openScreen("events")} />
        </div>
      </ListGroup>

      <BottomSheet open={showWeek} onOpenChange={setShowWeek} title="This week">
        {week ? <WeekList week={week} /> : null}
      </BottomSheet>

      <BottomSheet open={!!pick} onOpenChange={(o) => { if (!o) close(); }} title={pick?.name || ""}
        note={pick?.kind === "room" ? "What would you like to do with this room?" : late === null ? "What changes for them today?" : late === "away" ? "Which days are they away?" : late === "late" ? "When do they start?" : "When do they leave?"}
        foot={pick && late === "away" ? <SheetFoot ok={!!at && !!until && until >= at} save={() => takeOut("staff", pick.id, pick.name, null, null, "Leave", { start: at, end: until })} label="Mark leave, move what they miss" />
          : pick && late ? <SheetFoot ok={!!at} save={() => (late === "late" ? takeOut("staff", pick.id, pick.name, opening, at, `In late, at ${at}`) : takeOut("staff", pick.id, pick.name, at, closing, `Leaving early, at ${at}`))} label="Move what they miss" /> : undefined}>
        {pick?.kind === "room" ? (
          <ListGroup>
            <Row title="Out of use from now" facts="Moves what is booked in it" trailing="›" onClick={() => takeOut("room", pick.id, pick.name, from, null, "Out of use from now")} />
            <Row title="Details" facts="Name and what it has" trailing="›" onClick={() => { close(); openRoom(pick.id); }} />
          </ListGroup>
        ) : pick && late === null ? (
          <ListGroup>
            <Row title="Not in from now" facts="Moves what they miss" trailing="›" onClick={() => takeOut("staff", pick.id, pick.name, from, null, "Not in from now")} />
            <Row title="In late" facts="Choose the time they start" trailing="›" onClick={() => { setLate("late"); setAt(nowHM > opening ? nowHM : opening); }} />
            <Row title="Leaving early" facts="Choose the time they leave" trailing="›" onClick={() => { setLate("early"); setAt(closing); }} />
            <Row title="Away another day" facts="Choose the days" trailing="›" onClick={() => { const t = nextDay(today); setLate("away"); setAt(t); setUntil(t); }} />
            <Row title="Share their link" facts="Their day on their own phone" trailing="›" onClick={() => shareLink("staff", pick.id, pick.name)} />
            <Row title="Make a new link" facts="The old one stops working" trailing="›" onClick={() => shareLink("staff", pick.id, pick.name, true)} />
            <Row title="Details and therapies" facts="Name, role, gender, phone" trailing="›" onClick={() => { close(); openPerson(pick.id); }} />
          </ListGroup>
        ) : pick && late === "away" ? (
          <div className="grid grid-cols-2 gap-3">
            <DateRow label="From" value={at} min={today} onChange={(d) => { setAt(d); if (until < d) setUntil(d); }} />
            <DateRow label="To" value={until} min={at} onChange={setUntil} />
          </div>
        ) : pick ? (
          <TimeList label={late === "late" ? "In at" : "Leaving at"} times={times} value={at} onChange={setAt} />
        ) : null}
      </BottomSheet>
    </div>
  );
}

/** The day after a YYYY-MM-DD, as one. */
const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86400000).toISOString().slice(0, 10);

type Week = { start: string; days: string[]; rows: { id: string; name: string; role: string; week: ("in" | "part" | "away" | "off")[]; booked: number; capacity: number }[] };
const hrs = (m: number) => `${Math.round(m / 60)}h`;
const weekLine = (w: Week) => {
  const booked = w.rows.reduce((n, r) => n + r.booked, 0), cap = w.rows.reduce((n, r) => n + r.capacity, 0);
  const away = w.rows.filter((r) => r.week.includes("away")).length;
  return `${hrs(booked)} booked of ${hrs(cap)}${cap ? ` (${Math.round((100 * booked) / cap)}%)` : ""}${away ? ` · ${away} away some days` : ""}`;
};

/** One line a person: their seven days and how full their week is. */
function WeekList({ week }: { week: Week }) {
  const letter = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });
  const look = { in: "bg-primary/15 text-foreground", part: "border border-primary/50", away: "bg-destructive/15 text-destructive line-through", off: "text-muted-foreground/60" };
  return (
    <div className="-mt-1 max-h-[70dvh] overflow-y-auto">
      <p className="mb-2 text-[13px] text-muted-foreground">Week of {new Date(`${week.start}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}. Shaded: in. Outlined: part of the day. Struck through: away.</p>
      <div className="overflow-hidden rounded-xl border">
        {week.rows.map((r) => (
          <div key={r.id} className="flex min-h-[54px] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
            <span className="flex gap-0.5" aria-label={r.week.map((s, i) => `${letter(week.days[i])} ${s}`).join(", ")}>
              {r.week.map((s, i) => <span key={i} className={`grid h-6 w-5 place-items-center rounded text-xs font-semibold ${look[s]}`}>{letter(week.days[i])}</span>)}
            </span>
            <span className="w-16 text-right text-[13px] tabular-nums text-muted-foreground">{hrs(r.booked)}/{hrs(r.capacity)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
