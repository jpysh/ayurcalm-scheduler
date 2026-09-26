import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, toHHMM, toLocalInput, type UiTimeOff, type UiStaff, type UiRoom, type UiTherapy, type Patient } from "./shared";

const TimeOffTab = ({
  timeOffs,
  searchHolidays,
  setSearchHolidays,
  holidayTypeFilter,
  setHolidayTypeFilter,
  holidayViewMode,
  setHolidayViewMode,
  holidayRecurringFilter,
  setHolidayRecurringFilter,
  holidayFullDayFilter,
  setHolidayFullDayFilter,
  holidaySelectedDate,
  setHolidaySelectedDate,
  visibleTimeOffRows,
  timeoffTotalRef,
  editingTimeOffId,
  startEditTimeOff,
  cancelEditTimeOff,
  saveEditTimeOff,
  setTimeOffs,
  staff,
  roomsList,
  therapies,
  patients,
  staffNameById,
  roomNameById,
  therapyNameById,
  patientNameById,
  isFullDay,
  weeklyLabel,
  toLocalInput,
  requestDelete,
  setShowAddTimeOff,
}: any) => {
  return (
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Time Off (including Holidays)</CardTitle>
          <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Time Off" onClick={() => setShowAddTimeOff(true)}>
            <Plus />
          </Button>
        </div>
        <div className="mt-0.5 flex justify-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 md:h-10 px-3">Filter</Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-[320px] md:w-[520px]">
              <div className="grid grid-cols-2 gap-1">
                <div className="col-span-2">
                  <Input placeholder="Search" value={searchHolidays} onChange={(e: any) => setSearchHolidays(e.target.value)} className="h-7 text-center" />
                </div>
                <div>
                  <Select value={holidayTypeFilter} onValueChange={(v: any) => setHolidayTypeFilter(v)}>
                    <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Center">Center</SelectItem>
                      <SelectItem value="Staff">Staff</SelectItem>
                      <SelectItem value="Room">Room</SelectItem>
                      <SelectItem value="Therapy">Therapy</SelectItem>
                      <SelectItem value="Patient">Patient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={holidayViewMode} onValueChange={(v: any) => setHolidayViewMode(v)}>
                    <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="past">Past</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={holidayRecurringFilter} onValueChange={(v: any) => setHolidayRecurringFilter(v)}>
                    <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Recurrence</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="none">Non-recurring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={holidayFullDayFilter} onValueChange={(v: any) => setHolidayFullDayFilter(v)}>
                    <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Day Length</SelectItem>
                      <SelectItem value="full">Full Day</SelectItem>
                      <SelectItem value="partial">Partial Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Input type="date" lang="en-IN" value={holidaySelectedDate} onChange={(e: any) => setHolidaySelectedDate(e.target.value)} className="h-7" />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2">
        <Table data-testid="timeoff-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Type</TableHead>
              <TableHead className="h-7 py-0 text-xs md:text-sm font-normal">Start</TableHead>
              <TableHead className="h-7 py-0 text-xs md:text-sm font-normal">End</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Description</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Full Day</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Recurring</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Entity</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const rows = ((holidayTypeFilter === 'all' ? timeOffs : timeOffs.filter((h: any) => h.type === holidayTypeFilter)))
                .filter((h: any) => holidayRecurringFilter === 'all' ? true : holidayRecurringFilter === 'weekly' ? h.recurrence === 'weekly' : !h.recurrence)
                .filter((h: any) => holidayFullDayFilter === 'all' ? true : holidayFullDayFilter === 'full' ? isFullDay(h) : !isFullDay(h))
                .filter((h: any) => {
                  if (holidayViewMode === 'all') return true;
                  const today = new Date();
                  const onDate = holidaySelectedDate ? new Date(holidaySelectedDate) : undefined;
                  const startD = h.startDate ? new Date(h.startDate) : (h.date ? new Date(h.date) : undefined);
                  const endD = h.endDate ? new Date(h.endDate) : (h.date ? new Date(h.date) : undefined);
                  const weeklyHit = h.recurrence === 'weekly' && Array.isArray(h.weekdays)
                    ? h.weekdays!.includes(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][onDate ? onDate.getDay() : today.getDay()])
                    : false;
                  const ref = new Date((onDate || today).toDateString());
                  if (holidayViewMode === 'upcoming') {
                    if (h.recurrence === 'weekly') {
                      if (endD && endD < ref) return false;
                      return weeklyHit || !onDate;
                    }
                    return startD ? startD >= ref : false;
                  }
                  if (holidayViewMode === 'past') {
                    if (h.recurrence === 'weekly') {
                      return endD ? endD < ref : false;
                    }
                    return endD ? endD < ref : false;
                  }
                  return true;
                }).filter((h: any) => {
                  const q = String(searchHolidays || '').trim().toLowerCase();
                  if (!q) return true;
                  const startStr = String(h.startDate || h.date || '').toLowerCase();
                  const endStr = String(h.endDate || h.date || '').toLowerCase();
                  return h.description.toLowerCase().includes(q) || h.type.toLowerCase().includes(q) || h.entity.toLowerCase().includes(q) || startStr.includes(q) || endStr.includes(q);
                }).sort((a: any, b: any) => {
                  const aStart = a.startDate || a.date || '';
                  const bStart = b.startDate || b.date || '';
                  return new Date(aStart).getTime() - new Date(bStart).getTime();
                });
              timeoffTotalRef.current = rows.length;
              const shown = rows.slice(0, visibleTimeOffRows);
              return shown.map((holiday: any) => (
                <TableRow key={holiday.id} className="h-7">
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <Select value={holiday.type} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, type: v as "Center" | "Staff" | "Room" | "Therapy" | "Patient", entity: v === 'Center' ? 'All' : '' } : h)))}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Center">Center</SelectItem>
                          <SelectItem value="Staff">Staff</SelectItem>
                          <SelectItem value="Room">Room</SelectItem>
                          <SelectItem value="Therapy">Therapy</SelectItem>
                          <SelectItem value="Patient">Patient</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={holiday.type === "Center" ? "default" : "secondary"}>{holiday.type}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <Input type="datetime-local" step="60" value={toLocalInput(holiday.startDate || holiday.date)} onChange={(e: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, startDate: e.target.value } : h)))} />
                    ) : (
                      new Date(holiday.startDate || holiday.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', ...(isFullDay(holiday) && !holiday.startDate ? {} : { hour: '2-digit', minute: '2-digit' }) })
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <Input type="datetime-local" step="60" value={toLocalInput(holiday.endDate || holiday.date)} onChange={(e: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, endDate: e.target.value } : h)))} />
                    ) : (
                      new Date(holiday.endDate || holiday.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', ...(isFullDay(holiday) && !holiday.startDate ? {} : { hour: '2-digit', minute: '2-digit' }) })
                    )}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0.5 pl-1.5 pr-1 md:py-3 md:px-3">
                    {editingTimeOffId === holiday.id ? (
                      <Input value={holiday.description} onChange={(e: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, description: e.target.value } : h)))} />
                    ) : (
                      holiday.description
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <Select value={isFullDay(holiday) ? 'yes' : 'no'} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => {
                        if (h.id !== holiday.id) return h;
                        if (v === 'yes') {
                          const sBase = h.startDate || h.date;
                          const eBase = h.endDate || h.date;
                          const sIso = sBase ? new Date(sBase) : undefined;
                          const eIso = eBase ? new Date(eBase) : undefined;
                          const setHM = (d: Date, hh: number, mm: number) => { const nd = new Date(d); nd.setHours(hh, mm, 0, 0); return nd.toISOString(); };
                          return { ...h, startDate: sIso ? setHM(sIso, 9, 0) : h.startDate, endDate: eIso ? setHM(eIso, 18, 0) : h.endDate, startTime: '09:00', endTime: '18:00' };
                        }
                        return { ...h };
                      }))}>
                        <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      isFullDay(holiday) ? 'Yes' : 'No'
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <div className="flex items-center gap-2">
                        <Select value={holiday.recurrence || 'none'} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, recurrence: (v === 'none' ? undefined : 'weekly'), weekdays: v === 'weekly' ? (h.weekdays || ['sunday']) : undefined } : h)))}>
                          <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                        {holiday.recurrence === 'weekly' && (
                          <div className="flex gap-1 flex-wrap">
                            {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                              const selected = (holiday.weekdays || []).includes(wd);
                              return (
                                <Button key={wd} type="button" variant={selected ? 'default' : 'outline'} className="h-6 px-2 py-0 text-[11px]"
                                  onClick={() => setTimeOffs((prev: any[]) => prev.map((h: any) => {
                                    if (h.id !== holiday.id) return h;
                                    const set = new Set(h.weekdays || []);
                                    if (set.has(wd)) set.delete(wd); else set.add(wd);
                                    return { ...h, weekdays: Array.from(set) };
                                  }))}
                                >
                                  {wd.slice(0,3).toUpperCase()}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      holiday.recurrence === 'weekly' ? weeklyLabel(holiday.weekdays) : 'none'
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      holiday.type === 'Center' ? (
                        <Input value="All" readOnly />
                      ) : holiday.type === 'Staff' ? (
                        <Select value={holiday.entity} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, entity: v } : h)))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {staff.map((s: any) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : holiday.type === 'Room' ? (
                        <Select value={holiday.entity} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, entity: v } : h)))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {roomsList.map((r: any) => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : holiday.type === 'Therapy' ? (
                        <Select value={holiday.entity} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, entity: v } : h)))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {therapies.map((t: any) => (<SelectItem key={String(t.id ?? t.name)} value={String(t.id ?? t.name)}>{t.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={holiday.entity} onValueChange={(v: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, entity: v } : h)))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {patients.map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      holiday.type === 'Center' ? 'All' : (
                        holiday.type === 'Staff' ? (staffNameById[holiday.entity] ?? holiday.entity) :
                        holiday.type === 'Room' ? (roomNameById[holiday.entity] ?? holiday.entity) :
                        holiday.type === 'Therapy' ? (therapyNameById[holiday.entity] ?? holiday.entity) :
                        (patientNameById[holiday.entity] ?? holiday.entity)
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {editingTimeOffId === holiday.id ? (
                        <>
                          <Button variant="outline" size="sm" className="h-10" onClick={cancelEditTimeOff}>Cancel</Button>
                          <Button size="sm" className="h-10" onClick={saveEditTimeOff}>Save</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => startEditTimeOff(holiday)}>
                            <Edit className="w-2 h-2 md:w-4 md:h-4" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => requestDelete('timeoff', holiday.id, holiday.description)}>
                            <Trash2 className="w-2 h-2 md:w-4 md:h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ));
            })()}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default TimeOffTab;

/** The Time off screen: its filters, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useTimeOffScreen({ timeOffs, setTimeOffs, staff, roomsList, therapies, patients, staffNameById, roomNameById, therapyNameById, patientNameById, isMobile, requestDelete, loadReplans, refreshAppointmentsForDate, todayKey }: {
  timeOffs: UiTimeOff[]; setTimeOffs: React.Dispatch<React.SetStateAction<UiTimeOff[]>>;
  staff: UiStaff[]; roomsList: UiRoom[]; therapies: UiTherapy[]; patients: Patient[];
  staffNameById: Record<string, string>; roomNameById: Record<string, string>; therapyNameById: Record<string, string>; patientNameById: Record<string, string>;
  isMobile: boolean; requestDelete: (kind: "timeoff", id: string, name?: string) => void;
  loadReplans: () => void; refreshAppointmentsForDate: (iso: string, silent?: boolean) => Promise<void>; todayKey: string;
}) {
  const [holidayTypeFilter, setHolidayTypeFilter] = useState<'all' | 'Center' | 'Staff' | 'Room' | 'Therapy' | 'Patient'>('all');
  const [holidayViewMode, setHolidayViewMode] = useState<'all'|'upcoming'|'past'>('upcoming');
  const [holidaySelectedDate, setHolidaySelectedDate] = useState<string>('');
  const [holidayRecurringFilter, setHolidayRecurringFilter] = useState<'all'|'weekly'|'none'>('all');
  const [holidayFullDayFilter, setHolidayFullDayFilter] = useState<'all'|'full'|'partial'>('all');
  const [searchHolidays, setSearchHolidays] = useState("");
  const [showAddTimeOff, setShowAddTimeOff] = useState(false);
  const [visibleTimeOffRows, setVisibleTimeOffRows] = useState(isMobile ? 20 : 40);
  const timeoffTotalRef = useRef(0);
  useEffect(() => { setVisibleTimeOffRows(isMobile ? 20 : 40); }, [searchHolidays, timeOffs, holidayTypeFilter, holidayViewMode, holidayRecurringFilter, holidayFullDayFilter, holidaySelectedDate, isMobile]);
  const [newTimeOff, setNewTimeOff] = useState({
    date: "",
    endDate: "",
    type: "Center" as "Center" | "Staff" | "Room" | "Therapy" | "Patient",
    entity: "",
    fullDay: false,
    description: "",
  });

  const [editingTimeOffId, setEditingTimeOffId] = useState<string | null>(null);
  const [originalTimeOff, setOriginalTimeOff] = useState<UiTimeOff | null>(null);

  const setTimeHM = (iso: string, hh: number, mm: number) => {
    const d = new Date(iso);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  const isFullDay = (h: UiTimeOff) => {
    // A single date with no times is the whole day.
    if (h.date && !h.startDate && !h.startTime) return true;
    const sT = h.startTime || toHHMM(h.startDate || h.date);
    const eT = h.endTime || toHHMM(h.endDate || h.date);
    return sT === '09:00' && eT === '18:00';
  };
  const weeklyLabel = (weekdays?: UiTimeOff['weekdays']) => {
    if (!weekdays || weekdays.length === 0) return 'none';
    const map: Record<string, string> = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
    return `Weekly: ${weekdays.map((w) => map[w] || w).join(', ')}`;
  };

  const startEditTimeOff = (h: UiTimeOff) => {
    setEditingTimeOffId(h.id);
    setOriginalTimeOff({ ...h });
  };

  const saveEditTimeOff = async () => {
    if (!editingTimeOffId) return;
    const h = timeOffs.find((x) => x.id === editingTimeOffId);
    if (!h) return;
    const payload = {
      entity_type: h.type.toLowerCase(),
      entity_id: h.type === 'Center' ? null : h.entity,
      date: h.date,
      start_date: h.startDate,
      end_date: h.endDate,
      start_time: toHHMM(h.startDate || h.date),
      end_time: toHHMM(h.endDate || h.date),
      recurrence: h.recurrence,
      weekdays: h.weekdays,
      description: h.description,
    };
    try {
      const res = await fetch(`${API_BASE}/timeoff/${h.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
      const updated = await res.json();
      setTimeOffs((prev) => prev.map((x) => x.id === h.id ? { ...x, date: updated.date ? new Date(updated.date).toISOString() : undefined, startDate: updated.start_date ? new Date(updated.start_date).toISOString() : undefined, endDate: updated.end_date ? new Date(updated.end_date).toISOString() : undefined, startTime: updated.start_time || undefined, endTime: updated.end_time || undefined, recurrence: updated.recurrence || undefined, weekdays: updated.weekdays || undefined } : x));
      setEditingTimeOffId(null);
      setOriginalTimeOff(null);
    } catch {
      toast.error('Failed to save time off');
    }
  };

  const cancelEditTimeOff = () => {
    if (originalTimeOff) {
      setTimeOffs((prev) => prev.map((x) => (x.id === originalTimeOff.id ? originalTimeOff : x)));
    }
    setEditingTimeOffId(null);
    setOriginalTimeOff(null);
  };

  const tab = (
            <TimeOffTab
              timeOffs={timeOffs}
              searchHolidays={searchHolidays}
              setSearchHolidays={setSearchHolidays}
              holidayTypeFilter={holidayTypeFilter}
              setHolidayTypeFilter={setHolidayTypeFilter}
              holidayViewMode={holidayViewMode}
              setHolidayViewMode={setHolidayViewMode}
              holidayRecurringFilter={holidayRecurringFilter}
              setHolidayRecurringFilter={setHolidayRecurringFilter}
              holidayFullDayFilter={holidayFullDayFilter}
              setHolidayFullDayFilter={setHolidayFullDayFilter}
              holidaySelectedDate={holidaySelectedDate}
              setHolidaySelectedDate={setHolidaySelectedDate}
              visibleTimeOffRows={visibleTimeOffRows}
              timeoffTotalRef={timeoffTotalRef}
              editingTimeOffId={editingTimeOffId}
              startEditTimeOff={startEditTimeOff}
              cancelEditTimeOff={cancelEditTimeOff}
              saveEditTimeOff={saveEditTimeOff}
              setTimeOffs={setTimeOffs}
              staff={staff}
              roomsList={roomsList}
              therapies={therapies}
              patients={patients}
              staffNameById={staffNameById}
              roomNameById={roomNameById}
              therapyNameById={therapyNameById}
              patientNameById={patientNameById}
              isFullDay={isFullDay}
              weeklyLabel={weeklyLabel}
              toLocalInput={toLocalInput}
              requestDelete={requestDelete}
              setShowAddTimeOff={setShowAddTimeOff}
            />
  );

  const dialogs = (
      <Dialog open={showAddTimeOff} onOpenChange={setShowAddTimeOff}>
        <DialogContent className="max-w-sm p-3">
          <DialogHeader>
            <DialogTitle className="text-lg">Add TimeOff</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            <Label>Type</Label>
            <Select value={newTimeOff.type} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, type: v as "Center" | "Staff" | "Room" | "Therapy" | "Patient", entity: v === 'Center' ? 'All' : '' })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Center">Center</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="Room">Room</SelectItem>
                <SelectItem value="Therapy">Therapy</SelectItem>
                <SelectItem value="Patient">Patient</SelectItem>
              </SelectContent>
            </Select>
            <Label>Entity</Label>
            {newTimeOff.type === 'Center' ? (
              <Input className="h-8" value="All" readOnly />
            ) : newTimeOff.type === 'Staff' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : newTimeOff.type === 'Room' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {roomsList.map((r) => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : newTimeOff.type === 'Therapy' ? (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select therapy" /></SelectTrigger>
                <SelectContent>
                  {therapies.map((t) => (<SelectItem key={String(t.id ?? t.name)} value={String(t.id ?? t.name)}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={newTimeOff.entity} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, entity: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            <Label>Full day</Label>
            <Select value={newTimeOff.fullDay ? 'yes' : 'no'} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, fullDay: v === 'yes' })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
            <Label>Start</Label>
            {newTimeOff.fullDay ? (
              <Input type="date" className="h-8" value={newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, date: e.target.value })} />
            ) : (
              <Input type="datetime-local" step="60" className="h-8" value={newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, date: e.target.value })} />
            )}
            <Label>End</Label>
            {newTimeOff.fullDay ? (
              <Input type="date" className="h-8" value={newTimeOff.endDate || newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })} />
            ) : (
              <Input type="datetime-local" step="60" className="h-8" value={newTimeOff.endDate || newTimeOff.date} onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })} />
            )}
            <Label>Recurring</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={newTimeOff.recurrence || 'none'} onValueChange={(v) => setNewTimeOff({ ...newTimeOff, recurrence: (v === 'none' ? undefined : 'weekly'), weekdays: v === 'weekly' ? (newTimeOff.weekdays || ['sunday']) : undefined })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {newTimeOff.recurrence === 'weekly' && (
                <div className="flex gap-1 flex-wrap">
                  {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                    const selected = (newTimeOff.weekdays || []).includes(wd);
                    return (
                      <Button key={wd} type="button" variant={selected ? 'default' : 'outline'} className="h-7 px-2 py-0 text-xs"
                        onClick={() => {
                          const set = new Set(newTimeOff.weekdays || []);
                          if (set.has(wd)) set.delete(wd); else set.add(wd);
                          setNewTimeOff({ ...newTimeOff, weekdays: Array.from(set) as UiTimeOff['weekdays'] });
                        }}
                      >
                        {wd.slice(0,3).toUpperCase()}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
            <Label htmlFor="newTimeOffDescription">Description</Label>
            <Input id="newTimeOffDescription" className="h-8" value={newTimeOff.description} onChange={(e) => setNewTimeOff({ ...newTimeOff, description: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddTimeOff(false)}>Cancel</Button>
              <Button onClick={async () => {
                if (newTimeOff.type !== 'Center' && !newTimeOff.entity) {
                  toast.error('Select an entity for the chosen type');
                  return;
                }
                const entity_type = newTimeOff.type.toLowerCase();
                const tempId = `temp-${Date.now()}`;
                const baseStart = newTimeOff.date;
                const baseEnd = newTimeOff.endDate || newTimeOff.date;
                const startIso = newTimeOff.fullDay ? setTimeHM(baseStart, 9, 0) : baseStart;
                const endIso = newTimeOff.fullDay ? setTimeHM(baseEnd, 18, 0) : baseEnd;
                const optimistic: UiTimeOff = { id: tempId, startDate: startIso, endDate: endIso, recurrence: newTimeOff.recurrence, weekdays: newTimeOff.weekdays as UiTimeOff['weekdays'], type: newTimeOff.type, entity: newTimeOff.type === 'Center' ? 'All' : (newTimeOff.entity || ''), description: newTimeOff.description };
                setTimeOffs((prev) => [...prev, optimistic]);
                setShowAddTimeOff(false);
                setNewTimeOff({ date: '', endDate: '', type: 'Center', entity: '', fullDay: false, description: '', recurrence: undefined, weekdays: undefined });
                toast.success('Time off saved');
                try {
                  const res = await fetch(`${API_BASE}/timeoff`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      entity_type,
                      entity_id: optimistic.entity === 'All' ? null : (optimistic.entity || null),
                      start_date: optimistic.startDate,
                      end_date: optimistic.endDate,
                      start_time: newTimeOff.fullDay ? '09:00' : toHHMM(optimistic.startDate),
                      end_time: newTimeOff.fullDay ? '18:00' : toHHMM(optimistic.endDate),
                      recurrence: optimistic.recurrence,
                      weekdays: optimistic.weekdays,
                      description: optimistic.description,
                    }),
                  });
                  const created = await res.json();
                  // Marking a therapist off rebuilds their day on the server.
                  // Show what it did where the admin is looking next.
                  if (Array.isArray(created.replan) && created.replan.length > 0) {
                    const total = created.replan.reduce((n: number, r: { moved: unknown[] }) => n + r.moved.length, 0);
                    toast.success(`${total} treatment${total === 1 ? '' : 's'} rebooked — see the top of the dashboard`);
                    loadReplans();
                    refreshAppointmentsForDate(todayKey, true);
                  }
                  setTimeOffs((prev) => prev.map((h) => h.id === tempId ? { id: created.id, startDate: created.start_date ? new Date(created.start_date).toISOString() : undefined, endDate: created.end_date ? new Date(created.end_date).toISOString() : undefined, recurrence: created.recurrence || undefined, weekdays: created.weekdays || undefined, type: optimistic.type, entity: created.entity_id ?? optimistic.entity, description: created.description ?? optimistic.description } : h));
                } catch {
                  toast.error('Failed to save time off');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );

  return { tab, dialogs, setVisibleRows: setVisibleTimeOffRows, totalRef: timeoffTotalRef };
}
