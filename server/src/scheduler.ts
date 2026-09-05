import { PrismaClient, Appointment, Staff, TherapyRoom } from '@prisma/client';
import { z } from 'zod';

const inputSchema = z.object({
  patient_id: z.string().uuid(),
  therapy_id: z.string().uuid(),
  total_sessions: z.number().int().positive(),
  preferred_days: z.array(z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])).default([]),
  preferred_time_range: z.object({ start: z.string(), end: z.string() }),
  start_date: z.string(),
  end_date: z.string().optional(),
  preview_only: z.boolean().optional(),
  preferred_room_id: z.string().uuid().optional(),
  preferred_staff_id: z.string().uuid().optional(),
  max_ms: z.number().int().positive().optional(),
  now: z.string().optional(),
});

const weekdayIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const toTimeString = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

type Weekday = 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday';
type WeeklySchedule = Record<Weekday, { start: string; end: string } | undefined>;

const inSchedule = (schedule: WeeklySchedule | undefined, weekday: Weekday, start: string, end: string) => {
  const day = schedule?.[weekday];
  if (!day) return false;
  const s = toMinutes(day.start);
  const e = toMinutes(day.end);
  const reqS = toMinutes(start);
  const reqE = toMinutes(end);
  return reqS >= s && reqE <= e;
};

const getDay = (schedule: unknown, weekday: Weekday): { start: string; end: string } | undefined => {
  const s = schedule as WeeklySchedule | undefined;
  const d = s?.[weekday];
  if (!d) return undefined;
  const valid = typeof d.start === 'string' && typeof d.end === 'string';
  return valid ? d : undefined;
};

const withTimeout = async <T>(p: Promise<T>, ms: number, tag: string): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`DB_TIMEOUT_${tag}`)), ms)),
  ]);
};

