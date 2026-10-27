/**
 * Guest rooms (#456, story s20): who sleeps where and what is free. The admin's jobs, most
 * frequent first: an enquiry call ("a room from the 12th to the 26th?"), an arrival, the
 * morning's comings and goings, a move. "Is a room free?" sits at the top for the call; below
 * it, the night chosen on the week strip, room by room. Never "Rooms": those are treatment rooms.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import PageHead from "@/components/PageHead";
import { WeekStrip } from "@/components/BottomBar";
import { Btn, DateRow, datePair, Empty, LinkRow, ListGroup, Loading, Row, SectionHead, Seg, WeekBars, dayText, money, noteText, type WeekBar } from "@/components/kit";
import { AddGuestRooms, ManageGuestRooms } from "@/components/GuestRoomManage";
import type { GuestRoomNight } from "@/components/CardSheets";

type Guest = { stay_id: string; patient_id: string; name: string; start_date: string; end_date: string; from_room?: string | null; to_room?: string | null; leaving_time?: string | null };
type Room = GuestRoomNight & { guests: Guest[] };

const DAY_MS = 86400000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const nights = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
/** Rooms in their types, in the server's order (cheapest type first). */
const byType = (rooms: Room[]) => rooms.reduce<[string, Room[]][]>((out, r) => {
  const last = out[out.length - 1];
  if (last && last[0] === r.type) last[1].push(r); else out.push([r.type, [r]]);
  return out;
}, []);
const fetchRooms = (from: string, to: string) => fetchJsonWithTimeout<Room[]>(`${API_BASE}/guest-rooms/free?from=${from}&to=${to}`).then((r) => (Array.isArray(r) ? r : []));

