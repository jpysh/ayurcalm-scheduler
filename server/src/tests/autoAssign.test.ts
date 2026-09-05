import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { autoSchedule } from '../scheduler';

async function main() {
  const prisma = new PrismaClient();
  try {
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 1500)),
    ]);
    const therapy = await prisma.therapy.create({ data: { name: 'Test Therapy', required_amenities: ['massage_table'], duration_minutes: 60, requires_gender_match: false } });
    const room = await prisma.therapyRoom.create({ data: { name: 'Test Room', amenities: ['massage_table'], is_active: true, weekly_schedule: { thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' } } } });
    const staff = await prisma.staff.create({ data: { name: 'Test Staff', gender: 'other', is_active: true, specializations: [therapy.id], weekly_schedule: { thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' } } } });
    const patient = await prisma.patient.create({ data: { name: 'Test Patient', gender: 'other' } });
    const nextDay = (from: Date, wd: number) => { let d = new Date(from); for (let i = 0; i < 14; i++) { if (d.getDay() === wd) return d; d.setDate(d.getDate() + 1); } return new Date(from); };
    const startDate = nextDay(new Date(), 4).toISOString().slice(0,10);
    const payload = { patient_id: patient.id, therapy_id: therapy.id, total_sessions: 2, preferred_days: ['thursday','friday'], preferred_time_range: { start: '09:00', end: '12:00' }, start_date: startDate, preview_only: false, preferred_staff_id: staff.id };
    const result = await Promise.race([ autoSchedule(payload, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, appointments: [], conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 4000)) ]) as any;
    if (!result.success) { console.error('Auto-assign failed', result.conflicts); process.exit(2); }
    if (result.appointments.length !== 2) { console.error('Expected 2 appointments, got', result.appointments.length); process.exit(3); }
    console.log('Auto-assign test passed:', result.appointments.map((a: any) => ({ date: a.scheduled_date, time: a.start_time })));
    await prisma.appointment.deleteMany({ where: { patient_id: patient.id, therapy_id: therapy.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.staff.delete({ where: { id: staff.id } });
    await prisma.therapyRoom.delete({ where: { id: room.id } });
    await prisma.therapy.delete({ where: { id: therapy.id } });

    const gTherapy = await prisma.therapy.create({ data: { name: 'Gendered Therapy', required_amenities: ['massage_table'], duration_minutes: 60, requires_gender_match: true } });
    const fullWeek = { sunday: { start: '09:00', end: '18:00' }, monday: { start: '09:00', end: '18:00' }, tuesday: { start: '09:00', end: '18:00' }, wednesday: { start: '09:00', end: '18:00' }, thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' }, saturday: { start: '09:00', end: '18:00' } } as const;
    const gRoom = await prisma.therapyRoom.create({ data: { name: 'Gendered Room', amenities: ['massage_table'], is_active: true, weekly_schedule: fullWeek as any } });
    const gStaffF = await prisma.staff.create({ data: { name: 'GM Staff F', gender: 'female', is_active: true, specializations: [gTherapy.id], weekly_schedule: fullWeek as any } });
    const gStaffM = await prisma.staff.create({ data: { name: 'GM Staff M', gender: 'male', is_active: true, specializations: [gTherapy.id], weekly_schedule: fullWeek as any } });
    const gPatient = await prisma.patient.create({ data: { name: 'GM Patient', gender: 'female' } });
    const centerWeeklies = await prisma.timeOff.findMany({ where: { entity_type: 'center', recurrence: 'weekly' } });
    const blocked = new Set<string>();
    for (const h of centerWeeklies) {
      if (Array.isArray((h as any).weekdays)) {
        for (const d of (h as any).weekdays as string[]) blocked.add(d);
      }
    }
    const candidates = ['monday','tuesday','wednesday','thursday','friday'];
    const pick = candidates.find((d) => !blocked.has(d)) || 'thursday';
    const wdIdx: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
    const gStart = nextDay(new Date(), wdIdx[pick]).toISOString().slice(0,10);
    const gmPayloadPreferredMale = { patient_id: gPatient.id, therapy_id: gTherapy.id, total_sessions: 1, preferred_days: [pick], preferred_time_range: { start: '09:00', end: '12:00' }, start_date: gStart, preview_only: false, preferred_staff_id: gStaffM.id };
    const gmResMale = await Promise.race([ autoSchedule(gmPayloadPreferredMale, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 6000)) ]) as any;
    if (gmResMale.success) { console.error('Expected failure for mismatched gender preferred staff'); process.exit(6); }
    if (gmResMale.conflicts?.reason !== 'NO_MATCHING_TIME_SLOTS') { console.error('Unexpected conflict for mismatched gender, got', gmResMale.conflicts?.reason); process.exit(7); }

    const gmPayloadNoPreferred = { patient_id: gPatient.id, therapy_id: gTherapy.id, total_sessions: 2, preferred_days: [pick, 'saturday'], preferred_time_range: { start: '09:00', end: '12:00' }, start_date: gStart, preview_only: false };
    const gmRes = await Promise.race([ autoSchedule(gmPayloadNoPreferred, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, appointments: [], conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 6000)) ]) as any;
    if (!gmRes.success || gmRes.appointments.length !== 2) { console.error('Gender match schedule failed or wrong count', gmRes); process.exit(8); }
    await prisma.appointment.deleteMany({ where: { patient_id: gPatient.id, therapy_id: gTherapy.id } });
    await prisma.patient.delete({ where: { id: gPatient.id } });
    await prisma.staff.delete({ where: { id: gStaffF.id } });
    await prisma.staff.delete({ where: { id: gStaffM.id } });
    await prisma.therapyRoom.delete({ where: { id: gRoom.id } });
    await prisma.therapy.delete({ where: { id: gTherapy.id } });

    const cTherapy = await prisma.therapy.create({ data: { name: 'Center Holiday Therapy', required_amenities: ['massage_table'], duration_minutes: 60, requires_gender_match: false } });
    const cRoom = await prisma.therapyRoom.create({ data: { name: 'Center Room', amenities: ['massage_table'], is_active: true, weekly_schedule: { thursday: { start: '09:00', end: '18:00' } } } });
    const cStaff = await prisma.staff.create({ data: { name: 'Center Staff', gender: 'other', is_active: true, specializations: [cTherapy.id], weekly_schedule: { thursday: { start: '09:00', end: '18:00' } } } });
    const cPatient = await prisma.patient.create({ data: { name: 'Center Patient', gender: 'other' } });
    const cStart = nextDay(new Date(), 4).toISOString().slice(0,10);
    await prisma.timeOff.create({ data: { entity_type: 'center', entity_id: null, date: new Date(), recurrence: 'weekly', weekdays: ['thursday'], start_date: new Date() } });
    const cPayload = { patient_id: cPatient.id, therapy_id: cTherapy.id, total_sessions: 1, preferred_days: ['thursday'], preferred_time_range: { start: '09:00', end: '12:00' }, start_date: cStart, end_date: cStart, preview_only: true };
    const cRes = await Promise.race([ autoSchedule(cPayload, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, appointments: [], suggestions: [], conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 4000)) ]) as any;
    if (cRes.success || (cRes.suggestions || []).length > 0) { console.error('Expected no suggestions on center holiday'); process.exit(9); }
    if (cRes.conflicts?.reason !== 'CENTER_HOLIDAY') { console.error('Unexpected conflict for center holiday', cRes.conflicts?.reason); process.exit(10); }
    await prisma.timeOff.deleteMany({ where: { entity_type: 'center' } });
    await prisma.patient.delete({ where: { id: cPatient.id } });
    await prisma.staff.delete({ where: { id: cStaff.id } });
    await prisma.therapyRoom.delete({ where: { id: cRoom.id } });
    await prisma.therapy.delete({ where: { id: cTherapy.id } });

    const sdTherapy = await prisma.therapy.create({ data: { name: 'Same Day Therapy', required_amenities: ['massage_table'], duration_minutes: 60, requires_gender_match: false } });
    const sdRoom = await prisma.therapyRoom.create({ data: { name: 'Same Day Room', amenities: ['massage_table'], is_active: true, weekly_schedule: { thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' }, wednesday: { start: '09:00', end: '18:00' }, tuesday: { start: '09:00', end: '18:00' }, monday: { start: '09:00', end: '18:00' }, saturday: { start: '09:00', end: '18:00' }, sunday: { start: '09:00', end: '18:00' } } } });
    const sdStaff = await prisma.staff.create({ data: { name: 'Same Day Staff', gender: 'other', is_active: true, specializations: [sdTherapy.id], weekly_schedule: { thursday: { start: '09:00', end: '18:00' }, friday: { start: '09:00', end: '18:00' }, wednesday: { start: '09:00', end: '18:00' }, tuesday: { start: '09:00', end: '18:00' }, monday: { start: '09:00', end: '18:00' }, saturday: { start: '09:00', end: '18:00' }, sunday: { start: '09:00', end: '18:00' } } } });
    const sdPatient = await prisma.patient.create({ data: { name: 'Same Day Patient', gender: 'other' } });
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();
    const sdStart = new Date().toISOString().slice(0,10);
    const toStr = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const prefStart = toStr(Math.max(0, nowM - 60));
    const prefEnd = toStr(Math.min(23*60+59, nowM + 30));
    const sdPayload = { patient_id: sdPatient.id, therapy_id: sdTherapy.id, total_sessions: 1, preferred_days: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], preferred_time_range: { start: prefStart, end: prefEnd }, start_date: sdStart, end_date: sdStart, preview_only: false };
    const sdRes = await Promise.race([ autoSchedule(sdPayload, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, appointments: [], conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 6000)) ]) as any;
    if (sdRes.success) { console.error('Expected same-day guard to block scheduling'); process.exit(11); }
    const sdDetails = sdRes.conflicts?.details as any;
    if (!sdDetails?.same_day_guard_applied) { console.error('Expected same_day_guard_applied detail'); process.exit(12); }
    await prisma.patient.delete({ where: { id: sdPatient.id } });
    await prisma.staff.delete({ where: { id: sdStaff.id } });
    await prisma.therapyRoom.delete({ where: { id: sdRoom.id } });
    await prisma.therapy.delete({ where: { id: sdTherapy.id } });

    const thTherapy = await prisma.therapy.create({ data: { name: 'Therapy Holiday', required_amenities: ['massage_table'], duration_minutes: 60, requires_gender_match: false } });
    const thRoom = await prisma.therapyRoom.create({ data: { name: 'TH Room', amenities: ['massage_table'], is_active: true, weekly_schedule: { friday: { start: '09:00', end: '18:00' } } } });
    const thStaff = await prisma.staff.create({ data: { name: 'TH Staff', gender: 'other', is_active: true, specializations: [thTherapy.id], weekly_schedule: { friday: { start: '09:00', end: '18:00' } } } });
    const thPatient = await prisma.patient.create({ data: { name: 'TH Patient', gender: 'other' } });
    const nextFri = nextDay(new Date(), 5).toISOString().slice(0,10);
    await prisma.timeOff.create({ data: { entity_type: 'therapy', entity_id: thTherapy.id, recurrence: 'weekly', weekdays: ['friday'], date: new Date() } });
    const thPayload = { patient_id: thPatient.id, therapy_id: thTherapy.id, total_sessions: 1, preferred_days: ['friday'], preferred_time_range: { start: '09:00', end: '12:00' }, start_date: nextFri, end_date: nextFri, preview_only: true };
    const thRes = await Promise.race([ autoSchedule(thPayload, prisma), new Promise((resolve) => setTimeout(() => resolve({ success: false, appointments: [], suggestions: [], conflicts: { reason: 'TEST_TIMEOUT', alternatives: [] } }), 6000)) ]) as any;
    if (thRes.success || (thRes.suggestions || []).length > 0) { console.error('Expected no suggestions on therapy holiday'); process.exit(13); }
    if (!thRes.conflicts?.reason || !['OUT_OF_RANGE','NO_MATCHING_TIME_SLOTS'].includes(thRes.conflicts.reason)) { console.error('Unexpected conflict for therapy holiday', thRes.conflicts?.reason); process.exit(14); }
    await prisma.timeOff.deleteMany({ where: { entity_type: 'therapy', entity_id: thTherapy.id } });
    await prisma.patient.delete({ where: { id: thPatient.id } });
    await prisma.staff.delete({ where: { id: thStaff.id } });
    await prisma.therapyRoom.delete({ where: { id: thRoom.id } });
    await prisma.therapy.delete({ where: { id: thTherapy.id } });
  } finally {
    await prisma.$disconnect();
  }
}

main();