export async function autoSchedule(raw: unknown, prisma: PrismaClient) {
  try {
    const input = inputSchema.parse(raw);
    const maxMs = input.max_ms ?? Number(process.env.SCHEDULER_MAX_MS ?? 3000);
    const startDate = new Date(input.start_date);
    const endDate = input.end_date ? new Date(input.end_date) : undefined;
    const nowDate = input.now ? new Date(input.now) : new Date();
    const therapy = await withTimeout(prisma.therapy.findUnique({ where: { id: input.therapy_id } }), maxMs, 'THERAPY');
    if (!therapy) throw new Error('Therapy not found');

  const duration = therapy.duration_minutes;

  const candidateRooms = await withTimeout(prisma.therapyRoom.findMany({ where: { is_active: true } }), maxMs, 'ROOMS');
  const roomsFiltered = candidateRooms.filter((r) =>
    therapy.required_amenities.every((a) => r.amenities.includes(a))
  );

  const patient = await withTimeout(prisma.patient.findUnique({ where: { id: input.patient_id } }), maxMs, 'PATIENT');
  if (!patient) throw new Error('Patient not found');
  const pAvailFrom = (patient as { available_from?: Date | null }).available_from || null;
  const pAvailTo = (patient as { available_to?: Date | null }).available_to || null;

  const candidateStaff = await withTimeout(prisma.staff.findMany({ where: { is_active: true } }), maxMs, 'STAFF');
  const staffFiltered = candidateStaff.filter((s) => {
    const specOk = s.specializations.includes(input.therapy_id);
    const genderOk = !therapy.requires_gender_match || s.gender === patient.gender;
    return specOk && genderOk;
  });

  const preferredDays = input.preferred_days.length > 0 ? input.preferred_days : ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const reqStart = input.preferred_time_range.start;
  const reqEnd = input.preferred_time_range.end;
  const defaultDay = { start: '09:00', end: '18:00' } as const;

  const appointments: Appointment[] = [];
  const suggestions: { scheduled_date: Date; start_time: string; room_id: string; staff_id: string }[] = [];
  const conflicts: { reason: string; alternatives: { date: Date; start_time: string }[]; details?: Record<string, unknown> } = { reason: '', alternatives: [] };

  let sessionsScheduled = 0;
  const currentDate = new Date(startDate);
  const overallDeadline = Date.now() + maxMs;

  const nextPreferredDate = (from: Date) => {
    for (let i = 0; i < 60; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      if (endDate && d > endDate) return null;
      const weekday = Object.keys(weekdayIndex)[d.getDay()] as Weekday;
      if (preferredDays.includes(weekday)) return d;
    }
    return null;
  };

  while (sessionsScheduled < input.total_sessions) {
    if (endDate && currentDate > endDate) {
      conflicts.reason = conflicts.reason || 'OUT_OF_RANGE';
      break;
    }
    if (Date.now() > overallDeadline) {
      conflicts.reason = conflicts.reason || 'SCHEDULER_TIMEOUT';
      break;
    }
    const nd = nextPreferredDate(currentDate);
    if (!nd) {
      conflicts.reason = conflicts.reason || 'NO_MATCHING_TIME_SLOTS';
      break;
    }
    // patient availability: skip dates outside availability window
    if ((pAvailFrom && new Date(nd.toDateString()) < new Date(pAvailFrom.toDateString())) || (pAvailTo && new Date(nd.toDateString()) > new Date(pAvailTo.toDateString()))) {
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }
    const weekday = Object.keys(weekdayIndex)[nd.getDay()] as Weekday;

    // preferred window (we will search slots inside this)
    const windowStart = toMinutes(reqStart);
    const windowEnd = toMinutes(reqEnd);
    if (windowEnd <= windowStart || duration > (windowEnd - windowStart)) {
      conflicts.reason = 'WINDOW_TOO_NARROW';
      conflicts.alternatives.push({ date: nd, start_time: reqStart });
      conflicts.details = { ...(conflicts.details || {}), window_start: reqStart, window_end: reqEnd, duration_required: duration };
      break;
    }

    let slotWindowStart = windowStart;
    const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (isSameDay(nd, nowDate)) {
      const nowM = nowDate.getHours() * 60 + nowDate.getMinutes();
      slotWindowStart = Math.max(slotWindowStart, nowM);
      if (slotWindowStart + duration > windowEnd) {
        conflicts.reason = conflicts.reason || 'NO_MATCHING_TIME_SLOTS';
        conflicts.details = { ...(conflicts.details || {}), same_day_guard_applied: true };
        currentDate.setDate(nd.getDate() + 1);
        continue;
      }
    }

    // filter rooms: allow if there is sufficient overlap between room schedule and preferred window
    const roomsOk = roomsFiltered.filter((r) => {
      const rDay = getDay(r.weekly_schedule, weekday) || defaultDay;
      const s = toMinutes(rDay.start);
      const e = toMinutes(rDay.end);
      const wS = toMinutes(reqStart);
      const wE = toMinutes(reqEnd);
      const interStart = Math.max(wS, s);
      const interEnd = Math.min(wE, e);
      return interEnd - interStart >= duration;
    });
    if (roomsOk.length === 0) {
      conflicts.reason = conflicts.reason || 'NO_ROOM_AVAILABLE';
      conflicts.alternatives.push({ date: nd, start_time: reqStart });
      conflicts.details = { ...(conflicts.details || {}), rooms_candidates: roomsFiltered.length, rooms_ok: 0 };
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }

    // filter staff: allow if there is sufficient overlap between staff schedule and preferred window
    const staffOk = staffFiltered.filter((s) => {
      const sDay = getDay(s.weekly_schedule, weekday) || defaultDay;
      const sM = toMinutes(sDay.start);
      const eM = toMinutes(sDay.end);
      const wS = toMinutes(reqStart);
      const wE = toMinutes(reqEnd);
      const interStart = Math.max(wS, sM);
      const interEnd = Math.min(wE, eM);
      return interEnd - interStart >= duration;
    });
    if (staffOk.length === 0) {
      conflicts.reason = conflicts.reason || 'NO_STAFF_AVAILABLE';
      conflicts.alternatives.push({ date: nd, start_time: reqStart });
      conflicts.details = { ...(conflicts.details || {}), staff_candidates: staffFiltered.length, staff_ok: 0 };
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }

    // exclude time off (batch)
    const holidays = await prisma.timeOff.findMany({ where: { OR: [ { date: nd }, { AND: [ { start_date: { lte: nd } }, { end_date: { gte: nd } } ] }, { recurrence: 'weekly' } ] } });
    const weekdayName = Object.keys(weekdayIndex)[nd.getDay()] as Weekday;
    const isWeeklyMatch = (h: any) => h.recurrence === 'weekly' && Array.isArray(h.weekdays) && h.weekdays.includes(weekdayName);
    const centerHoliday = holidays.some((h) => {
      if (h.entity_type !== 'center') return false;
      const dateHit = h.date && h.date.toDateString() === nd.toDateString();
      const rangeHit = h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd;
      const weeklyHit = isWeeklyMatch(h);
      return dateHit || rangeHit || weeklyHit;
    });
    if (centerHoliday) {
      conflicts.reason = 'CENTER_HOLIDAY';
      conflicts.details = { ...(conflicts.details || {}), center_holiday: true };
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }
    const therapyHoliday = holidays.some((h) => h.entity_type === 'therapy' && h.entity_id === input.therapy_id && ((h.date && h.date.toDateString() === nd.toDateString()) || (h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd) || isWeeklyMatch(h)));
    if (therapyHoliday) {
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }
    const patientHoliday = holidays.some((h) => h.entity_type === 'patient' && h.entity_id === input.patient_id && ((h.date && h.date.toDateString() === nd.toDateString()) || (h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd) || isWeeklyMatch(h)));
    if (patientHoliday) {
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }
    let roomsAvail: TherapyRoom[] = roomsOk.filter((r) => !holidays.some((h) => h.entity_type === 'room' && h.entity_id === r.id && ((h.date && h.date.toDateString() === nd.toDateString()) || (h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd) || isWeeklyMatch(h))));
    let staffAvail: Staff[] = staffOk.filter((s) => !holidays.some((h) => h.entity_type === 'staff' && h.entity_id === s.id && ((h.date && h.date.toDateString() === nd.toDateString()) || (h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd) || isWeeklyMatch(h))));
    if (input.preferred_room_id) roomsAvail = roomsAvail.filter((r) => r.id === input.preferred_room_id);
    if (input.preferred_staff_id) staffAvail = staffAvail.filter((s) => s.id === input.preferred_staff_id);

    if (roomsAvail.length === 0 || staffAvail.length === 0) {
      conflicts.reason = conflicts.reason || 'NO_MATCHING_TIME_SLOTS';
      conflicts.details = { ...(conflicts.details || {}), rooms_avail: roomsAvail.length, staff_avail: staffAvail.length };
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }

    // prefetch all appointments on date for conflict checks and workloads
    const appointmentsOnDate = await withTimeout(prisma.appointment.findMany({
      where: { scheduled_date: nd },
      select: { start_time: true, duration_minutes: true, room_id: true, staff_id: true, patient_id: true, therapy_id: true },
    }), maxMs, 'APPTS_prefetch');
    const roomBusy: Record<string, { s: number; e: number }[]> = {};
    const staffBusy: Record<string, { s: number; e: number }[]> = {};
    const patientBusy: { s: number; e: number }[] = [];
    for (const a of appointmentsOnDate) {
      const sMin = toMinutes(a.start_time);
      const eMin = sMin + a.duration_minutes;
      if (a.room_id) {
        roomBusy[a.room_id] ??= [];
        roomBusy[a.room_id].push({ s: sMin, e: eMin });
      }
      if (a.staff_id) {
        staffBusy[a.staff_id] ??= [];
        staffBusy[a.staff_id].push({ s: sMin, e: eMin });
      }
      if (a.patient_id === input.patient_id) {
        patientBusy.push({ s: sMin, e: eMin });
      }
    }
    const sameTherapyToday = appointmentsOnDate.some((a) => a.patient_id === input.patient_id && a.therapy_id === input.therapy_id);
    if (sameTherapyToday) {
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }
    // load balancing using prefetch
    staffAvail.sort((a, b) => (staffBusy[a.id]?.length || 0) - (staffBusy[b.id]?.length || 0));

    // search for a concrete slot within preferred window using 30-min steps
    const step = 30;
    let chosen: { room?: TherapyRoom; staff?: Staff; start?: number } = {};
    const seenTimes = new Set<string>();
    const alignedStart = Math.ceil(slotWindowStart / step) * step;
    for (let slotStart = alignedStart; slotStart + duration <= windowEnd; slotStart += step) {
      const slotEnd = slotStart + duration;
      // try rooms and staff
      for (const r of roomsAvail) {
        const rDay = getDay(r.weekly_schedule, weekday) || defaultDay;
        const rS = toMinutes(rDay.start);
        const rE = toMinutes(rDay.end);
        if (!(slotStart >= rS && slotEnd <= rE)) continue;
        const roomConflict = (roomBusy[r.id] || []).some((b) => overlaps(b.s, b.e, slotStart, slotEnd)) || holidays.some((h) => {
          if (!(h.entity_type === 'room' && h.entity_id === r.id)) return false;
          const dateHit = h.date && h.date.toDateString() === nd.toDateString();
          const rangeHit = h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd;
          const weeklyHit = isWeeklyMatch(h);
          if (!(dateHit || rangeHit || weeklyHit)) return false;
          // If weekly or date-only, treat as full-day block
          if (weeklyHit || (h.start_time == null && h.end_time == null && !(h.start_date && h.end_date))) return true;
          // If explicit time range provided, use that
          if (h.start_time && h.end_time) {
            const hs = toMinutes(h.start_time);
            const he = toMinutes(h.end_time);
            return overlaps(hs, he, slotStart, slotEnd);
          }
          // Fallback: derive time window from startDate/endDate if both on same day
          if (h.start_date && h.end_date && h.start_date.toDateString() === nd.toDateString() && h.end_date.toDateString() === nd.toDateString()) {
            const hs = h.start_date.getHours() * 60 + h.start_date.getMinutes();
            const he = h.end_date.getHours() * 60 + h.end_date.getMinutes();
            return overlaps(hs, he, slotStart, slotEnd);
          }
          return true; // default to full-day block for ranges spanning the day
        });
        if (roomConflict) continue;
        for (const s of staffAvail) {
          const sDay = getDay(s.weekly_schedule, weekday) || defaultDay;
          const sS = toMinutes(sDay.start);
          const sE = toMinutes(sDay.end);
          if (!(slotStart >= sS && slotEnd <= sE)) continue;
          const staffConflictBusy = (staffBusy[s.id] || []).some((b) => overlaps(b.s, b.e, slotStart, slotEnd));
          const staffHolidayBlock = holidays.some((h) => {
            if (!(h.entity_type === 'staff' && h.entity_id === s.id)) return false;
            const dateHit = h.date && h.date.toDateString() === nd.toDateString();
            const rangeHit = h.start_date && h.end_date && h.start_date <= nd && h.end_date >= nd;
            const weeklyHit = isWeeklyMatch(h);
            if (!(dateHit || rangeHit || weeklyHit)) return false;
            if (weeklyHit || (h.start_time == null && h.end_time == null && !(h.start_date && h.end_date))) return true;
            if (h.start_time && h.end_time) {
              const hs = toMinutes(h.start_time);
              const he = toMinutes(h.end_time);
              return overlaps(hs, he, slotStart, slotEnd);
            }
            if (h.start_date && h.end_date && h.start_date.toDateString() === nd.toDateString() && h.end_date.toDateString() === nd.toDateString()) {
              const hs = h.start_date.getHours() * 60 + h.start_date.getMinutes();
              const he = h.end_date.getHours() * 60 + h.end_date.getMinutes();
              return overlaps(hs, he, slotStart, slotEnd);
            }
            return true;
          });
          const staffConflict = staffConflictBusy || staffHolidayBlock;
          const patientConflict = patientBusy.some((b) => overlaps(b.s, b.e, slotStart, slotEnd));
          if (!staffConflict && !patientConflict) {
            const startStr = toTimeString(slotStart);
            if (seenTimes.has(startStr)) {
              // already suggested this start time; skip to encourage alternate times
            } else {
              const candidate = { scheduled_date: nd, start_time: startStr, room_id: r.id, staff_id: s.id };
              if (suggestions.length < 3) {
                suggestions.push(candidate);
                seenTimes.add(startStr);
              }
            }
            if (!chosen.room || !chosen.staff) {
              chosen = { room: r, staff: s, start: slotStart };
            }
            break;
          }
        }
        if (chosen.room && chosen.staff && suggestions.length >= 3) break;
      }
      if (suggestions.length >= 3) break;
    }

    if (!chosen.room || !chosen.staff || chosen.start === undefined) {
      conflicts.reason = conflicts.reason || 'NO_MATCHING_TIME_SLOTS';
      currentDate.setDate(nd.getDate() + 1);
      continue;
    }

    if (!input.preview_only) {
      const appt = await prisma.appointment.create({
        data: {
          patient_id: input.patient_id,
          therapy_id: input.therapy_id,
          staff_id: chosen.staff!.id,
          room_id: chosen.room!.id,
          scheduled_date: nd,
          start_time: toTimeString(chosen.start!),
          duration_minutes: duration,
          session_number: sessionsScheduled + 1,
          total_sessions: input.total_sessions,
          status: 'confirmed',
          assignment_type: 'auto',
          notes: '',
        },
      });
      appointments.push(appt);
    }
    sessionsScheduled++;
    currentDate.setDate(nd.getDate() + 1);
  }

  const success = input.preview_only ? suggestions.length > 0 : (appointments.length === input.total_sessions);
  return {
    success,
    appointments,
    suggestions,
    conflicts: success ? undefined : conflicts,
  };
  } catch (e) {
    const reason = e instanceof Error && e.message.startsWith('DB_TIMEOUT') ? 'DB_TIMEOUT' : 'SCHEDULER_ERROR';
    return { success: false, appointments: [], suggestions: [], conflicts: { reason, alternatives: [] } };
  }
}
