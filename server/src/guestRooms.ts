/** Guest rooms (#456): the rooms patients sleep in, and who sleeps in each on a night. */
import type { Prisma, PrismaClient } from '@prisma/client';

/** "T1–T6" is six rooms, "101-104" four, "T1, T2, Hut A" three; anything else is one room by that name. */
export function expandRoomNames(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)(\d+)\s*[-–—]\s*(?:\1)?(\d+)$/);
    const [from, to] = m ? [Number(m[2]), Number(m[3])] : [0, -1];
    if (!m || to < from || to - from >= 50) { names.push(part); continue; }
    for (let n = from; n <= to; n++) names.push(`${m[1]}${String(n).padStart(m[2].length, '0')}`);
  }
  return [...new Set(names)];
}

type Db = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
/** The morning after the last night: the leaving day, or the next day for a stay that starts and ends on one day. */
export const nightsEnd = (from: Date, to: Date) => (to > from ? to : new Date(from.getTime() + DAY_MS));

/**
 * Stay and guest-room writes one at a time (#1198): a double tap, or two phones, would
 * otherwise both pass the check before either saves. Held to the end of the transaction.
 */
export const lockStays = (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT pg_advisory_xact_lock(1198)::text`;

/** The patient's other stay sharing a night with these dates (#1198): one person sleeps in one stay at a time. */
export async function ownStayOverlap(db: Db, patientId: string, start: Date, end: Date, except?: string) {
  const mine = await db.patientStay.findMany({ where: { patient_id: patientId, ...(except ? { id: { not: except } } : {}) } });
  const s = mine.find((m) => m.start_date < nightsEnd(start, end) && start < nightsEnd(m.start_date, m.end_date));
  return s ? { reason: 'STAY_OVERLAPS', message: `They already have a stay from ${dayOf(s.start_date)} to ${dayOf(s.end_date)}. Change that one instead.`, stay_id: s.id } : null;
}

type Earlier = { guest_room_id: string; until: Date };
/** The room a stay sleeps in on night `d` (#1164): an earlier room up to its `until`, then the stay's room. */
export const roomOn = (stay: { guest_room_id: string | null; EarlierRooms?: Earlier[] }, d: number) =>
  [...(stay.EarlierRooms ?? [])].sort((a, b) => a.until.getTime() - b.until.getTime()).find((e) => d < e.until.getTime())?.guest_room_id ?? stay.guest_room_id;

/** Each room of a stay with the dates it was in it: an earlier room ends on the day of the move, the next starts on it. */
export function spans(stay: { start_date: Date; end_date: Date; guest_room_id: string | null; EarlierRooms: Earlier[] }) {
  const out: { room: string | null; start: Date; end: Date }[] = [];
  let start = stay.start_date;
  for (const e of [...stay.EarlierRooms].sort((a, b) => a.until.getTime() - b.until.getTime())) { out.push({ room: e.guest_room_id, start, end: e.until }); start = e.until; }
  out.push({ room: stay.guest_room_id, start, end: stay.end_date });
  return out;
}

/**
 * The earlier rooms after a move to `next` from night `from` (#1164): the nights before it
 * keep their rooms, the rest are the new one. Back to the room just left, on the same day,
 * leaves no row. `from` at or before the start, or no room, makes it the room for the whole stay.
 */
export function moveRooms(earlier: Earlier[], current: string | null, start: Date, end: Date, from: Date, next: string | null): Earlier[] {
  if (!next || from <= start) return [];
  const spans = [...earlier].sort((a, b) => a.until.getTime() - b.until.getTime());
  if (current) spans.push({ guest_room_id: current, until: end });
  const kept: Earlier[] = [];
  for (const s of spans) {
    const until = s.until < from ? s.until : from;
    const last = kept[kept.length - 1];
    if (until <= (last?.until ?? start)) continue;
    if (last?.guest_room_id === s.guest_room_id) last.until = until; else kept.push({ guest_room_id: s.guest_room_id, until });
  }
  while (kept.length && kept[kept.length - 1].guest_room_id === next) kept.pop();
  return kept.filter((e) => e.until < end);
}

type OutRow = { entity_id: string | null; date: Date | null; start_date: Date | null; end_date: Date | null; description: string | null };
/** The first of these nights (from, up to but not including end) a room is out of use, with why and until when; null when it is in use on all of them. Whole days, both ends included. */
export function outNight(rows: OutRow[], roomId: string, from: Date, end: Date) {
  const mine = rows.filter((r) => r.entity_id === roomId).map((r) => { const s = iso((r.start_date ?? r.date)!); return { s, e: r.end_date ? iso(r.end_date) : s, why: r.description?.trim() || null }; });
  for (let d = from.getTime(); d < end.getTime(); d += DAY_MS) {
    const day = iso(new Date(d));
    const hit = mine.find((r) => r.s <= day && day <= r.e);
    if (hit) return { date: day, until: hit.e, reason: hit.why };
  }
  return null;
}

/**
 * Every active guest room for the nights from `from` up to, not including, `to`: who is in
 * it, and whether a bed is free on every one of those nights. `except` leaves a stay out,
 * so a stay being changed does not count against itself.
 */
export async function guestRoomsFor(db: Db, from: Date, to: Date, except?: string) {
  const end = nightsEnd(from, to);
  const [rooms, stays, off] = await Promise.all([
    db.guestRoom.findMany({ where: { is_active: true }, include: { Accommodation: { select: { name: true, price_per_day: true } } } }),
    db.patientStay.findMany({
      where: { OR: [{ guest_room_id: { not: null } }, { EarlierRooms: { some: {} } }], on_site: true, start_date: { lt: end }, end_date: { gte: from }, ...(except ? { id: { not: except } } : {}) },
      include: { Patient: { select: { name: true } }, EarlierRooms: true },
    }),
    db.timeOff.findMany({ where: { entity_type: 'guest_room' } }),
  ]);
  rooms.sort((a, b) => a.Accommodation.price_per_day - b.Accommodation.price_per_day || a.Accommodation.name.localeCompare(b.Accommodation.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return rooms.map((r) => {
    // A guest moved mid-stay is two guests to housekeeping: leaving one room and arriving in the other on the day of the move.
    const guests = stays.flatMap((s) => spans(s).filter((p) => p.room === r.id && p.start < end && p.end >= from).map((p) => ({ ...s, start_date: p.start, end_date: p.end })));
    const sleeping = (d: number) => guests.filter((s) => s.start_date.getTime() <= d && d < nightsEnd(s.start_date, s.end_date).getTime());
    let full: number | null = null;
    for (let d = from.getTime(); d < end.getTime() && full === null; d += DAY_MS) if (sleeping(d).length >= r.beds) full = d;
    // Out of use (#563): the admin took the room out, say for no electricity, so no night of it can be given.
    const out = outNight(off, r.id, from, end);
    return {
      id: r.id, name: r.name, beds: r.beds, accommodation_id: r.accommodation_id, type: r.Accommodation.name,
      free: full === null && !out,
      out,
      /** The first night with no bed left, and who has them. */
      full_on: full === null ? null : { date: iso(new Date(full)), names: sleeping(full).map((s) => s.Patient.name) },
      guests: guests.map((s) => ({ stay_id: s.id, patient_id: s.patient_id, name: s.Patient.name, start_date: iso(s.start_date), end_date: iso(s.end_date) })),
    };
  });
}

/** The first room of a type free for every night, or of any type when none is given. */
export async function firstFreeRoom(db: Db, from: Date, to: Date, typeId?: string | null, except?: string) {
  return (await guestRoomsFor(db, from, to, except)).find((r) => r.free && (!typeId || r.accommodation_id === typeId)) ?? null;
}

/**
 * Null when the room has a bed on every night; otherwise a refusal that names who is in it
 * and the rooms free for all those nights, the same type first.
 */
export async function guestRoomRefusal(db: Db, roomId: string, from: Date, to: Date, except?: string) {
  const rooms = await guestRoomsFor(db, from, to, except);
  const room = rooms.find((r) => r.id === roomId);
  const free = rooms.filter((r) => r.free).sort((a, b) => Number(b.accommodation_id === room?.accommodation_id) - Number(a.accommodation_id === room?.accommodation_id));
  const names = free.slice(0, 4).map((r) => `${r.name} (${r.type})`);
  const then = names.length ? ` Free for all those nights: ${names.join(', ')}.` : ' No guest room is free for all those nights.';
  if (!room) return { reason: 'ROOM_GONE', message: `That guest room is no longer in use.${then}`, free: free.map(({ id, name, type }) => ({ id, name, type })) };
  if (room.free) return null;
  if (room.out) return { reason: 'ROOM_OUT', message: `${room.name} is out of use on ${dayOf(new Date(`${room.out.date}T00:00:00Z`))}${room.out.reason ? `: ${room.out.reason}` : ''}.${then}`, free: free.map(({ id, name, type }) => ({ id, name, type })) };
  const full = room.full_on!;
  return { reason: 'ROOM_TAKEN', message: `${room.name} is taken on ${dayOf(new Date(`${full.date}T00:00:00Z`))} by ${full.names.join(' and ')}.${then}`, free: free.map(({ id, name, type }) => ({ id, name, type })) };
}
