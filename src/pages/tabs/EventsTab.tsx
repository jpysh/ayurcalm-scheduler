import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { API_TOKEN, type ApiProgramEvent, type UiStaff, type UiRoom, type Patient } from "./shared";

const EventsTab = ({
  events,
  visibleEventsRows,
  eventsTotalRef,
  editingEventId,
  setEditingEventId,
  originalEvent,
  setOriginalEvent,
  scheduleEventAutosave,
  roomsList,
  staff,
  patients,
  amenityOptions,
  eventAmenityDrafts,
  setEventAmenityDrafts,
  toggleEventAmenity,
  addAmenityToEvent,
  isMobile,
  staffNameById,
  patientNameById,
  API_BASE,
  API_TOKEN,
  setShowAddEvent,
  setEvents,
}: any) => {
  const formatIndianDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
  };

  return (
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Events</CardTitle>
          <Button aria-label="Add Event" size="sm" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" onClick={() => setShowAddEvent(true)}>
            <Plus />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2 space-y-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Activity</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Time</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Start Date</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">End Date</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Room</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Staff</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Req. Amenities</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Patients</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Attendance</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Recurring</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const rows = events.sort((a: any, b: any) => (a.activity_name || '').localeCompare(b.activity_name || ''));
              eventsTotalRef.current = rows.length;
              const shown = rows.slice(0, visibleEventsRows);
              return shown.map((ev: any) => (
                <TableRow key={ev.id} className="h-7">
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Input value={ev.activity_name} onChange={(e) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, activity_name: e.target.value } : x)); }} onBlur={() => scheduleEventAutosave(ev.id, 'Activity')} />
                    ) : (
                      ev.activity_name
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <div className="flex gap-1">
                        <div className="flex gap-1 items-center">
                          <Input type="time" step="900" value={ev.start_time || ''} onChange={(e) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, start_time: e.target.value } : x)); }} onBlur={() => scheduleEventAutosave(ev.id, 'Time')} />
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, start_time: '' } : x)); scheduleEventAutosave(ev.id, 'Time'); }}>Clear</Button>
                        </div>
                        <div className="flex gap-1 items-center">
                          <Input type="time" step="900" value={ev.end_time || ''} onChange={(e) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, end_time: e.target.value } : x)); }} onBlur={() => scheduleEventAutosave(ev.id, 'Time')} />
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, end_time: '' } : x)); scheduleEventAutosave(ev.id, 'Time'); }}>Clear</Button>
                        </div>
                      </div>
                    ) : (
                      `${ev.start_time}–${ev.end_time}`
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Input type="date" value={(ev.start_date || ev.date || '')?.slice(0,10) || ''} onChange={(e) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, start_date: e.target.value } : x)); }} onBlur={() => scheduleEventAutosave(ev.id, 'Start Date')} />
                    ) : (
                      (() => { const d = ev.start_date || ev.date || ''; return d ? formatIndianDate(d) : ''; })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Input type="date" value={(ev.end_date || '')?.slice(0,10) || ''} onChange={(e) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, end_date: e.target.value } : x)); }} onBlur={() => scheduleEventAutosave(ev.id, 'End Date')} />
                    ) : (
                      (() => { const d = ev.end_date || ''; return d ? formatIndianDate(d) : ''; })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Select value={String(ev.room_id || '')} onValueChange={(v) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, room_id: v } : x)); scheduleEventAutosave(ev.id, 'Room'); }}>
                        <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {roomsList.filter((r: any) => ((ev.required_amenities || []) as string[]).every((a: any) => r.amenities.includes(a))).map((r: any) => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      (() => { const r = roomsList.find((r: any) => String(r.id) === String(ev.room_id)); return r ? r.name : '—'; })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Popover onOpenChange={(open) => { if (!open) scheduleEventAutosave(ev.id, 'Staff'); }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            {(() => {
                              const scope = (ev as any).staff_scope || 'none';
                              const count = Array.isArray((ev as any).staff_ids) ? (ev as any).staff_ids.length : 0;
                              if (scope === 'all') return 'All';
                              if (scope === 'none') return count > 0 ? `${count} staff` : 'None';
                              return count > 0 ? `${count} staff` : 'Select…';
                            })()}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-72">
                          <Command>
                            <CommandInput placeholder="Search staff" />
                            <CommandList>
                              <CommandGroup>
                                <CommandItem onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, staff_scope: 'all', staff_ids: [], staff_id: null } as any : x)); }}>All</CommandItem>
                                <CommandItem onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, staff_scope: 'none', staff_ids: [], staff_id: null } as any : x)); }}>None</CommandItem>
                              </CommandGroup>
                              <CommandGroup heading="Staff">
                                {staff.map((s: any) => {
                                  const selected = Array.isArray((ev as any).staff_ids) && (ev as any).staff_ids.includes(String(s.id));
                                  return (
                                    <CommandItem key={s.id} onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => {
                                        if (x.id !== ev.id) return x;
                                        const set = new Set<string>(Array.isArray((x as any).staff_ids) ? (x as any).staff_ids : []);
                                        if (set.has(String(s.id))) set.delete(String(s.id)); else set.add(String(s.id));
                                        const arr = Array.from(set);
                                        return { ...x, staff_scope: arr.length ? 'custom' : 'none', staff_ids: arr, staff_id: arr[0] || null } as any;
                                    })); }}>
                                        <span className="mr-2">{selected ? '☑︎' : '☐'}</span>{s.name}
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      (() => { const scope = (ev as any).staff_scope || 'none'; const ids = Array.isArray((ev as any).staff_ids) ? (ev as any).staff_ids : []; if (scope === 'all') return 'All'; if (scope === 'none') return ids.length ? ids.map((id: string) => staffNameById[id] || id).join(', ') : 'None'; return ids.length ? ids.map((id: string) => staffNameById[id] || id).join(', ') : 'Custom'; })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <div className="space-y-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Select Required Amenities</Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-2 w-72">
                            <Command>
                              <CommandInput placeholder="Search amenities" />
                              <CommandList>
                                <CommandEmpty>No results</CommandEmpty>
                                <CommandGroup heading="Amenities">
                                  {amenityOptions.map((opt: any) => (
                                    <CommandItem key={opt} onSelect={() => toggleEventAmenity(ev.id, opt)}>
                                      <Checkbox size="sm" checked={(ev.required_amenities || []).includes(opt)} className="mr-2" />
                                      <span>{opt}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                            <div className="mt-2 flex gap-2">
                              <Input placeholder="Add amenity" className="h-8" value={eventAmenityDrafts[ev.id] || ""} onChange={(e) => setEventAmenityDrafts((prev: any) => ({ ...prev, [ev.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') addAmenityToEvent(ev.id, eventAmenityDrafts[ev.id] || ""); }} />
                              <Button size="sm" className="h-8" onClick={() => { addAmenityToEvent(ev.id, eventAmenityDrafts[ev.id] || ""); }}>Add</Button>
                              <Button size="sm" variant="secondary" className="h-8" onClick={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, required_amenities: [] } : x)); }}>Clear</Button>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(ev.required_amenities || []).map((amenity: string, index: number) => (
                                <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : (
                      (() => { const list = (ev.required_amenities || []) as string[]; return isMobile ? `${list.length}` : list.join(', '); })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Popover onOpenChange={(open) => { if (!open) scheduleEventAutosave(ev.id, 'Patients'); }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            {(() => {
                              const scope = (ev as any).patients_scope || 'all';
                              const count = Array.isArray((ev as any).patient_ids) ? (ev as any).patient_ids.length : 0;
                              if (scope === 'all') return 'All';
                              if (scope === 'none') return count > 0 ? `${count} patients` : 'None';
                              return count > 0 ? `${count} patients` : 'Select…';
                            })()}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-72">
                          <Command>
                            <CommandInput placeholder="Search patients" />
                            <CommandList>
                              <CommandGroup>
                                <CommandItem onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, patients_scope: 'all', patient_ids: [] } as any : x)); }}>All</CommandItem>
                                <CommandItem onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, patients_scope: 'none', patient_ids: [] } as any : x)); }}>None</CommandItem>
                              </CommandGroup>
                              <CommandGroup heading="Patients">
                                {patients.map((p: any) => {
                                  const selected = Array.isArray((ev as any).patient_ids) && (ev as any).patient_ids.includes(String(p.id));
                                  return (
                                    <CommandItem key={p.id} onSelect={() => { setEvents((prev: any[]) => prev.map((x: any) => {
                                        if (x.id !== ev.id) return x;
                                        const set = new Set<string>(Array.isArray((x as any).patient_ids) ? (x as any).patient_ids : []);
                                        if (set.has(String(p.id))) set.delete(String(p.id)); else set.add(String(p.id));
                                        const arr = Array.from(set);
                                        return { ...x, patients_scope: arr.length ? 'custom' : 'none', patient_ids: arr } as any;
                                    })); }}>
                                        <span className="mr-2">{selected ? '☑︎' : '☐'}</span>{p.name}
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      (() => { const scope = (ev as any).patients_scope || 'all'; const ids = Array.isArray((ev as any).patient_ids) ? (ev as any).patient_ids : []; if (scope === 'all') return 'All'; if (scope === 'none') return ids.length ? ids.map((id: string) => patientNameById[id] || id).join(', ') : 'None'; return ids.length ? ids.map((id: string) => patientNameById[id] || id).join(', ') : 'Custom'; })()
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Select value={(ev as any).is_optional ? 'optional' : 'required'} onValueChange={(v) => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, is_optional: v === 'optional' } : x)); scheduleEventAutosave(ev.id, 'Attendance'); }}>
                        <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="required">Required</SelectItem>
                          <SelectItem value="optional">Optional</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      (ev as any).is_optional ? 'Optional' : 'Required'
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    {editingEventId === ev.id ? (
                      <Popover onOpenChange={(open) => { if (!open) scheduleEventAutosave(ev.id, 'Recurring'); }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            {(() => {
                              const d = (ev.weekdays || []);
                              if (d.length === 0) return 'None';
                              if (d.length === 7) return 'All';
                              return d.map((w: string) => w.slice(0,3).toUpperCase()).join(',');
                            })()}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2 w-64">
                          <div className="flex flex-col gap-1">
                            <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, weekdays: [], recurrence: null } : x)); }}>
                              None
                            </Button>
                            <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => { setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, weekdays: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], recurrence: 'weekly' } : x)); }}>
                              All
                            </Button>
                            {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                              const selected = (ev.weekdays || []).includes(wd);
                              return (
                                <Button key={wd} variant="ghost" className="justify-start h-7 text-xs" onClick={() => {
                                  const nextDays = (() => {
                                    const set = new Set(ev.weekdays || []);
                                    if (set.has(wd)) set.delete(wd); else set.add(wd);
                                    return Array.from(set);
                                  })();
                                  setEvents((prev: any[]) => prev.map((x: any) => x.id === ev.id ? { ...x, weekdays: nextDays, recurrence: nextDays.length ? 'weekly' : null } : x));
                                }}>
                                  <span className="mr-2">{selected ? '☑︎' : '☐'}</span>{wd.slice(0,3).toUpperCase()}
                                </Button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      (() => { const d = (ev.weekdays || []); if ((ev.recurrence !== 'weekly') || d.length === 0) return 'Once'; if (d.length === 7) return 'Daily'; return d.map((w: string) => w.slice(0,3)).join(','); })()
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[11px] md:text-xs leading-tight py-0 pl-1 pr-1 md:px-2">
                    <div className="flex items-center justify-end gap-1">
                      {editingEventId === ev.id ? (
                        <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { scheduleEventAutosave(ev.id, 'updated'); setEditingEventId(null); setOriginalEvent(null); }}>Done</Button>
                      ) : (
                        <Button aria-label="Edit" variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { setEditingEventId(ev.id); setOriginalEvent({ ...ev }); }}>
                          <Edit className="w-2 h-2 md:w-4 md:h-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={async () => {
                        const res = await fetch(`${API_BASE}/program-events/${ev.id}`, { method: 'DELETE', headers: { ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) } });
                        if (!res.ok) return;
                        setEvents((prev: any[]) => prev.filter((x: any) => x.id !== ev.id));
                      }}>
                        <Trash2 className="w-2 h-2 md:w-4 md:h-4" />
                      </Button>
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

