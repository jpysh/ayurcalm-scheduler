import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";

type ScheduleTabProps = {
  currentDate: Date;
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
  roomsToRender: { id: string | number; name: string }[];
  dayGridCols: string;
  dayKeyMemo: string;
  dayRoomsSet: unknown;
  dayScrollRef: RefObject<HTMLDivElement | null>;
  timeHeaderRef: RefObject<HTMLDivElement | null>;
  dayScrollProgress: number;
  prevRoom: () => void;
  nextRoom: () => void;
  weekCompact: boolean;
  setWeekCompact: (b: boolean) => void;
  patients: { id: string | number; name: string }[];
  roomsList: { id: string | number; name: string }[];
  staff: { id: string | number; name: string }[];
  therapyNameById: Record<string, string>;
  setSelectedAppointment: (v: ApiAppointment) => void;
  pdfLoading: boolean;
  handleGenerateDailyPdf: () => void;
  setShowAutoAssign: (b: boolean) => void;
  setShowVerify: (b: boolean) => void;
  calendarTriggerRef: RefObject<HTMLButtonElement | null>;
  calendarRef: RefObject<HTMLDivElement | null>;
};

type ApiAppointment = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  room_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status?: "pending" | "confirmed" | "completed" | "cancelled" | "rescheduled";
};
type PatientLite = { id: string | number; name: string };

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
  roomsToRender,
  dayGridCols,
  dayKeyMemo,
  dayRoomsSet,
  dayScrollRef,
  timeHeaderRef,
  dayScrollProgress,
  prevRoom,
  nextRoom,
  weekCompact,
  setWeekCompact,
  patients,
  roomsList,
  staff,
  therapyNameById,
  setSelectedAppointment,
  pdfLoading,
  handleGenerateDailyPdf,
  setShowAutoAssign,
  setShowVerify,
  calendarTriggerRef,
  calendarRef,
}: ScheduleTabProps) => {
  const dateLabel = (() => {
    try {
      return new Date(currentDate).toLocaleDateString("en-IN", {
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
          
          <div className="flex items-center justify-center gap-2 md:gap-2">
            <Button variant="secondary" size="sm" className="h-8 px-3" onClick={() => setShowAutoAssign(true)}>Assign</Button>
            <Button variant="secondary" size="sm" className="h-8 px-3" onClick={() => setShowVerify(true)}>Verify</Button>
            <Button size="sm" className="h-8 px-3" disabled={!!pdfLoading} onClick={handleGenerateDailyPdf}>{pdfLoading ? "Generating…" : "PDF"}</Button>
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
        {(() => {
          const byDate = appointmentsByDate as Record<string, ApiAppointment[]>;
          const dayKey = String(dayKeyMemo || "");
          const dayAppointments = Array.isArray(byDate?.[dayKey]) ? byDate[dayKey] : [];
          const index = new Map<string, ApiAppointment[]>();
          for (const a of dayAppointments) {
            const rid = String(a.room_id ?? "");
            const key = `${rid}-${a.start_time}`;
            const list = index.get(key) || [];
            list.push(a);
            index.set(key, list);
          }
          const pArr = Array.isArray(patients) ? (patients as PatientLite[]) : [];
          const patientNameById = new Map<string, string>(pArr.map((p) => [String(p.id), String(p.name || "")]));
          const sArr = Array.isArray(staff) ? (staff as PatientLite[]) : [];
          const staffNameById = new Map<string, string>(sArr.map((s) => [String(s.id), String((s as any).name || "")]));
          const tNameById = (therapyNameById || {}) as Record<string, string>;
          return null;
        })()}
        {/* room arrows row removed */}

        <div ref={dayScrollRef} className="overflow-x-auto">
          <div className="min-w-max">
            <div className="grid gap-1 md:gap-1 mb-1 sticky top-0 z-20 bg-background px-0" style={{ gridTemplateColumns: String(dayGridCols || '') }}>
              <div ref={timeHeaderRef} className="font-semibold text-base md:text-base text-muted-foreground px-2">Time</div>
              {Array.isArray(roomsToRender) && roomsToRender.map((room) => (
                <div key={String(room.id)} className="font-semibold text-base md:text-base text-center px-2">
                  <div className="min-w-0 w-full overflow-hidden">
                    <div className="truncate w-full text-center">{String(room.name)}</div>
                  </div>
                </div>
              ))}
            </div>

            {(() => {
              const dayAppointments = Array.isArray(appointmentsByDate?.[String(dayKeyMemo || '')]) ? appointmentsByDate[String(dayKeyMemo || '')] : [];
              if ((Array.isArray(dayAppointments) ? dayAppointments.length : 0) === 0) {
                return <div className="p-4 text-sm md:text-sm text-muted-foreground">No bookings for today</div>;
              }
              return Array.isArray(timeSlots) ? timeSlots.map((time) => {
                const appointmentsAtTime = dayAppointments.filter((apt: any) => apt.start_time === time);
                const hasAny = appointmentsAtTime.some((apt: any) => (dayRoomsSet as any)?.has ? (dayRoomsSet as any).has(apt.room_id) : true);
                if (!hasAny) return null;
                return (
                  <div key={time} className={`grid gap-2 md:gap-2 border-t ${String(time).endsWith(':00') ? 'border-t-2' : ''} border-border`} style={{ gridTemplateColumns: String(dayGridCols || '') }}>
                    <div className="flex items-center min-h-12 md:min-h-14 sticky left-0 z-20 bg-background px-2">
                      <span className="font-medium text-sm md:text-sm">{time}</span>
                    </div>
                    {Array.isArray(roomsToRender) && roomsToRender.map((room) => {
                      const rid = String(room.id);
                      const slot = dayAppointments.filter((apt: any) => String(apt.room_id ?? '') === rid && apt.start_time === time);
                      return (
                        <div key={rid} className="min-h-12 md:min-h-14 px-1 py-1">
                          {(() => {
                            const patientNameMap = new Map<string, string>(patients.map(p => [String(p.id), String(p.name)]));
                            const staffNameMap = new Map<string, string>(staff.map(s => [String(s.id), String(s.name)]));
                            const items = slot.map((a: any) => {
                              const pname = String(patientNameMap.get(String(a.patient_id)) || 'Patient');
                              const tname = String(therapyNameById[String(a.therapy_id)] || 'Therapy');
                              const sname = String(staffNameMap.get(String(a.staff_id ?? '')) || '');
                              const mins = Number(a.duration_minutes) || 0;
                              const roomInfo = Array.isArray(roomsList) ? (roomsList as any[]).find((rr) => String(rr.id) === String(a.room_id)) : null;
                              return (
                                <Card
                                  key={a.id}
                                  className="h-full bg-primary/10 border-primary/30 hover:bg-primary/20 transition-colors cursor-pointer rounded-md mx-0 w-full"
                                  onClick={() => setSelectedAppointment({
                                    id: a.id,
                                    scheduled_date: a.scheduled_date,
                                    start_time: a.start_time,
                                    duration_minutes: a.duration_minutes,
                                    patient_id: a.patient_id,
                                    therapy_id: a.therapy_id,
                                    staff_id: a.staff_id,
                                    room_id: a.room_id,
                                    patient: pname,
                                    therapy: tname,
                                    staff: sname,
                                    room: roomInfo ? String((roomInfo as any).name) : String(a.room_id || ''),
                                    roomAmenities: roomInfo && Array.isArray((roomInfo as any).amenities) ? (roomInfo as any).amenities : [],
                                  })}
                                >
                                  <CardContent className="p-2 md:p-2 flex flex-col items-start justify-center gap-0.5">
                                    <div className="font-semibold text-sm md:text-sm whitespace-normal break-words">{pname}</div>
                                    <div className="text-xs md:text-xs text-muted-foreground whitespace-normal break-words">{`${tname} (${mins}min)`}</div>
                                    {sname ? (
                                      <Badge variant="secondary" className="w-fit text-xs md:text-xs max-w-full whitespace-normal break-words leading-tight">{`Staff: ${sname}`}</Badge>
                                    ) : null}
                                  </CardContent>
                                </Card>
                              );
                            });
                            if (items.length === 0) {
                              return <div className="h-full border-2 border-dashed border-border rounded-md hover:border-primary/50 transition-colors cursor-pointer" />;
                            }
                            return items;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                );
              }) : null;
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleTab;
