import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const API_BASE = 'http://127.0.0.1:4100/api';
  try {
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 3000)),
    ]);

    // 1) Staff name edit persists
    const staff = await prisma.staff.findFirst();
    if (!staff) throw new Error('No staff found');
    const originalName = staff.name;
    const editedName = originalName.replace(/^Dr\.\s*/i, '').trim() || `${originalName} Edited`;
    const resStaff = await fetch(`${API_BASE}/staff/${staff.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editedName })
    });
    const updatedStaff = await resStaff.json();
    const checkStaff = await prisma.staff.findUnique({ where: { id: staff.id } });
    if (!checkStaff || checkStaff.name !== editedName) throw new Error('Staff name did not persist');

    // revert
    await fetch(`${API_BASE}/staff/${staff.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: originalName })
    });

    // 2) Room create, then delete persists
    const createRoom = await fetch(`${API_BASE}/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TmpRoomTest-Persist', amenities: [], weekly_schedule: {} })
    });
    const roomCreated = await createRoom.json();
    if (!roomCreated?.id) throw new Error('Room creation failed');
    // delete via API (marks inactive)
    await fetch(`${API_BASE}/rooms/${roomCreated.id}`, { method: 'DELETE' });
    const roomAfter = await prisma.therapyRoom.findUnique({ where: { id: roomCreated.id } });
    if (!roomAfter || roomAfter.is_active) throw new Error('Room delete did not persist (still active)');
    // cleanup hard delete to avoid residue
    await prisma.therapyRoom.delete({ where: { id: roomCreated.id } }).catch(() => {});

    // 3) TimeOff add persists (then cleanup)
    const toPayload = { entity_type: 'center', date: new Date().toISOString(), recurrence: 'weekly', weekdays: ['tuesday'] };
    const toRes = await fetch(`${API_BASE}/timeoff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toPayload) });
    const toCreated = await toRes.json();
    if (!toCreated?.id) throw new Error('TimeOff creation failed');
    const toList: any[] = await fetch(`${API_BASE}/timeoff`).then(r => r.json());
    const found = toList.some((h: any) => h.id === toCreated.id);
    if (!found) throw new Error('TimeOff not listed after creation');
    await fetch(`${API_BASE}/timeoff/${toCreated.id}`, { method: 'DELETE' });

    // 4) Patient edit persists (phone)
    const patient = await prisma.patient.findFirst();
    if (!patient) throw new Error('No patient found');
    const origPhone = patient.phone || '';
    const newPhone = '+91-9999999999';
    await fetch(`${API_BASE}/patients/${patient.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: newPhone }) });
    const patientAfter = await prisma.patient.findUnique({ where: { id: patient.id } });
    if (!patientAfter || patientAfter.phone !== newPhone) throw new Error('Patient phone did not persist');
    // revert
    await fetch(`${API_BASE}/patients/${patient.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: origPhone || null }) });

    // 5) Appointment delete persists
    const anyStaff = await prisma.staff.findFirst();
    const anyRoom = await prisma.therapyRoom.findFirst();
    const anyTherapy = await prisma.therapy.findFirst();
    if (!anyStaff || !anyRoom || !anyTherapy || !patient) throw new Error('Missing base entities for appointment test');
    const date = new Date();
    const appt = await prisma.appointment.create({ data: {
      patient_id: patient.id,
      therapy_id: anyTherapy.id,
      staff_id: anyStaff.id,
      room_id: anyRoom.id,
      scheduled_date: new Date(date.toISOString().slice(0,10)),
      start_time: '09:00',
      duration_minutes: 30,
      session_number: 1,
      total_sessions: 1,
      status: 'pending',
      assignment_type: 'manual',
    } });
    const beforeCount = await prisma.appointment.count({ where: { id: appt.id } });
    await fetch(`${API_BASE}/appointments/${appt.id}`, { method: 'DELETE' });
    const afterCount = await prisma.appointment.count({ where: { id: appt.id } });
    if (beforeCount !== 1 || afterCount !== 0) throw new Error('Appointment delete did not persist');

    console.log('UI persistence checks passed');
  } finally {
    await prisma.$disconnect();
  }
}

main();
