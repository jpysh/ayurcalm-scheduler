import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import DayGrid from "@/components/DayGrid";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type ScheduleTabProps = {
  currentDate: Date;
  /** The centre's timezone, from Settings. */
  timezone: string;
  viewType: "day" | "week";
  setCurrentDate: (d: Date) => void;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  showCalendar: boolean;
  setShowCalendar: (b: boolean) => void;
  calRange: { min: Date; max: Date };
  ymdInTZ: (d: Date) => string;
  appointmentsByDate: Record<string, ApiAppointment[]>;
  timeSlots: string[];
  dayKeyMemo: string;
  patients: { id: string | number; name: string }[];
  roomsList: { id: string | number; name: string }[];
  staff: { id: string | number; name: string }[];
  therapyNameById: Record<string, string>;
  setSelectedAppointment: (v: ApiAppointment) => void;
  pdfLoading: 'patient' | 'therapist' | null;
  handleGenerateDailyPdf: (kind?: 'patient' | 'therapist') => void;
  setShowAutoAssign: (b: boolean) => void;
  setShowVerify: (b: boolean) => void;
  verifyOpen: number;
  calendarTriggerRef: RefObject<HTMLButtonElement | null>;
  calendarRef: RefObject<HTMLDivElement | null>;
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

const ScheduleTab = ({
  currentDate,
  viewType,
  setCurrentDate,
  goToPreviousWeek,
  goToNextWeek,
  goToPreviousDay,
  goToNextDay,
  showCalendar,
  setShowCalendar,
  calRange,
  ymdInTZ,
  appointmentsByDate,
  timeSlots,
  dayKeyMemo,
  patients,
  roomsList,
  staff,
  therapyNameById,
  setSelectedAppointment,
  pdfLoading,
  handleGenerateDailyPdf,
  setShowAutoAssign,
  setShowVerify,
  verifyOpen,
  calendarTriggerRef,
  calendarRef,
  timezone,
}: ScheduleTabProps) => {
  // Still prints: the admin may be printing on purpose. It just says so (#134).
  const openNote = verifyOpen ? ` · ${verifyOpen} open` : "";
  const dateLabel = (() => {
    try {
      // The centre's timezone, so the heading names the day whose appointments
      // are underneath it. On a machine behind the centre these differ, and the
      // day sheet is printed from what this says.
      return new Date(currentDate).toLocaleDateString("en-IN", {
        timeZone: timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return String(currentDate);
    }
  })();

  return (
    <Card>
      <CardHeader className="px-3 pt-3 pb-2 md:px-3 md:pt-4 md:pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewType === "week" ? goToPreviousWeek : goToPreviousDay}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex flex-col items-center cursor-pointer" onClick={() => setShowCalendar(!showCalendar)}>
              <CardTitle className="text-base md:text-base font-semibold">Schedule</CardTitle>
              <span className="text-xs font-normal text-muted-foreground">{dateLabel}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewType === "week" ? goToNextWeek : goToNextDay}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-2">
            <Button variant="secondary" size="sm" className="h-8 px-3" onClick={() => setShowAutoAssign(true)}>Assign</Button>
            <Button variant="secondary" size="sm" className="h-8 px-3" onClick={() => setShowVerify(true)}>Verify</Button>
            <Button size="sm" className="h-8 px-3" disabled={!!pdfLoading} onClick={() => handleGenerateDailyPdf('patient')}>{pdfLoading === 'patient' ? "Generating…" : `Patient PDF${openNote}`}</Button>
            <Button size="sm" variant="outline" className="h-8 px-3" disabled={!!pdfLoading} onClick={() => handleGenerateDailyPdf('therapist')}>{pdfLoading === 'therapist' ? "Generating…" : `Therapist PDF${openNote}`}</Button>
          </div>
        </div>
      </CardHeader>
      {showCalendar && (
        <div className="flex justify-center mb-2">
          <div ref={calendarRef as any} className="rounded-md border bg-background p-2 shadow-sm w-fit max-w-[18rem] z-10">
            <div className="flex items-center gap-2 mb-2">
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => {
                const t = new Date();
                const nd = new Date(t.getFullYear(), t.getMonth(), t.getDate());
                setCurrentDate(nd);
                setShowCalendar(false);
              }}>Today</Button>
              <Input type="date" lang="en-IN" value={ymdInTZ(currentDate)} min={ymdInTZ(calRange.min)} max={ymdInTZ(calRange.max)} onChange={(e: any) => {
                const v = e.target.value;
                if (!v) return;
                const [y, m, d] = v.split('-').map((x: string) => parseInt(x, 10));
                if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return;
                const nd = new Date(y, m - 1, d);
                if (isNaN(nd.getTime())) return;
                setCurrentDate(nd);
              }} className="h-7 text-[0.8rem] w-[9.5rem] px-2 py-1" />
            </div>
            <Calendar mode="single" selected={new Date(currentDate)} onSelect={(d) => { if (!d) return; const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate()); setCurrentDate(nd); setShowCalendar(false); }} showOutsideDays={false} disabled={(date) => date < calRange.min || date > calRange.max} className="p-1" classNames={{ months: "flex flex-col space-y-1", month: "space-y-1", table: "border-collapse w-auto", head_row: "flex", head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.7rem] text-center flex items-center justify-center", row: "flex w-full mt-0", cell: "h-7 w-7 text-center text-xs p-0 flex items-center justify-center [&:not(:has(button))]:w-0 [&:not(:has(button))]:p-0 [&:not(:has(button))]:m-0 [&:not(:has(button))]:overflow-hidden", day: "h-7 w-7 p-0 font-normal aria-selected:opacity-100" }} />
          </div>
        </div>
      )}
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
};

export default ScheduleTab;

/** The Schedule screen: the day it is on, the calendar and the day sheets, held by the dashboard so they last as long as it does. */
export function useScheduleScreen({ currentDate, setCurrentDate, ...rest }: Record<string, any> & { currentDate: Date; setCurrentDate: (d: Date) => void }) {
  const { ADMIN_TZ, viewType, ymdInTZ, appointmentsByDate, timeSlots, dayKeyMemo, patients, roomsList, staff, therapyNameById, setSelectedAppointment, setShowAutoAssign, setShowVerify, dayCheck, exceptionDayKey } = rest;
  const [showCalendar, setShowCalendar] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<'patient' | 'therapist' | null>(null);
  // Two sheets off the same day: the patient one for the notice board, the
  // therapist rota for the treatment team.
  const handleGenerateDailyPdf = async (kind: 'patient' | 'therapist' = 'patient') => {
    setPdfLoading(kind);
    // Opened before the await, because a phone browser blocks a window opened
    // after one: by then the tap is over and it is a popup. The tab sits blank
    // while the sheet is built, then gets the same blob the download uses.
    const tab = window.open('', '_blank');
    try {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;
      const res = await fetch(`${API_BASE}/daily-schedule-pdf?date=${iso}${kind === 'therapist' ? '&view=therapist' : ''}`);
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = `ayurcalm-${kind === 'therapist' ? 'therapist-rota' : 'daily-schedule'}-${iso}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Not revoked: the new tab is still reading this URL. The browser frees it
      // when the page goes.
    } catch {
      tab?.close();
      toast.error('Failed to generate PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  const calRange = useMemo(() => {
    const t = new Date();
    const min = new Date(t.getFullYear() - 3, t.getMonth(), t.getDate());
    const max = new Date(t.getFullYear() + 3, t.getMonth(), t.getDate());
    return { min, max };
  }, []);

  const calendarRef = useRef<HTMLDivElement | null>(null);
  const calendarTriggerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showCalendar) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (calendarRef.current && calendarRef.current.contains(t)) return;
      if (calendarTriggerRef.current && calendarTriggerRef.current.contains(t)) return;
      setShowCalendar(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCalendar]);

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToPreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const tab = (
            <ScheduleTab
              currentDate={currentDate}
              timezone={ADMIN_TZ}
              viewType={viewType}
              setCurrentDate={setCurrentDate}
              goToPreviousWeek={goToPreviousWeek}
              goToNextWeek={goToNextWeek}
              goToPreviousDay={goToPreviousDay}
              goToNextDay={goToNextDay}
              showCalendar={showCalendar}
              setShowCalendar={setShowCalendar}
              calRange={calRange}
              ymdInTZ={ymdInTZ}
              appointmentsByDate={appointmentsByDate}
              timeSlots={timeSlots}
              dayKeyMemo={dayKeyMemo}
              patients={patients}
              roomsList={roomsList}
              staff={staff}
              therapyNameById={therapyNameById}
              setSelectedAppointment={setSelectedAppointment}
              pdfLoading={pdfLoading}
              handleGenerateDailyPdf={handleGenerateDailyPdf}
              setShowAutoAssign={setShowAutoAssign}
              setShowVerify={setShowVerify}
              // Verify's open items apply to today only, the day /day-check reads.
              verifyOpen={dayKeyMemo === exceptionDayKey ? dayCheck.problems.filter((p) => p.problem_class === 'blocking').length : 0}
              calendarTriggerRef={calendarTriggerRef}
              calendarRef={calendarRef}
            />
  );

  return { tab };
}