export function GuestRooms({ today, openPatient, newPatient, openSettings, adding, setAdding, out }: {
  /** YYYY-MM-DD on the centre's clock. */
  today: string;
  openPatient: (id: string) => void;
  /** New patient, with these dates and this room already chosen. */
  newPatient: (p: { arriving: string; leaving: string; room: string }) => void;
  /** Settings → Packages and accommodation, for a centre with no accommodation type yet. */
  openSettings: () => void;
  /** The + on the bar adds guest rooms (#559); the shell holds the state because the bar is the shell's. */
  adding: boolean;
  setAdding: (o: boolean) => void;
  /** Take a room out of use for some days: the Leave sheet with that room chosen. */
  out: (roomId: string) => React.ReactNode;
}) {
  const [managing, setManaging] = useState(false);
  const [version, setVersion] = useState(0);
  const [day, setDay] = useState(today);
  const [night, setNight] = useState<Room[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<Room[] | null>(null);
  // The week at a glance (#1213): who sleeps where for seven nights from the chosen day.
  const [view, setView] = useState<"night" | "week">("night");
  const [week, setWeek] = useState<Room[] | null>(null);
  useEffect(() => { if (view !== "week") return; setWeek(null); fetchRooms(day, addDays(day, 7)).then(setWeek); }, [view, day, version]);
  useEffect(() => { setNight(null); fetchRooms(day, addDays(day, 1)).then(setNight); }, [day, version]);
  useEffect(() => { setRange(null); if (from && to > from) fetchRooms(from, to).then(setRange); }, [from, to, version]);

  const free = night?.filter((r) => r.free).length ?? 0;
  const asking = !!from && to > from;
  const sleeping = (r: Room) => r.guests.filter((g) => g.start_date <= day && day < g.end_date);
  const leaving = (r: Room) => r.guests.filter((g) => g.end_date === day);
  const arriving = (r: Room) => sleeping(r).filter((g) => g.start_date === day);
  const markReady = async (r: Room, ready: boolean) => {
    const res = await fetch(`${API_BASE}/guest-rooms/${r.id}/ready`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: day, ready }) });
    if (res.ok) setNight((n) => n && n.map((x) => (x.id === r.id ? { ...x, ready_on: ready ? day : null } : x))); else toast.error("Not saved. Try again.");
  };
  const tonight = day === today ? "tonight" : `on ${dayText(day)}`;

  const sheets = <>
    <AddGuestRooms open={adding} onOpenChange={setAdding} onChanged={() => setVersion((v) => v + 1)} openTypes={openSettings} />
    <ManageGuestRooms open={managing} onOpenChange={setManaging} out={out} onChanged={() => setVersion((v) => v + 1)} openTypes={openSettings} />
  </>;

  if (night && !night.length) return (
    <div>
      <PageHead title="Guest rooms" />
      <Empty text="No guest rooms yet. Add the rooms patients sleep in, and every stay can have one." action={<Btn kind="primary" inline onClick={() => setAdding(true)}>Add guest rooms</Btn>} />
      {sheets}
    </div>
  );

  return (
    <div>
      <PageHead title="Guest rooms" note={night ? `${free} free ${tonight}` : undefined} />
      <SectionHead>Is a room free?</SectionHead>
      <div className={datePair}>
        <DateRow label="Arriving" value={from} min={today} onChange={(v) => { setFrom(v); if (!to || to <= v) setTo(addDays(v, 14)); }} />
        <DateRow label="Leaving" value={to} min={from ? addDays(from, 1) : today} onChange={setTo} />
      </div>
      {asking ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className={noteText}>{range ? `${range.filter((r) => r.free).length || "None"} free for all ${nights(from, to)} nights, ${dayText(from)} to ${dayText(to)}` : "Checking…"}</p>
            <Btn kind="quiet" inline className="-mr-2" onClick={() => { setFrom(""); setTo(""); }}>Clear</Btn>
          </div>
          {range === null ? <Loading rows={3} /> : range.some((r) => r.free) ? byType(range.filter((r) => r.free)).map(([type, rooms]) => (
            <ListGroup key={type} title={`${type}${rooms[0].price_per_day ? ` · ${money(rooms[0].price_per_day)} a night` : ""}`} count={`${rooms.length} free`}>
              {rooms.map((r) => <Row key={r.id} title={r.name} facts={r.beds > 1 ? `${r.beds} beds` : undefined} trailing="Add a patient ›" onClick={() => newPatient({ arriving: from, leaving: to, room: r.id })} />)}
            </ListGroup>
          )) : <Empty text="Every guest room is taken on at least one of those nights. Try other dates." />}
        </div>
      ) : (<>
        <div className="mt-3"><WeekStrip day={day} today={today} setDay={setDay} /></div>
        <div className="mt-2"><Seg<"night" | "week"> value={view} onChange={setView} options={[["night", "This night"], ["week", "Seven nights"]]} /></div>
        {view === "week" ? (week === null ? <Loading rows={6} /> : byType(week).map(([type, rooms]) => (
          <div key={type} className="mt-3">
            <SectionHead>{type}</SectionHead>
            <WeekBars days={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ label: new Date(`${addDays(day, n)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow", day: "numeric", timeZone: "UTC" }), today: addDays(day, n) === today }))}
              rows={rooms.map((r) => {
                // One lane per bed: each guest takes the first lane free for their nights.
                const lanes: WeekBar[][] = [];
                // Only nights inside the week: a guest who leaves this morning slept here before it.
                for (const g of [...r.guests].filter((x) => nights(day, x.end_date) > 0 && nights(day, x.start_date) < 7).sort((a, b) => a.start_date.localeCompare(b.start_date))) {
                  const bar: WeekBar = { key: `${g.stay_id}${g.start_date}`, from: nights(day, g.start_date), to: nights(day, g.end_date), text: g.name.split(" ")[0], onClick: () => openPatient(g.patient_id) };
                  const lane = lanes.find((l) => l.every((b) => b.to <= bar.from || bar.to <= b.from));
                  if (lane) lane.push(bar); else lanes.push([bar]);
                }
                return { id: r.id, label: r.name, lanes, onEmpty: r.out ? undefined : (n: number) => newPatient({ arriving: addDays(day, n), leaving: addDays(day, n + 13), room: r.id }) };
              })} />
          </div>
        ))) : null}
        {/* The morning's housekeeping (#456 part 4): the rooms to make up, each marked ready when done (#1199), and the rooms someone comes into. */}
        {night ? (() => {
          // A shared room where one guest stays on is not empty, but a bed left and taken the same day still needs making up (#1209).
          const out = night.filter((r) => leaving(r).length && (arriving(r).length || !sleeping(r).some((g) => g.start_date !== day)));
          const into = night.filter((r) => arriving(r).length).map((r) => r.name);
          return <>
            {into.length ? <p className={`px-1 pt-2 ${noteText}`}>Arriving: {into.join(", ")}</p> : null}
            {out.length ? <ListGroup title={`To make up${day === today ? " today" : ""}`} count={`${out.filter((r) => r.ready_on === day).length} of ${out.length} ready`}>
              {out.map((r) => <Row key={r.id} title={r.name} facts={arriving(r).length ? `${arriving(r).map((g) => g.name).join(", ")} arrives` : undefined}
                trailing={r.ready_on === day ? "Ready ✓" : "Mark ready"} onClick={() => markReady(r, r.ready_on !== day)} />)}
            </ListGroup> : null}
          </>;
        })() : null}
        {view === "week" ? null : night === null ? <Loading rows={6} /> : byType(night).map(([type, rooms]) => (
          <ListGroup key={type} title={type} count={`${rooms.filter((r) => r.free).length} free`}>
            {rooms.map((r) => {
              const inIt = sleeping(r);
              const out = leaving(r);
              // What a room needs this morning first: who arrives, who leaves (the room to make up), then who is in.
              const facts: string[] = [
                ...arriving(r).map((g) => `${g.name} ${g.from_room ? `moves in from ${g.from_room}` : "arrives"} · until ${dayText(g.end_date)}`),
                ...inIt.filter((g) => g.start_date !== day).map((g) => `${g.name} · until ${dayText(g.end_date)}`),
                ...out.map((g) => `${g.name} ${g.to_room ? `moves to ${g.to_room}` : "leaves"}${day === today ? " today" : ""}${g.leaving_time ? ` at ${g.leaving_time}` : ""}`),
              ];
              // Out of use (#563) first: it is why the room is not offered.
              if (r.out) facts.unshift(`Out of use${r.out.reason ? `: ${r.out.reason}` : ""} · until ${dayText(r.out.until)}`);
              const spare = r.beds - inIt.length;
              return <Row key={r.id} title={r.name} facts={facts.join(" · ") || undefined}
                trailing={r.out && !inIt.length ? "Out" : !inIt.length ? (out.find((g) => g.leaving_time) ? `Free from ${out.find((g) => g.leaving_time)!.leaving_time}` : "Free") : spare > 0 ? `${spare} bed free` : undefined}
                onClick={r.out && !inIt.length ? undefined : () => (inIt[0] ? openPatient(inIt[0].patient_id) : newPatient({ arriving: day, leaving: addDays(day, 13), room: r.id }))} />;
            })}
          </ListGroup>
        ))}
        <ListGroup title="The centre's lists"><LinkRow label="Guest rooms" value="Names and beds" onClick={() => setManaging(true)} /></ListGroup>
      </>)}
      {sheets}
    </div>
  );
}
