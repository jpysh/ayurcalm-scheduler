import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupPatients() {
  const patients = await prisma.patient.findMany();
  const byName = new Map();
  for (const p of patients) {
    const key = p.name.trim().toLowerCase();
    const arr = byName.get(key) || [];
    arr.push(p);
    byName.set(key, arr);
  }
  let patientsDeleted = 0;
  let apptsReassigned = 0;
  let dietsReassigned = 0;
  let timeoffsDeleted = 0;
  let groupsProcessed = 0;
  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    groupsProcessed++;
    const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const apptUpdate = await tx.appointment.updateMany({ where: { patient_id: dup.id }, data: { patient_id: primary.id } });
        apptsReassigned += apptUpdate.count;
        const dietUpdate = await tx.dietPlan.updateMany({ where: { patient_id: dup.id }, data: { patient_id: primary.id } });
        dietsReassigned += dietUpdate.count;
        const toDel = await tx.timeOff.deleteMany({ where: { entity_type: 'patient', entity_id: dup.id } });
        timeoffsDeleted += toDel.count;
        await tx.patient.delete({ where: { id: dup.id } });
        patientsDeleted++;
      }
    });
  }
  return { groupsProcessed, patientsDeleted, apptsReassigned, dietsReassigned, timeoffsDeleted };
}

async function cleanupStaff() {
  const staff = await prisma.staff.findMany();
  const byName = new Map();
  for (const s of staff) {
    const key = s.name.trim().toLowerCase();
    const arr = byName.get(key) || [];
    arr.push(s);
    byName.set(key, arr);
  }
  let groupsProcessed = 0;
  let staffDeactivated = 0;
  let apptsReassigned = 0;
  let timeoffsDeleted = 0;
  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    groupsProcessed++;
    const counts = await Promise.all(group.map(async (s) => ({ id: s.id, count: await prisma.appointment.count({ where: { staff_id: s.id } }) })));
    const sorted = [...group].sort((a, b) => {
      const ca = counts.find((c) => c.id === a.id)?.count ?? 0;
      const cb = counts.find((c) => c.id === b.id)?.count ?? 0;
      if (ca !== cb) return cb - ca;
      return a.id.localeCompare(b.id);
    });
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const apptUpdate = await tx.appointment.updateMany({ where: { staff_id: dup.id }, data: { staff_id: primary.id } });
        apptsReassigned += apptUpdate.count;
        const toDel = await tx.timeOff.deleteMany({ where: { entity_type: 'staff', entity_id: dup.id } });
        timeoffsDeleted += toDel.count;
        await tx.staff.update({ where: { id: dup.id }, data: { is_active: false } });
        staffDeactivated++;
      }
    });
  }
  return { groupsProcessed, staffDeactivated, apptsReassigned, timeoffsDeleted };
}

async function renameRoomsSimple() {
  const rooms = await prisma.therapyRoom.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rooms.length; i++) {
      const desired = `Rm${i + 1}`;
      if (rooms[i].name === desired) continue;
      await tx.therapyRoom.update({ where: { id: rooms[i].id }, data: { name: desired } });
      updated++;
    }
  });
  return { updated, total: rooms.length };
}

async function main() {
  try {
    await prisma.$connect();
    const patients = await cleanupPatients();
    const staff = await cleanupStaff();
    const rooms = await renameRoomsSimple();
    console.log(JSON.stringify({ patients, staff, rooms }));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

