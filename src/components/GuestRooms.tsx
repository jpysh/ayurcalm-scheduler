/**
 * Guest rooms (#456, story s20): who sleeps where and what is free. The admin's jobs, most
 * frequent first: an enquiry call ("a room from the 12th to the 26th?"), an arrival, the
 * morning's comings and goings, a move. "Is a room free?" sits at the top for the call; below
 * it, the night chosen on the week strip, room by room. Never "Rooms": those are treatment rooms.
 */
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "@/pages/tabs/shared";
import PageHead from "@/components/PageHead";
import { WeekStrip } from "@/components/BottomBar";
import { Btn, DateRow, Empty, ListGroup, Loading, Row, SectionHead, dayText, noteText } from "@/components/kit";
import type { GuestRoomNight } from "@/components/CardSheets";

type Guest = { stay_id: string; patient_id: string; name: string; start_date: string; end_date: string };
type Room = GuestRoomNight & { guests: Guest[] };

const DAY_MS = 86400000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const nights = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const first = (name: string) => name.split(" ")[0];
/** Rooms in their types, in the server's order (cheapest type first). */
const byType = (rooms: Room[]) => rooms.reduce<[string, Room[]][]>((out, r) => {
  const last = out[out.length - 1];
  if (last && last[0] === r.type) last[1].push(r); else out.push([r.type, [r]]);
  return out;
}, []);
const fetchRooms = (from: string, to: string) => fetchJsonWithTimeout<Room[]>(`${API_BASE}/guest-rooms/free?from=${from}&to=${to}`).then((r) => (Array.isArray(r) ? r : []));

export function GuestRooms({ today, openPatient, newPatient, openSettings }: {
  /** YYYY-MM-DD on the centre's clock. */
  today: string;
  openPatient: (id: string) => void;
  /** New patient, with these dates and this room already chosen. */
  newPatient: (p: { arriving: string; leaving: string; room: string }) => void;
  /** Settings → Packages and accommodation, where guest rooms are set up. */
  openSettings: () => void;
}) {
  const [day, setDay] = useState(today);
  const [night, setNight] = useState<Room[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<Room[] | null>(null);
  useEffect(() => { setNight(null); fetchRooms(day, addDays(day, 1)).then(setNight); }, [day]);
  useEffect(() => { setRange(null); if (from && to > from) fetchRooms(from, to).then(setRange); }, [from, to]);

  const free = night?.filter((r) => r.free).length ?? 0;
  const asking = !!from && to > from;
  const sleeping = (r: Room) => r.guests.filter((g) => g.start_date <= day && day < g.end_date);
  const leaving = (r: Room) => r.guests.filter((g) => g.end_date === day);
  const arriving = (r: Room) => sleeping(r).filter((g) => g.start_date === day);
  const tonight = day === today ? "tonight" : `on ${dayText(day)}`;

  if (night && !night.length) return (
    <div>
      <PageHead title="Guest rooms" />
      <Empty text="No guest rooms yet. Set them up under each accommodation type, and every stay can have one." action={<Btn kind="primary" inline onClick={openSettings}>Set up guest rooms</Btn>} />
    </div>
  );

  return (
    <div>
      <PageHead title="Guest rooms" note={night ? `${free} free ${tonight}` : undefined} />
      <SectionHead>Is a room free?</SectionHead>
      <div className="grid grid-cols-2 gap-3">
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
            <ListGroup key={type} title={type} count={rooms.length}>
              {rooms.map((r) => <Row key={r.id} title={r.name} facts={r.beds > 1 ? `${r.beds} beds` : undefined} trailing="Add a patient ›" onClick={() => newPatient({ arriving: from, leaving: to, room: r.id })} />)}
            </ListGroup>
          )) : <Empty text="Every guest room is taken on at least one of those nights. Try other dates." />}
        </div>
      ) : (<>
        <div className="mt-3"><WeekStrip day={day} today={today} setDay={setDay} /></div>
        {/* The morning's housekeeping in one line (#456 part 4): the rooms to make up, and the rooms someone comes into. */}
        {night ? (() => {
          const out = night.filter((r) => leaving(r).length).map((r) => r.name);
          const into = night.filter((r) => arriving(r).length).map((r) => r.name);
          return out.length || into.length ? <p className={`px-1 pt-2 ${noteText}`}>{[out.length ? `Leaving${day === today ? " today" : ""}: ${out.join(", ")} to make up` : "", into.length ? `Arriving: ${into.join(", ")}` : ""].filter(Boolean).join(" · ")}</p> : null;
        })() : null}
        {night === null ? <Loading rows={6} /> : byType(night).map(([type, rooms]) => (
          <ListGroup key={type} title={type} count={rooms.filter((r) => r.free).length}>
            {rooms.map((r) => {
              const inIt = sleeping(r);
              const out = leaving(r);
              // What a room needs this morning first: who arrives, who leaves (the room to make up), then who is in.
              const facts = [
                ...arriving(r).map((g) => `${first(g.name)} arrives · until ${dayText(g.end_date)}`),
                ...inIt.filter((g) => g.start_date !== day).map((g) => `${g.name} · until ${dayText(g.end_date)}`),
                ...out.map((g) => `${first(g.name)} leaves${day === today ? " today" : ""}`),
              ].join(" · ");
              const spare = r.beds - inIt.length;
              return <Row key={r.id} title={r.name} facts={facts || undefined}
                trailing={!inIt.length ? "Free" : spare > 0 ? `${spare} bed free` : undefined}
                onClick={() => (inIt[0] ? openPatient(inIt[0].patient_id) : newPatient({ arriving: day, leaving: addDays(day, 13), room: r.id }))} />;
            })}
          </ListGroup>
        ))}
      </>)}
    </div>
  );
}
