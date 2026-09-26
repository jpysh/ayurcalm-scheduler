/** What more than one screen of the dashboard reads: the shapes it holds and the helpers they share. */

export type UiStaff = { id: string | number; name: string; gender: "Male" | "Female" | "Other"; specializations: string[]; phone: string; schedule: string; status: "Active" | "Inactive" };
export type UiRoom = { id: string | number; name: string; amenities: string[]; schedule: string; status: "Active" | "Maintenance" };
export type UiTherapy = { id: string | number; name: string; duration: number; amenities: string[]; genderMatch: boolean; staffRequired?: number };
export type UiTimeOff = { id: string; date?: string; startDate?: string; endDate?: string; startTime?: string; endTime?: string; recurrence?: 'weekly'; weekdays?: ('sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday')[]; type: "Center" | "Staff" | "Room" | "Therapy" | "Patient"; entity: string; description: string };
export type Patient = {
  id: string; name: string; phone: string; email: string; gender: string; dob: string;
  emergencyContact: string; emergencyPhone: string; address: string; medicalNotes: string; dietPlan: string;
  actualStart: string; actualEnd: string; preferredStaffId?: string | null; requiresPreferredStaff?: boolean;
};
export type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string | null; room_id: string | null; scheduled_date: string; start_time: string; duration_minutes: number; status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'; notes?: string | null };
export type ApiProgramEvent = { id: string; date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string; end_time: string; activity_name: string; room_id?: string | null; staff_id?: string | null; required_amenities?: string[]; notes?: string | null; recurrence?: string | null; weekdays: string[]; audience?: string | null };
export type ApiDietPlan = { id: string; patient_id: string; date: string; meal_time: 'breakfast'|'lunch'|'dinner'|'snacks'; description: string; instructions?: string };
export type ApiStay = { id: string; patient_id: string; start_date: string; end_date: string; duration_days: number };

export const blankPatient = (): Patient => ({ id: '', name: '', phone: '', email: '', gender: 'Male', dob: '', emergencyContact: '', emergencyPhone: '', address: '', medicalNotes: '', dietPlan: '', actualStart: '', actualEnd: '' });

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

