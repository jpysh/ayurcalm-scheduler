import { Prisma } from '@prisma/client';

/** What an admin may keep when clearing the demo (#108). Residents and bookings always go. */
export const KEEPABLE = ['therapies', 'rooms', 'team', 'events'] as const;
export type Keep = (typeof KEEPABLE)[number];

/**
 * Deletes the demo, leaving user accounts and settings so the operator stays
 * signed in. Residents, their stays, bookings, diets and printed sheets always
 * go: a booking without its resident is not a state anyone wants. Therapies,
 * rooms, the team (with their leave) and classes and events (with centre
 * holidays) may each be kept to edit rather than retype (#60, #108). Diet plans
 * are never deleted here, and the therapy library brings standard therapies
 * back at any time. Takes a transaction so a test can roll it back.
 */
export async function wipeDemo(tx: Prisma.TransactionClient, keep: Keep[] = []) {
  const kept = (k: Keep) => keep.includes(k);
  const appointments = await tx.appointment.deleteMany({});
  await tx.dietPlanSegment.deleteMany({});
  await tx.dietPlan.deleteMany({});
  await tx.printedSheet.deleteMany({});
  await tx.linkIssue.deleteMany({});
  await tx.timeOff.deleteMany({ where: { entity_type: 'patient' } });
  if (!kept('events')) {
    await tx.programEvent.deleteMany({});
    await tx.timeOff.deleteMany({ where: { entity_type: 'center' } });
  }
  if (!kept('team')) await tx.timeOff.deleteMany({ where: { entity_type: 'staff' } });
  if (!kept('rooms')) await tx.timeOff.deleteMany({ where: { entity_type: 'room' } });
  await tx.timeOff.deleteMany({ where: { entity_type: 'therapy' } });
  if (kept('events')) await tx.programEvent.updateMany({ data: { patient_ids: [] } });
  await tx.groupHold.deleteMany({});
  await tx.patientStay.deleteMany({});
  // The demo's guest rooms are its own numbering, not the centre's (#456).
  await tx.guestRoom.deleteMany({});
  const patients = await tx.patient.deleteMany({});
  // An event kept may name a room or a person that is going: it loses the name, not the event.
  if (kept('events') && !kept('rooms')) await tx.programEvent.updateMany({ data: { room_id: null } });
  if (kept('events') && !kept('team')) await tx.programEvent.updateMany({ data: { staff_id: null, staff_ids: [] } });
  const therapies = kept('therapies') ? { count: 0 } : await tx.therapy.deleteMany({});
  const rooms = kept('rooms') ? { count: 0 } : await tx.therapyRoom.deleteMany({});
  // A kept therapist's skills pointed at therapies that are going.
  if (kept('team') && !kept('therapies')) await tx.staff.updateMany({ data: { specializations: [] } });
  const staff = kept('team') ? { count: 0 } : await tx.staff.deleteMany({});
  await tx.auditLog.deleteMany({});
  // The demo centre's letterhead is not the real centre's.
  await tx.settings.updateMany({ data: { demo_data: false, letterhead: Prisma.DbNull } });
  return { appointments: appointments.count, patients: patients.count, staff: staff.count, rooms: rooms.count, therapies: therapies.count };
}

export type Mine = { centre_name: string; team: { name: string; gender: 'male' | 'female'; doctor: boolean }[]; rooms: { id: string; name: string }[]; consult_room: string; therapy_ids: string[]; new_therapies?: string[] };

/**
 * Make it mine (#729): the example's residents, bookings and team go; the
 * rooms and therapies ticked stay (renamed, the rest switched off, so their
 * amenities and rules come with them); the admin's team replaces the example's.
 */
export async function makeItMine(tx: Prisma.TransactionClient, body: Mine) {
  await wipeDemo(tx, ['therapies', 'rooms']);
  await tx.therapyRoom.updateMany({ where: { id: { notIn: body.rooms.map((r) => r.id) } }, data: { is_active: false } });
  for (const r of body.rooms) await tx.therapyRoom.update({ where: { id: r.id }, data: { name: r.name, is_active: true } });
  // A doctor sees residents in an OPD room, never a treatment room (#1147): the example's first
  // consultation room becomes it, or one is made, and the other consultation rooms go.
  const consult = await tx.therapy.findFirst({ where: { is_consultation: true } });
  if (consult) {
    const fits = (await tx.therapyRoom.findMany({ orderBy: { name: 'asc' } })).filter((r) => consult.required_amenities.every((a) => r.amenities.includes(a)) && !body.rooms.some((k) => k.id === r.id));
    const opd = fits[0]
      ? await tx.therapyRoom.update({ where: { id: fits[0].id }, data: { name: body.consult_room, is_active: true } })
      : await tx.therapyRoom.create({ data: { name: body.consult_room, amenities: consult.required_amenities, is_active: true, weekly_schedule: (await tx.therapyRoom.findUniqueOrThrow({ where: { id: body.rooms[0].id } })).weekly_schedule as Prisma.InputJsonValue } });
    await tx.therapyRoom.updateMany({ where: { id: { in: fits.map((r) => r.id).filter((id) => id !== opd.id) } }, data: { is_active: false } });
  }
  // A consultation is how every new resident starts, so it is never switched off.
  // Pasted names the example lacks (#1308): an hour in any room until Therapies says otherwise.
  const added = await Promise.all((body.new_therapies ?? []).map((name) => tx.therapy.create({ data: { name, duration_minutes: 60, required_amenities: [] } })));
  await tx.therapy.updateMany({ where: { id: { notIn: [...body.therapy_ids, ...added.map((t) => t.id)] }, is_consultation: false }, data: { is_active: false } });
  const kept = await tx.therapy.findMany({ where: { is_active: true }, select: { id: true, is_consultation: true } });
  const skills = (doctor: boolean) => kept.filter((t) => t.is_consultation === doctor).map((t) => t.id);
  await tx.staff.createMany({ data: body.team.map((p) => ({ name: p.name, gender: p.gender, role: p.doctor ? 'doctor' : 'therapist', specializations: skills(p.doctor), weekly_schedule: {}, is_active: true })) });
  await tx.settings.update({ where: { id: 'singleton' }, data: { centre_name: body.centre_name, setup_complete: true } });
}
