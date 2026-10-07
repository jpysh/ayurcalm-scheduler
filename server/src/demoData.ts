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
