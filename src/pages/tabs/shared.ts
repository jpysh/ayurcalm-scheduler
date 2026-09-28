/** What more than one screen of the dashboard reads: the shapes it holds and the helpers they share. */

export type UiStaff = { id: string | number; name: string; gender: "Male" | "Female" | "Other"; specializations: string[]; phone: string; schedule: string; status: "Active" | "Inactive" };
export type UiRoom = { id: string | number; name: string; amenities: string[]; schedule: string; status: "Active" | "Maintenance" };
export type UiTherapy = { id: string | number; name: string; duration: number; amenities: string[]; genderMatch: boolean; staffRequired?: number; checklist?: { text: string; required: boolean }[]; vitals?: string[] };
export type UiTimeOff = { id: string; date?: string; startDate?: string; endDate?: string; startTime?: string; endTime?: string; recurrence?: 'weekly'; weekdays?: ('sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday')[]; type: "Center" | "Staff" | "Room" | "Therapy" | "Patient"; entity: string; description: string };
export type Patient = {
  id: string; name: string; phone: string; email: string; gender: string; dob: string;
  emergencyContact: string; emergencyPhone: string; address: string; medicalNotes: string;
  actualStart: string; actualEnd: string; preferredStaffId?: string | null;
  /** Every stay, newest first; actualStart/actualEnd are only the newest. */
  stays?: { start_date: string; end_date: string }[]; requiresPreferredStaff?: boolean;
};
export type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string | null; room_id: string | null; scheduled_date: string; start_time: string; duration_minutes: number; status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'; notes?: string | null;
  /** What the private links recorded (#219). */
  record?: { checklist?: Record<string, boolean>; vitals?: Record<string, string>; room_ready?: boolean; feedback?: "up" | "down"; feedback_note?: string } | null };
export type ApiProgramEvent = { id: string; date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string; end_time: string; activity_name: string; room_id?: string | null; staff_id?: string | null; required_amenities?: string[]; notes?: string | null; recurrence?: string | null; weekdays: string[]; audience?: string | null };
export type ApiStay = { id: string; patient_id: string; start_date: string; end_date: string; duration_days: number };

/**
 * When a leave line applies, as the admin would say it: "27 Sept, 14:00–20:00".
 * Dates are the stored calendar day and times the stored HH:MM, never passed
 * through a clock: UTC midnight in India read as 05:30 (#189).
 */
export function leaveWhen(h: Pick<UiTimeOff, 'date' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>, fullDay: boolean): string {
  const day = (iso?: string) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  const from = day(h.startDate || h.date), to = day(h.endDate || h.startDate || h.date);
  const hours = !fullDay && h.startTime && h.endTime ? `${h.startTime}–${h.endTime}` : '';
  if (from === to) return [from, hours].filter(Boolean).join(', ');
  return hours ? `${from} ${h.startTime} to ${to} ${h.endTime}` : `${from} to ${to}`;
}

export const blankPatient = (): Patient => ({ id: '', name: '', phone: '', email: '', gender: 'Male', dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: '', actualStart: '', actualEnd: '' });

export const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN || '';

export const fetchJsonWithTimeout = async <T = unknown>(url: string, ms = 6000): Promise<T> => {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try {
      return await attempt();
    } catch {
      return [] as T;
    }
  }
};

export const toHHMM = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

