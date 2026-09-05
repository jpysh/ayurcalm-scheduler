import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Trash2 } from "lucide-react";

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
                      new Date(holiday.startDate || holiday.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:py-0 md:px-2">
                    {editingTimeOffId === holiday.id ? (
                      <Input type="datetime-local" step="60" value={toLocalInput(holiday.endDate || holiday.date)} onChange={(e: any) => setTimeOffs((prev: any[]) => prev.map((h: any) => (h.id === holiday.id ? { ...h, endDate: e.target.value } : h)))} />
                    ) : (
                      new Date(holiday.endDate || holiday.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
