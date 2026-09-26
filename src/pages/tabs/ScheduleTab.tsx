import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DayGrid from "@/components/DayGrid";
import { useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type ScheduleTabProps = {
  /** The centre's timezone, from Settings. */
  timezone: string;
  ymdInTZ: (d: Date) => string;
  appointmentsByDate: Record<string, ApiAppointment[]>;
  timeSlots: string[];
  dayKeyMemo: string;
  patients: { id: string | number; name: string }[];
  roomsList: { id: string | number; name: string }[];
  staff: { id: string | number; name: string }[];
  therapyNameById: Record<string, string>;
  setSelectedAppointment: (v: ApiAppointment) => void;
  setShowVerify: (b: boolean) => void;
};

type ApiAppointment = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status?: "pending" | "confirmed" | "completed" | "cancelled" | "rescheduled";
};

/** Minutes past midnight now, on the centre's clock. */
const nowInTZ = (timeZone: string) => {
  try {
    const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
    return h * 60 + m;
  } catch {
    return new Date().getHours() * 60 + new Date().getMinutes();
  }
};

// The day, the print buttons and booking are on the bottom bar (#66); the
// screen itself is the grid.
const ScheduleTab = ({
  ymdInTZ,
  appointmentsByDate,
  timeSlots,
  dayKeyMemo,
  patients,
  roomsList,
  staff,
  therapyNameById,
  setSelectedAppointment,
  setShowVerify,
  timezone,
}: ScheduleTabProps) => (
  <Card>
    <div className="flex justify-end px-2 pt-2">
      <Button variant="secondary" size="sm" className="h-8 px-3" onClick={() => setShowVerify(true)}>Verify</Button>
    </div>
    <CardContent className="pt-0 p-2">
      {/* Keyed on the timezone: "Who is free" picks its time once, and the
          centre's timezone arrives after the first render (#141). */}
      <DayGrid
        key={timezone}
        dayAppointments={Array.isArray(appointmentsByDate?.[dayKeyMemo]) ? appointmentsByDate[dayKeyMemo] : []}
        dayKey={dayKeyMemo}
        isToday={dayKeyMemo === ymdInTZ(new Date())}
        nowMinutes={nowInTZ(timezone)}
        timeSlots={timeSlots}
        patients={patients}
        roomsList={roomsList}
        staff={staff}
        therapyNameById={therapyNameById}
        setSelectedAppointment={setSelectedAppointment}
      />
    </CardContent>
  </Card>
);

export default ScheduleTab;

/** The Schedule screen, and the day sheets the bottom bar prints for the day it is on. */
export function useScheduleScreen({ ADMIN_TZ, ymdInTZ, appointmentsByDate, timeSlots, dayKeyMemo, patients, roomsList, staff, therapyNameById, setSelectedAppointment, setShowVerify }: Record<string, any>) {
  const [pdfLoading, setPdfLoading] = useState<'patient' | 'therapist' | null>(null);
  // Two sheets off the same day: the patient one for the notice board, the
  // therapist rota for the treatment team.
  const printSheet = async (kind: 'patient' | 'therapist' = 'patient') => {
    setPdfLoading(kind);
    // Opened before the await, because a phone browser blocks a window opened
    // after one: by then the tap is over and it is a popup. The tab sits blank
    // while the sheet is built, then gets the same blob the download uses.
    const tab = window.open('', '_blank');
    try {
      const iso = dayKeyMemo;
      const res = await fetch(`${API_BASE}/daily-schedule-pdf?date=${iso}${kind === 'therapist' ? '&view=therapist' : ''}`);
      if (!res.ok) throw new Error('failed');
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = `ayurcalm-${kind === 'therapist' ? 'therapist-rota' : 'daily-schedule'}-${iso}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Not revoked: the new tab is still reading this URL. The browser frees it
      // when the page goes.
      return true;
    } catch {
      tab?.close();
      toast.error('Failed to generate PDF');
      return false;
    } finally {
      setPdfLoading(null);
    }
  };

  const tab = (
    <ScheduleTab
      timezone={ADMIN_TZ}
      ymdInTZ={ymdInTZ}
      appointmentsByDate={appointmentsByDate}
      timeSlots={timeSlots}
      dayKeyMemo={dayKeyMemo}
      patients={patients}
      roomsList={roomsList}
      staff={staff}
      therapyNameById={therapyNameById}
      setSelectedAppointment={setSelectedAppointment}
      setShowVerify={setShowVerify}
    />
  );

  return { tab, printSheet, pdfLoading };
}
