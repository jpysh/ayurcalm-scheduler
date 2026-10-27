/**
 * Team, and Rooms: two screens from one component since #328, each with its own + (#137, docs/design/DESIGN.md; rebuilt from the kit in #285 session 6):
 * who is working today and which rooms there are, and the one thing each is asked
 * most: a therapist not in, in late or leaving early; a room not available. Each
 * opens the one Availability form (#695), already on the right kind of time, so
 * nothing moves until the admin says so. Details are one more row on the same sheet.
 */
import { outNow } from "@/lib/outNow";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import PageHead from "@/components/PageHead";
import { BottomSheet, WeekStrip } from "@/components/BottomBar";
import { useShareLink } from "@/components/ShareLink";
import { Callout, saveError, ChangeLine, Empty, ListGroup, Row, dayText, plural } from "@/components/kit";
import { roomKind } from "@/components/SetupSheets";
import type { UiRoom, UiStaff } from "@/pages/tabs/shared";

type Pick = { kind: "staff" | "room"; id: string; name: string } | null;

export function TeamRooms({ kind, staff, rooms, q, today, nowHM, opening, closing, refresh, openPerson, openRoom, openScreen, openRules, markOut }: {
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
  /** The Availability form, opened on this thing and this kind of time (#695). */
  markOut: (p: MarkOut) => void;
}) {
  const [offToday, setOffToday] = useState<Record<string, string | null>>({});
  const [roomsAll, setRoomsOff] = useState<Map<string, RoomOff>>(new Map());
  const [staffOff, setStaffOff] = useState<(RoomOff & { entity_id: string })[]>([]);
  const [week, setWeek] = useState<Week | null>(null);
  // The team is read a day at a time (#351), from the same week strip as the Day screen.
  // After closing it opens on tomorrow, as the Day screen does (#662): today's day is finished.
  const [day, setDay] = useState(nowHM >= closing ? nextDay(today) : today);
  const [pick, setPick] = useState<Pick>(null);
  const link = useShareLink();

  // Bumped by every reload, so the week's rows and gap line follow a part-day change at once (#570).
  const [weekTick, setWeekTick] = useState(0);
  const load = useCallback(() => {
    setWeekTick((n) => n + 1);
    fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: { staff_id: string; off: string | null }[]) => setOffToday(Object.fromEntries(rows.map((x) => [x.staff_id, x.off]))))
      .catch(() => setOffToday({}));
    // A fortnight ahead, so a room taken out from tomorrow says so on its row (#659); the soonest entry wins.
    const ahead = new Date(Date.parse(`${today}T00:00:00Z`) + 13 * 86400000).toISOString().slice(0, 10);
    fetch(`${API_BASE}/timeoff?from=${today}&to=${ahead}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: (RoomOff & { entity_type: string; entity_id: string })[]) => {
        setRoomsOff(new Map(rows.filter((x) => x.entity_type === "room").sort((a, b) => (b.start_date ?? b.date ?? "").localeCompare(a.start_date ?? a.date ?? "")).map((x) => [x.entity_id, x])));
        setStaffOff(rows.filter((x) => x.entity_type === "staff").sort((a, b) => (a.start_date ?? a.date ?? "").localeCompare(b.start_date ?? b.date ?? "")));
      })
      .catch(() => { setRoomsOff(new Map()); setStaffOff([]); });
  }, [today]);
  useEffect(() => { load(); }, [load]);
  // Saved in the shared form, so this list hears about it the way the Day does.
  useEffect(() => { const on = () => { void refresh(); load(); }; window.addEventListener("timeoff-changed", on); return () => window.removeEventListener("timeoff-changed", on); }, [load, refresh]);
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
    return d && d.capacity ? `${booked(d.booked, d.capacity)} · ${roomKind(r)}` : roomKind(r);
  };
  // A part of today that has ended is over, not out (#743).
  const roomsOff = new Map([...roomsAll].filter(([, e]) => !((e.end_date ?? e.date ?? "").slice(0, 10) === today && e.end_time && e.end_time <= nowHM)));
  const firstOut = (e: RoomOff) => (e.start_date ?? e.date ?? "").slice(0, 10);
  const roomsOut = rooms.filter((r) => { const e = roomsOff.get(String(r.id)); return roomActive(r) && e && outNow(e, today, nowHM); }).length;

  /** A room back in use deletes the day's entry; Undo puts the same entry back (#572). */
  async function backInUse(id: string, name: string, e: RoomOff) {
    close();
    const res = await fetch(`${API_BASE}/timeoff/${e.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(await saveError(res)); return; }
    await refresh();
    load();
    toast(`${name} back in use`, {
      action: { label: "Undo", onClick: async () => {
        const back = await fetch(`${API_BASE}/timeoff`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "room", entity_id: id, date: e.date?.slice(0, 10), start_date: e.start_date?.slice(0, 10) ?? null, end_date: e.end_date?.slice(0, 10) ?? null, start_time: e.start_time, end_time: e.end_time, description: e.description }) }).catch(() => null);
        if (!back?.ok) toast.error(back ? await saveError(back, "That could not be undone.") : "That could not be undone.");
        await refresh(); load();
      } },
    });
  }
  /** "Out of use from 14:00", "On leave until Wed 14 Oct", by the entry's own times and days: a room's word or a person's (#1126). */
  const outLine = (e: RoomOff, word = "Out of use") => {
    const last = (e.end_date ?? e.date ?? "").slice(0, 10);
    if (firstOut(e) > today) return `${word} ${dayText(firstOut(e))}${last > firstOut(e) ? ` to ${dayText(last)}` : ""}`;
    if (last > today) return `${word} until ${dayText(last)}`;
    const fromT = e.start_time && e.start_time > opening ? e.start_time : null, toT = e.end_time && e.end_time < closing ? e.end_time : null;
    return fromT && toT ? `${word} ${fromT}–${toT}` : fromT ? `${word} from ${fromT}` : toT ? `${word} until ${toT}` : `${word} today`;
  };
  // A leave still to come, so nobody books the same days again (#737).
  const nextOff = (id: string) => { const e = staffOff.find((x) => x.entity_id === id && firstOut(x) > day); return e ? outLine(e, "On leave") : undefined; };
  // On the row only a week ahead, in grey (#751): red is kept for who is not in today.
  const soonOff = (id: string) => { const e = staffOff.find((x) => x.entity_id === id && firstOut(x) > day && firstOut(x) <= addDays(day, 7)); return e ? outLine(e, "On leave") : undefined; };
  // Their own hours that day (#571): a time at the edge of their shift changes nothing.
  const shift = pick?.kind === "staff" && on >= 0 ? week!.rows.find((r) => r.id === pick.id)?.days[on] : undefined;
  const sStart = shift?.start || opening, sEnd = shift?.end || closing;
  const close = () => setPick(null);
  const none = !team.length && !roomRows.length && !idle.length;

  return (
    <div>
      {isTeam ? <>
        <PageHead title="Staff" note={day === today ? `${staff.filter(staffActive).length - notIn.length} in${notIn.length ? ` · ${notIn.length} on leave` : ""}` : `${on < 0 ? "…" : inOn} in on ${dayText(day)}`} gear={{ label: "What needs you: staff rules", run: openRules }} />
        <WeekStrip day={day} today={today} setDay={setDay} stamp={staff} />
      </> : <PageHead title="Rooms" note={`${plural(rooms.filter(roomActive).length, "room")}${roomsOut ? ` · ${roomsOut} out` : ""}`} />}
      {/* With nobody on the list yet, "No staff yet" below already says it. */}
      {isTeam && on >= 0 && week!.gaps[on].length && !ql && staff.some(staffActive) ? (
        <div className="mt-3"><Callout tone="notice" title="Too few therapists in">{week!.gaps[on].map((g) => `${g.start}–${g.end} · ${g.in ? `only ${g.in} in` : "no one in"}`).join("; ")}</Callout></div>
      ) : null}
      {none ? <Empty text={ql ? (isTeam ? "No one matches." : "No room matches.") : isTeam ? "No staff yet. Tap + to add someone." : "No rooms yet. Tap + to add one."} help={!ql && isTeam ? "s6-share-with-staff" : undefined} /> : null}
      {([["Doctors", doctors], ["Therapists", therapists]] as const).map(([title, list]) => list.length ? (
        <ListGroup key={title} title={title} count={list.length}>
          {list.map((s) => {
            const d = dayOf(s);
            const away = d?.state === "away" || d?.state === "off";
            return (
              <Row key={s.id} title={away ? <span className="text-muted-foreground">{s.name}</span> : s.name} facts={[dayLine(d), soonOff(String(s.id))].filter(Boolean).join(" · ")}
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
        note={pick?.kind === "room" ? "What would you like to do with this room?" : day === today ? "What changes for them today?" : `What changes for them on ${dayText(day)}?`}>
        {pick?.kind === "room" ? (
          <ListGroup>
            {roomsOff.has(pick.id) ? <Row title="Available again" facts={outLine(roomsOff.get(pick.id)!)} trailing="›" onClick={() => backInUse(pick.id, pick.name, roomsOff.get(pick.id)!)} /> : null}
            <Row title="Not available…" facts="From now, part of a day or some days" trailing="›" onClick={() => { close(); markOut({ type: "Room", entity: pick.id }); }} />
            <Row title="Details" facts="Name and what it has" trailing="›" onClick={() => { close(); openRoom(pick.id); }} />
          </ListGroup>
        ) : pick ? (
          <ListGroup>
            <Row title={day === today ? "Not in from now" : "Not in that day"} facts="Choose what to do with what they miss" trailing="›" onClick={() => { close(); markOut(day === today ? { type: "Staff", entity: pick.id, mode: "now" } : { type: "Staff", entity: pick.id, mode: "days", date: day }); }} />
            <Row title="In late" facts="Choose the time they start" trailing="›" onClick={() => { close(); markOut({ type: "Staff", entity: pick.id, mode: "part", date: day, startTime: sStart, endTime: day === today && nowHM > sStart ? nowHM : shiftBy(sStart, 60), description: "In late" }); }} />
            <Row title="Leaving early" facts="Choose the time they leave" trailing="›" onClick={() => { close(); markOut({ type: "Staff", entity: pick.id, mode: "part", date: day, startTime: shiftBy(sEnd, -60), endTime: sEnd, description: "Leaving early" }); }} />
            <Row title={day === today ? "Away another day" : "Away for days"} facts={nextOff(pick.id) ?? "Choose the days"} trailing="›" onClick={() => { close(); markOut({ type: "Staff", entity: pick.id, mode: "days", date: day === today ? nextDay(today) : day }); }} />
            <Row title="Share their link" facts="Their day on their own phone" trailing="›" onClick={() => { close(); link.share("staff", pick.id, pick.name); }} />
            <Row title="Make a new link" facts="The old one stops working" trailing="›" onClick={() => { close(); link.share("staff", pick.id, pick.name, true); }} />
            <Row title="Details and therapies" facts="Name, role, gender, phone" trailing="›" onClick={() => { close(); openPerson(pick.id); }} />
          </ListGroup>
        ) : null}
      </BottomSheet>
      {link.sheet}
    </div>
  );
}

/** "13:00" moved by minutes; the form opens on an hour of their shift, never all of it (#747). */
const shiftBy = (hm: string, by: number) => { const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + by; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** The day after a YYYY-MM-DD, as one. */
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd) + n * 86400000).toISOString().slice(0, 10);
const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86400000).toISOString().slice(0, 10);

/** What the Availability form opens on: the thing, and which kind of time with what filled in. */
export type MarkOut = { type: "Staff" | "Room" | "Therapy" | "GuestRoom" | "Patient"; entity: string; mode?: "now" | "part" | "days"; date?: string; startTime?: string; endTime?: string; description?: string };
type RoomOff = { id: string; date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string | null; end_time: string | null; description?: string | null };
type Day = { state: "in" | "part" | "away" | "off"; start?: string; end?: string; why?: string; booked: number; capacity: number };
type Week = { start: string; days: string[]; rows: { id: string; name: string; role: string; days: Day[] }[]; gaps: { start: string; end: string; in: number }[][]; rooms: { id: string; days: { booked: number; capacity: number }[] }[] };
/** "Free all day" and "Busy 7h of 11h" read at a glance (#806, #1078). */
const booked = (b: number, cap: number) => (b ? `Busy ${hrs(b)} of ${hrs(cap)}` : "Free all day");
const hrs = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);
/** Over 90% leaves no room for a swap, under 25% is someone free to take one (#351); words, not a flag, as neither needs doing now. */
// "1h 20m of 6h booked" already says how light a day is; only a nearly full one is worth a word (#463, #635).
const load = (d: Day) => d.capacity && d.booked / d.capacity > 0.9 ? " · nearly full" : "";
/** "07:00–15:00 · 5h of 8h booked"; away with the reason; a day off says so. */
const dayLine = (d?: Day) => !d ? undefined
  : d.state === "off" ? "Day off"
  : d.state === "away" ? (d.why ? `On leave · ${d.why}` : "On leave")
  : `${d.start}–${d.end} · ${booked(d.booked, d.capacity)}${load(d)}${d.state === "part" ? ` · ${(d.why || "part of the day").toLowerCase()}` : ""}`;