export default EventsTab;

/** The Events screen: its state, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useEventsScreen({ events, setEvents, roomsList, staff, patients, amenityOptions, isMobile, staffNameById, patientNameById }: {
  events: ApiProgramEvent[]; setEvents: React.Dispatch<React.SetStateAction<ApiProgramEvent[]>>;
  roomsList: UiRoom[]; staff: UiStaff[]; patients: Patient[]; amenityOptions: string[]; isMobile: boolean;
  staffNameById: Record<string, string>; patientNameById: Record<string, string>;
}) {
  const [eventAmenityDrafts, setEventAmenityDrafts] = useState<Record<string | number, string>>({});
  const [newEventAmenityDraft, setNewEventAmenityDraft] = useState<string>("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [originalEvent, setOriginalEvent] = useState<ApiProgramEvent | null>(null);
  const [newEvent, setNewEvent] = useState<{ date: string; start_time: string; end_time: string; activity_name: string; room_id: string; staff_id: string; required_amenities: string[]; notes: string; recurrence: string | null; weekdays: string[]; audience: string | null }>({ date: '', start_time: '07:30', end_time: '08:30', activity_name: '', room_id: '', staff_id: '', required_amenities: [], notes: '', recurrence: 'weekly', weekdays: ['monday'], audience: 'all' });
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [visibleEventsRows, setVisibleEventsRows] = useState(isMobile ? 20 : 40);
  const eventsTotalRef = useRef(0);
  useEffect(() => { setVisibleEventsRows(isMobile ? 20 : 40); }, [events, isMobile]);
  const toggleEventAmenity = (eventId: string | number, amenity: string) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const current = Array.isArray(e.required_amenities) ? e.required_amenities : [];
      const has = current.includes(amenity);
      const next = has ? current.filter((x) => x !== amenity) : [...current, amenity];
      const sorted = [...new Set(next)].sort((a, b) => a.localeCompare(b));
      const eligibleRoomIds = roomsList.filter((r) => sorted.every((a) => r.amenities.includes(a))).map((r) => String(r.id));
      const roomOk = e.room_id ? eligibleRoomIds.includes(String(e.room_id)) : true;
      return { ...e, required_amenities: sorted, room_id: roomOk ? e.room_id : '' } as any;
    }));
  };

  const addAmenityToEvent = (eventId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const current = Array.isArray(e.required_amenities) ? e.required_amenities : [];
      if (current.includes(existing)) { setEventAmenityDrafts((d) => ({ ...d, [eventId]: "" })); return e; }
      const next = [...new Set([...current, existing])].sort((a, b) => a.localeCompare(b));
      const eligibleRoomIds = roomsList.filter((r) => next.every((a) => r.amenities.includes(a))).map((r) => String(r.id));
      const roomOk = e.room_id ? eligibleRoomIds.includes(String(e.room_id)) : true;
      setEventAmenityDrafts((d) => ({ ...d, [eventId]: "" }));
      return { ...e, required_amenities: next, room_id: roomOk ? e.room_id : '' } as any;
    }));
  };

  const autosaveTimers = useRef<Record<string, number>>({});
  const scheduleEventAutosave = (id: string | number, columnLabel: string = 'updated', entityLabel: string = 'Event') => {
    const key = String(id);
    const t = autosaveTimers.current[key];
    if (t) {
      clearTimeout(t);
    }
    autosaveTimers.current[key] = window.setTimeout(async () => {
      delete autosaveTimers.current[key];
      const curr = events.find((x) => String(x.id) === key);
      if (!curr) return;
      const payload: any = {
        activity_name: curr.activity_name,
        start_time: curr.start_time || null,
        end_time: curr.end_time || null,
        date: curr.date || null,
        start_date: curr.start_date || null,
        end_date: curr.end_date || null,
        room_id: curr.room_id || null,
        staff_id: curr.staff_id || null,
        required_amenities: curr.required_amenities || [],
        patients_scope: (curr as any).patients_scope || null,
        patient_ids: (curr as any).patient_ids || [],
        staff_scope: (curr as any).staff_scope || null,
        staff_ids: (curr as any).staff_ids || [],
        recurrence: (curr.weekdays && curr.weekdays.length) ? 'weekly' : null,
        weekdays: curr.weekdays || [],
        is_optional: !!(curr as any).is_optional,
      };
      try {
        const res = await fetch(`${API_BASE}/program-events/${curr.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
        // A refused save must say so: the row still shows the edit, which is not saved.
        if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error || 'Not saved', { duration: 10000 }); return; }
        // Do not mutate local events on autosave to avoid clearing in-progress inputs
      } catch {}
    }, 400);
  };

  const tab = (
            <EventsTab
              events={events}
              visibleEventsRows={visibleEventsRows}
              eventsTotalRef={eventsTotalRef}
              editingEventId={editingEventId}
              setEditingEventId={setEditingEventId}
              originalEvent={originalEvent}
              setOriginalEvent={setOriginalEvent}
              scheduleEventAutosave={scheduleEventAutosave}
              roomsList={roomsList}
              staff={staff}
              patients={patients}
              amenityOptions={amenityOptions}
              eventAmenityDrafts={eventAmenityDrafts}
              setEventAmenityDrafts={setEventAmenityDrafts}
              toggleEventAmenity={toggleEventAmenity}
              addAmenityToEvent={addAmenityToEvent}
              isMobile={isMobile}
              staffNameById={staffNameById}
              patientNameById={patientNameById}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              setShowAddEvent={setShowAddEvent}
              setEvents={setEvents}
            />
  );

  const dialogs = (
          <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Add Event</DialogTitle>
                <DialogDescription>Add a program event. Fields marked optional can be left blank.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input placeholder="Activity" value={newEvent.activity_name} onChange={(e) => setNewEvent({ ...newEvent, activity_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1 items-center">
                    <Input placeholder="Start" type="time" step="900" value={newEvent.start_time} onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })} />
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setNewEvent({ ...newEvent, start_time: '' })}>Clear</Button>
                  </div>
                  <div className="flex gap-1 items-center">
                    <Input placeholder="End" type="time" step="900" value={newEvent.end_time} onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })} />
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setNewEvent({ ...newEvent, end_time: '' })}>Clear</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Start Date (optional)" type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                  <Input placeholder="End Date (optional)" type="date" value={(newEvent as any).end_date || ''} onChange={(e) => setNewEvent({ ...newEvent, end_date: e.target.value } as any)} />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Select value={newEvent.room_id} onValueChange={(v) => setNewEvent({ ...newEvent, room_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Room" /></SelectTrigger>
                    <SelectContent>
                      {roomsList.filter((r) => (newEvent.required_amenities || []).every((a) => r.amenities.includes(a))).map(r => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Select Required Amenities</Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-2 w-72">
                      <Command>
                        <CommandInput placeholder="Search amenities" />
                        <CommandList>
                          <CommandEmpty>No results</CommandEmpty>
                          <CommandGroup heading="Amenities">
                            {amenityOptions.map((opt) => (
                              <CommandItem key={opt} onSelect={() => setNewEvent({ ...newEvent, required_amenities: (newEvent.required_amenities || []).includes(opt) ? newEvent.required_amenities.filter((x) => x !== opt) : [...new Set([...(newEvent.required_amenities || []), opt])].sort((a,b)=>a.localeCompare(b)) })}>
                                <Checkbox size="sm" checked={(newEvent.required_amenities || []).includes(opt)} className="mr-2" />
                                <span>{opt}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <div className="mt-2 flex gap-2">
                        <Input placeholder="Add amenity" className="h-8" value={newEventAmenityDraft} onChange={(e) => setNewEventAmenityDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') {
                          const value = (newEventAmenityDraft || '').trim();
                          if (!value) return;
                          const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
                          if ((newEvent.required_amenities || []).includes(existing)) { setNewEventAmenityDraft(''); return; }
                          const next = [...new Set([...(newEvent.required_amenities || []), existing])].sort((a,b)=>a.localeCompare(b));
                          setNewEvent({ ...newEvent, required_amenities: next });
                          setNewEventAmenityDraft('');
                        } }} />
                        <Button size="sm" className="h-8" onClick={() => {
                          const value = (newEventAmenityDraft || '').trim();
                          if (!value) return;
                          const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
                          if ((newEvent.required_amenities || []).includes(existing)) { setNewEventAmenityDraft(''); return; }
                          const next = [...new Set([...(newEvent.required_amenities || []), existing])].sort((a,b)=>a.localeCompare(b));
                          setNewEvent({ ...newEvent, required_amenities: next });
                          setNewEventAmenityDraft('');
                        }}>Add</Button>
                        <Button size="sm" variant="secondary" className="h-8" onClick={() => { setNewEvent({ ...newEvent, required_amenities: [] }); }}>Clear</Button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(newEvent.required_amenities || []).map((amenity, index) => (
                          <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input placeholder="Notes (optional)" value={newEvent.notes} onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })} />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-between">
                      {(() => {
                        const d = (newEvent.weekdays || []);
                        if (d.length === 0) return 'None';
                        if (d.length === 7) return 'All';
                        return d.map(w => w.slice(0,3).toUpperCase()).join(',');
                      })()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 w-64">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => setNewEvent({ ...newEvent, weekdays: [], recurrence: null })}>None</Button>
                      <Button variant="ghost" className="justify-start h-7 text-xs" onClick={() => setNewEvent({ ...newEvent, weekdays: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], recurrence: 'weekly' })}>All</Button>
                      {(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const).map((wd) => {
                        const selected = (newEvent.weekdays || []).includes(wd);
                        return (
                          <Button key={wd} variant="ghost" className="justify-start h-7 text-xs"
                            onClick={() => {
                              const set = new Set(newEvent.weekdays);
                              if (set.has(wd)) set.delete(wd); else set.add(wd);
                              const arr = Array.from(set);
                              setNewEvent({ ...newEvent, weekdays: arr, recurrence: arr.length ? 'weekly' : null });
                            }}
                          >
                            <span className="mr-2">{selected ? '☑︎' : '☐'}</span>{wd.slice(0,3).toUpperCase()}
                          </Button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="grid grid-cols-2 gap-2 items-start">
                  <div className="space-y-2">
                    <span className="text-xs font-medium">Patients</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between">
                          {(() => { const scope = (newEvent as any).patients_scope || 'all'; if (scope === 'all') return 'All'; if (scope === 'none') return 'None'; const pid = Array.isArray((newEvent as any).patient_ids) ? (newEvent as any).patient_ids[0] : undefined; const p = patients.find(pp => String(pp.id) === String(pid)); return p ? p.name : 'Select…'; })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-64">
                        <Command>
                          <CommandInput placeholder="Search patients" />
                          <CommandList>
                            <CommandGroup>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'all', patient_ids: [] } as any)}>All</CommandItem>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'none', patient_ids: [] } as any)}>None</CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Patients">
                              {patients.map(p => (
                                <CommandItem key={p.id} onSelect={() => setNewEvent({ ...newEvent, patients_scope: 'custom', patient_ids: [String(p.id)] } as any)}>
                                  {p.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium">Staff</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between">
                          {(() => { const scope = (newEvent as any).staff_scope || 'none'; if (scope === 'all') return 'All'; if (scope === 'none') { const host = staff.find(s => String(s.id) === String(newEvent.staff_id)); return host ? `Host: ${host.name}` : 'None'; } const sid = Array.isArray((newEvent as any).staff_ids) ? (newEvent as any).staff_ids[0] : undefined; const s = staff.find(ss => String(ss.id) === String(sid)); return s ? s.name : 'Select…'; })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-64">
                        <Command>
                          <CommandInput placeholder="Search staff" />
                          <CommandList>
                            <CommandGroup>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'all', staff_ids: [], staff_id: '' } as any)}>All</CommandItem>
                              <CommandItem onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'none', staff_ids: [], staff_id: '' } as any)}>None</CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Staff">
                              {staff.map(s => (
                                <CommandItem key={s.id} onSelect={() => setNewEvent({ ...newEvent, staff_scope: 'none', staff_ids: [], staff_id: String(s.id) } as any)}>
                                  {s.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
                <Button onClick={async () => {
                  const st = (newEvent.start_time || '').trim();
                  const et = (newEvent.end_time || '').trim();
                  if (!st || !et) { toast.error('Please enter start and end time'); return; }
                  const payload: any = {
                    activity_name: newEvent.activity_name,
                    start_time: st,
                    end_time: et,
                    date: newEvent.date || undefined,
                    end_date: (newEvent as any).end_date || undefined,
                    room_id: newEvent.room_id || undefined,
                    staff_id: newEvent.staff_id || undefined,
                    required_amenities: newEvent.required_amenities,
                    notes: newEvent.notes || undefined,
                    recurrence: (newEvent.weekdays && newEvent.weekdays.length) ? 'weekly' : null,
                    weekdays: newEvent.weekdays,
                    patients_scope: (newEvent as any).patients_scope || 'all',
                    patient_ids: (newEvent as any).patient_ids || [],
                    staff_scope: (newEvent as any).staff_scope || 'none',
                    staff_ids: (newEvent as any).staff_ids || [],
                  };
                  const res = await fetch(`${API_BASE}/program-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                  if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error || 'Failed to add', { duration: 10000 }); return; }
                  const all = await fetch(`${API_BASE}/program-events`).then(r => r.json());
                  setEvents(all);
                  const name = (newEvent.activity_name || '').trim();
                  toast.success(name ? `Event ${name} added` : 'Event added');
                  setShowAddEvent(false);
                  setNewEvent({ date: '', start_time: '07:30', end_time: '08:30', activity_name: '', room_id: '', staff_id: '', required_amenities: [], notes: '', recurrence: 'weekly', weekdays: ['monday'], audience: 'all' });
                }}>Add</Button>
              </DialogFooter>
            </DialogContent>
  </Dialog>
  );

  return { tab, dialogs, setVisibleRows: setVisibleEventsRows, totalRef: eventsTotalRef };
}
