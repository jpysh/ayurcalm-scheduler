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
      where: { guest_room_id: { not: null }, on_site: true, start_date: { lt: end }, end_date: { gte: from }, ...(except ? { id: { not: except } } : {}) },
      include: { Patient: { select: { name: true } } },
    }),
    db.timeOff.findMany({ where: { entity_type: 'guest_room' } }),
  ]);
  rooms.sort((a, b) => a.Accommodation.price_per_day - b.Accommodation.price_per_day || a.Accommodation.name.localeCompare(b.Accommodation.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return rooms.map((r) => {
    const guests = stays.filter((s) => s.guest_room_id === r.id);
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
