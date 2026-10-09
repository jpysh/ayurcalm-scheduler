/**
 * Team, and Rooms: two screens from one component since #328, each with its own + (#137, docs/design/phone.html; rebuilt from the kit in #285 session 6):
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
import { BottomSheet, WeekStrip } from "@/components/BottomBar";
import { useShareLink } from "@/components/ShareLink";
import { Callout, ChangeLine, Consequence, DateRow, Empty, ListGroup, Row, SheetFoot, TimeList, dayText, plural, timesBetween } from "@/components/kit";
import { roomKind } from "@/components/SetupSheets";
import type { UiRoom, UiStaff } from "@/pages/tabs/shared";

type Pick = { kind: "staff" | "room"; id: string; name: string } | null;
type Late = "late" | "early" | "away" | null;

export function TeamRooms({ kind, staff, rooms, q, today, nowHM, opening, closing, refresh, openPerson, openRoom, openScreen, openRules }: {
  /** Which screen: the team (with the week and the centre's lists) or the rooms. */
  kind: "team" | "rooms";
  staff: UiStaff[];
  rooms: UiRoom[];
  /** The bar's search: filters the list on screen. */
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
  /** The gear on the head: the rules for what Team raises (#288). */
  openRules: () => void;
}) {
  const [offToday, setOffToday] = useState<Record<string, string | null>>({});
  const [roomsOff, setRoomsOff] = useState<Map<string, RoomOff>>(new Map());
  const [week, setWeek] = useState<Week | null>(null);
  // The team is read a day at a time (#351), from the same week strip as the Day screen.
  // After closing it opens on tomorrow, as the Day screen does (#662): today's day is finished.
  const [day, setDay] = useState(nowHM >= closing ? nextDay(today) : today);
  const [pick, setPick] = useState<Pick>(null);
  const link = useShareLink();
  const [late, setLate] = useState<Late>(null);
  const [at, setAt] = useState("");
  const [until, setUntil] = useState("");

  // Bumped by every reload, so the week's rows and gap line follow a part-day change at once (#570).
  const [weekTick, setWeekTick] = useState(0);
  const load = useCallback(() => {
    setWeekTick((n) => n + 1);
    fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: { staff_id: string; off: string | null }[]) => setOffToday(Object.fromEntries(rows.map((x) => [x.staff_id, x.off]))))
      .catch(() => setOffToday({}));
    fetch(`${API_BASE}/timeoff?from=${today}&to=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: (RoomOff & { entity_type: string; entity_id: string })[]) => setRoomsOff(new Map(rows.filter((x) => x.entity_type === "room").map((x) => [x.entity_id, x]))))
      .catch(() => setRoomsOff(new Map()));
  }, [today]);
  useEffect(() => { load(); }, [load]);
  // The week the chosen day is in, from Sunday as the strip draws it; a day in the same week needs no fetch.
  const sunday = new Date(Date.parse(`${day}T00:00:00Z`) - new Date(`${day}T00:00:00Z`).getUTCDay() * 86400000).toISOString().slice(0, 10);
  useEffect(() => {
    fetch(`${API_BASE}/staff-week?start=${sunday}`).then((r) => (r.ok ? r.json() : null)).then(setWeek).catch(() => setWeek(null));
  }, [sunday, staff, weekTick]);
  const on = week && week.start === sunday ? week.days.indexOf(day) : -1;

  const ql = q.trim().toLowerCase();
  const staffActive = (s: UiStaff) => s.status === "Active";
  const roomActive = (r: UiRoom) => r.status === "Active";
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const match = (n: string) => !ql || n.toLowerCase().includes(ql);
  const isTeam = kind === "team";
  const team = isTeam ? staff.filter((s) => staffActive(s) && match(s.name)).sort(byName) : [];
  const dayOf = (s: UiStaff) => (on < 0 ? undefined : week!.rows.find((r) => r.id === String(s.id))?.days[on]);
  const doctors = team.filter((s) => s.role === "doctor"), therapists = team.filter((s) => s.role !== "doctor");
  const inOn = team.filter((s) => { const d = dayOf(s); return d && (d.state === "in" || d.state === "part"); }).length;
  const notIn = staff.filter((s) => staffActive(s) && offToday[String(s.id)]);
  const roomRows = isTeam ? [] : rooms.filter((r) => roomActive(r) && match(r.name)).sort(byName);
  const idle = isTeam
    ? staff.filter((s) => !staffActive(s) && match(s.name)).map((s) => ({ kind: "staff" as const, id: String(s.id), name: s.name, facts: "Not working here now" })).sort(byName)
    : rooms.filter((r) => !roomActive(r) && match(r.name)).map((r) => ({ kind: "room" as const, id: String(r.id), name: r.name, facts: "Out of use" })).sort(byName);
  /** "6h 15m of 11h booked · table room", for the day chosen. */
  const roomLine = (r: UiRoom) => {
    const d = on < 0 ? undefined : week!.rooms.find((x) => x.id === String(r.id))?.days[on];
    return d && d.capacity ? `${hrs(d.booked)} of ${hrs(d.capacity)} booked · ${roomKind(r)}` : roomKind(r);
  };
  const roomsOut = rooms.filter((r) => roomActive(r) && roomsOff.has(String(r.id))).length;

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
    const told = what === "Leave" || what === "Out of use" ? `${name} ${what === "Leave" ? "away" : "out of use"} ${days.start === days.end ? dayText(days.start) : `${dayText(days.start)} to ${dayText(days.end)}`}` : `${name}: ${what.toLowerCase()}${days.start === today ? "" : ` · ${dayText(days.start)}`}`;
    toast(`${told}${moved ? ` · ${moved} moved` : ""}`, {
      action: { label: "Undo", onClick: async () => { await fetch(`${API_BASE}/timeoff/${body.id}`, { method: "DELETE" }); await refresh(); load(); } },
    });
  }

  /** A room back in use deletes the day's entry; Undo puts the same entry back (#572). */
  async function backInUse(id: string, name: string, e: RoomOff) {
    close();
    const res = await fetch(`${API_BASE}/timeoff/${e.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("That could not be saved."); return; }
    await refresh();
    load();
    toast(`${name} back in use`, {
      action: { label: "Undo", onClick: async () => {
        await fetch(`${API_BASE}/timeoff`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "room", entity_id: id, date: e.date?.slice(0, 10), start_date: e.start_date?.slice(0, 10) ?? null, end_date: e.end_date?.slice(0, 10) ?? null, start_time: e.start_time, end_time: e.end_time, description: e.description }) });
        await refresh(); load();
      } },
    });
  }
  /** "Out of use from 14:00", "until 14:00", "until Wed 14 Oct", by the entry's own times and days. */
  const outLine = (e: RoomOff) => {
    const last = (e.end_date ?? e.date ?? "").slice(0, 10);
    if (!e.recurrence && last > today) return `Out of use until ${dayText(last)}`;
    const fromT = e.start_time && e.start_time > opening ? e.start_time : null, toT = e.end_time && e.end_time < closing ? e.end_time : null;
    return fromT && toT ? `Out of use ${fromT}–${toT}` : fromT ? `Out of use from ${fromT}` : toT ? `Out of use until ${toT}` : "Out of use today";
  };
  // Their own hours that day (#571): a time at the edge of their shift changes nothing.
  const shift = pick?.kind === "staff" && on >= 0 ? week!.rows.find((r) => r.id === pick.id)?.days[on] : undefined;
  const sStart = shift?.start || opening, sEnd = shift?.end || closing;
  const times = timesBetween(sStart, sEnd, 15);
  const changed = !!at && (late === "away" ? !!until && until >= at : at !== (late === "late" ? sStart : sEnd));
  const [impact, setImpact] = useState<number | null>(null);
  useEffect(() => {
    setImpact(null);
    if (!pick || pick.kind !== "staff" || !late || !changed) return;
    const q = late === "away" ? `from=${at}&to=${until}` : `from=${day}&to=${day}&${late === "late" ? "before" : "after"}=${at}`;
    let stale = false;
    fetch(`${API_BASE}/timeoff/impact?staff_id=${pick.id}&${q}`).then((r) => (r.ok ? r.json() : null)).then((r) => { if (!stale) setImpact(typeof r?.treatments === "number" ? r.treatments : null); }).catch(() => {});
    return () => { stale = true; };
  }, [pick, late, at, until, day, changed]);
  const consequence = impact === null ? null : <Consequence>{impact ? `${plural(impact, "treatment")} will need a new therapist` : "No treatments to move"}</Consequence>;
  const from = nowHM > opening ? nowHM : null;
  const close = () => { setPick(null); setLate(null); };
  const none = !team.length && !roomRows.length && !idle.length;

  return (
    <div>
      {isTeam ? <>
        <PageHead title="Team" note={day === today ? `${staff.filter(staffActive).length - notIn.length} in${notIn.length ? ` · ${notIn.length} not in` : ""}` : `${on < 0 ? "…" : inOn} in on ${dayText(day)}`} gear={{ label: "What needs you: team rules", run: openRules }} />
        <WeekStrip day={day} today={today} setDay={setDay} />
      </> : <PageHead title="Rooms" note={`${plural(rooms.filter(roomActive).length, "room")}${roomsOut ? ` · ${roomsOut} out` : ""}`} />}
      {isTeam && on >= 0 && week!.gaps[on].length && !ql ? (
        <div className="mt-3"><Callout tone="notice" title="Too few therapists in">{week!.gaps[on].map((g) => `${g.start}–${g.end} · ${g.in ? `only ${g.in} in` : "no one in"}`).join("; ")}</Callout></div>
      ) : null}
      {none ? <Empty text={ql ? (isTeam ? "No one matches." : "No room matches.") : isTeam ? "No one in the team yet. Tap + to add someone." : "No rooms yet. Tap + to add one."} /> : null}
      {([["Doctors", doctors], ["Therapists", therapists]] as const).map(([title, list]) => list.length ? (
        <ListGroup key={title} title={title} count={list.length}>
          {list.map((s) => {
            const d = dayOf(s);
            const away = d?.state === "away" || d?.state === "off";
            return (
              <Row key={s.id} title={away ? <s className="text-muted-foreground">{s.name}</s> : s.name} facts={dayLine(d)}
                flag={day === today && offToday[String(s.id)] && !away ? "Not in today" : undefined} trailing="›"
                onClick={() => (day < today ? openPerson(String(s.id)) : setPick({ kind: "staff", id: String(s.id), name: s.name }))} />
            );
          })}
        </ListGroup>
      ) : null)}
      {roomRows.length ? (
        <ListGroup title="Rooms" count={roomRows.length}>
          {roomRows.map((r) => <Row key={r.id} title={r.name} facts={roomLine(r)} flag={roomsOff.has(String(r.id)) ? outLine(roomsOff.get(String(r.id))!) : undefined} trailing="›" onClick={() => setPick({ kind: "room", id: String(r.id), name: r.name })} />)}
        </ListGroup>
      ) : null}
      {idle.length ? (
        <ListGroup title="Not in use" count={idle.length}>
          {idle.map((x) => <Row key={`${x.kind}${x.id}`} title={x.name} facts={x.facts} trailing="›" onClick={() => (x.kind === "staff" ? openPerson(x.id) : openRoom(x.id))} />)}
        </ListGroup>
      ) : null}
      {isTeam ? (
        <ListGroup title="The centre's lists">
          <div className="px-3">
            <ChangeLine label="Therapies" value="What the centre offers" onClick={() => openScreen("therapies")} />
            <ChangeLine label="Classes and events" value="The daily round" onClick={() => openScreen("events")} />
          </div>
        </ListGroup>
      ) : null}

      <BottomSheet open={!!pick} onOpenChange={(o) => { if (!o) close(); }} title={pick?.name || ""}
        note={pick?.kind === "room" ? (late === "away" ? "Which days is it out of use?" : "What would you like to do with this room?") : late === null ? (day === today ? "What changes for them today?" : `What changes for them on ${dayText(day)}?`) : late === "away" ? "Which days are they away?" : late === "late" ? "When do they start?" : "When do they leave?"}
        foot={pick && late === "away" ? <SheetFoot ok={changed} save={() => takeOut(pick.kind, pick.id, pick.name, null, null, pick.kind === "room" ? "Out of use" : "Leave", { start: at, end: until })} label={pick.kind === "room" ? "Mark out of use, move what is booked" : "Mark leave, move what they miss"} />
          : pick && late ? <SheetFoot ok={changed} save={() => (late === "late" ? takeOut("staff", pick.id, pick.name, opening, at, `In late, at ${at}`, { start: day, end: day }) : takeOut("staff", pick.id, pick.name, at, closing, `Leaving early, at ${at}`, { start: day, end: day }))} label="Move what they miss" /> : undefined}>
        {pick?.kind === "room" && late === null ? (
          <ListGroup>
            {roomsOff.has(pick.id) && !roomsOff.get(pick.id)!.recurrence ? <Row title="Back in use" facts={outLine(roomsOff.get(pick.id)!)} trailing="›" onClick={() => backInUse(pick.id, pick.name, roomsOff.get(pick.id)!)} />
              : <Row title="Out of use from now" facts="Moves what is booked in it" trailing="›" onClick={() => takeOut("room", pick.id, pick.name, from, null, "Out of use from now")} />}
            <Row title="Out of use for days" facts="Choose the days" trailing="›" onClick={() => { setLate("away"); setAt(day); setUntil(day); }} />
            <Row title="Details" facts="Name and what it has" trailing="›" onClick={() => { close(); openRoom(pick.id); }} />
          </ListGroup>
        ) : pick && late === null ? (
          <ListGroup>
            <Row title={day === today ? "Not in from now" : "Not in that day"} facts="Moves what they miss" trailing="›" onClick={() => takeOut("staff", pick.id, pick.name, day === today ? from : null, null, day === today ? "Not in from now" : "Not in", { start: day, end: day })} />
            <Row title="In late" facts="Choose the time they start" trailing="›" onClick={() => { setLate("late"); setAt(day === today && nowHM > sStart ? nowHM : sStart); }} />
            <Row title="Leaving early" facts="Choose the time they leave" trailing="›" onClick={() => { setLate("early"); setAt(sEnd); }} />
            <Row title={day === today ? "Away another day" : "Away for days"} facts="Choose the days" trailing="›" onClick={() => { const t = day === today ? nextDay(today) : day; setLate("away"); setAt(t); setUntil(t); }} />
            <Row title="Share their link" facts="Their day on their own phone" trailing="›" onClick={() => { close(); link.share("staff", pick.id, pick.name); }} />
            <Row title="Make a new link" facts="The old one stops working" trailing="›" onClick={() => { close(); link.share("staff", pick.id, pick.name, true); }} />
            <Row title="Details and therapies" facts="Name, role, gender, phone" trailing="›" onClick={() => { close(); openPerson(pick.id); }} />
          </ListGroup>
        ) : pick && late === "away" ? (
          <div className="grid grid-cols-2 gap-3">
            <DateRow label="From" value={at} min={today} onChange={(d) => { setAt(d); if (until < d) setUntil(d); }} />
            <DateRow label="To" value={until} min={at} onChange={setUntil} />
            <div className="col-span-2">{consequence}</div>
          </div>
        ) : pick ? (
          <><TimeList label={late === "late" ? "In at" : "Leaving at"} times={times} value={at} onChange={setAt} />{consequence}</>
        ) : null}
      </BottomSheet>
      {link.sheet}
    </div>
  );
}

