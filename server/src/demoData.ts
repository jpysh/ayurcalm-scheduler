import type { Prisma } from '@prisma/client';

/**
 * Deletes everything a centre would consider "the demo", leaving user accounts
 * and settings intact so the operator stays signed in. Order matters: rows that
 * reference others go first. With `keepTemplates` the therapies and rooms stay:
 * a new centre edits those rather than retyping them, while the example people
 * and bookings are in the way from the first real booking (#60). Diet plans are
 * never deleted here. Takes a transaction so a test can roll it back.
 */
export async function wipeDemo(tx: Prisma.TransactionClient, keepTemplates = false) {
  const appointments = await tx.appointment.deleteMany({});
  await tx.dietPlanSegment.deleteMany({});
  await tx.dietPlan.deleteMany({});
  await tx.printedSheet.deleteMany({});
  await tx.programEvent.deleteMany({});
  await tx.timeOff.deleteMany({});
  await tx.patientStay.deleteMany({});
  const patients = await tx.patient.deleteMany({});
  const therapies = keepTemplates ? { count: 0 } : await tx.therapy.deleteMany({});
  const rooms = keepTemplates ? { count: 0 } : await tx.therapyRoom.deleteMany({});
  const staff = await tx.staff.deleteMany({});
  await tx.auditLog.deleteMany({});
  await tx.settings.updateMany({ data: { demo_data: false } });
  return { appointments: appointments.count, patients: patients.count, staff: staff.count, rooms: rooms.count, therapies: therapies.count };
}
