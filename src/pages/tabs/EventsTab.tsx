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
                      (() => { const r = roomsList.find((r: any) => String(r.id) === String(ev.room_id)); return r ? r.name : ''; })()
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
                      (() => { const d = (ev.weekdays || []); if ((ev.recurrence !== 'weekly') || d.length === 0) return 'none'; if (d.length === 7) return 'All'; return d.map((w: string) => w.slice(0,3)).join(','); })()
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