/** The day after a YYYY-MM-DD, as one. */
const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86400000).toISOString().slice(0, 10);

type RoomOff = { id: string; date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string | null; end_time: string | null; recurrence?: string | null; description?: string | null };
type Day = { state: "in" | "part" | "away" | "off"; start?: string; end?: string; why?: string; booked: number; capacity: number };
type Week = { start: string; days: string[]; rows: { id: string; name: string; role: string; days: Day[] }[]; gaps: { start: string; end: string; in: number }[][]; rooms: { id: string; days: { booked: number; capacity: number }[] }[] };
const hrs = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);
/** Over 90% leaves no room for a swap, under 25% is someone free to take one (#351); words, not a flag, as neither needs doing now. */
// "1h 20m of 6h booked" already says how light a day is; only a nearly full one is worth a word (#463, #635).
const load = (d: Day) => d.capacity && d.booked / d.capacity > 0.9 ? " · nearly full" : "";
/** "07:00–15:00 · 5h of 8h booked"; away with the reason; a day off says so. */
const dayLine = (d?: Day) => !d ? undefined
  : d.state === "off" ? "Day off"
  : d.state === "away" ? `Away · ${d.why || "leave"}`
  : `${d.start}–${d.end} · ${hrs(d.booked)} of ${hrs(d.capacity)} booked${load(d)}${d.state === "part" ? ` · ${(d.why || "part of the day").toLowerCase()}` : ""}`;
