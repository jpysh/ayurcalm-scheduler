import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { API_BASE } from "@/lib/apiBase";
import { type UiRoom } from "./shared";

const RoomsTab = ({
  roomsList,
  searchRooms,
  setSearchRooms,
  visibleRoomsRows,
  setVisibleRoomsRows,
  roomsTotalRef,
  editingRoomId,
  setEditingRoomId,
  originalRoomEntry,
  setOriginalRoomEntry,
  isMobile,
  compareRoomNames,
  amenityOptions,
  roomAmenityDrafts,
  setRoomAmenityDrafts,
  toggleRoomAmenity,
  addAmenityToRoom,
  requestDelete,
  API_BASE,
  setRoomsList,
  setShowAddRoom,
}: any) => {
  return (
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Room Management</CardTitle>
          <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Room" onClick={() => setShowAddRoom(true)}>
            <Plus />
          </Button>
        </div>
        <div className="mt-0.5">
          <Input placeholder="Search rooms" value={searchRooms} onChange={(e: any) => setSearchRooms(e.target.value)} className="h-8 md:h-10 text-center" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2">
        <Table data-testid="rooms-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Room Name</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Amenities</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Schedule</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Status</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const rows = [...roomsList.filter((r: any) => {
                const q = String(searchRooms || '').trim().toLowerCase();
                if (!q) return true;
                return r.name.toLowerCase().includes(q) || r.amenities.join(',').toLowerCase().includes(q) || r.status.toLowerCase().includes(q);
              }).sort((a: any, b: any) => compareRoomNames(a.name, b.name))];
              roomsTotalRef.current = rows.length;
              const shown = rows.slice(0, visibleRoomsRows);
              return shown.map((room: any) => (
                <TableRow key={room.id}>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingRoomId === room.id ? (
                      <Input value={room.name} onChange={(e: any) => setRoomsList((prev: any[]) => prev.map((r: any) => r.id === room.id ? { ...r, name: e.target.value } : r))} />
                    ) : room.name}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0.5 pl-1.5 pr-1 md:py-3 md:px-3">
                    {editingRoomId === room.id ? (
                      <div className="space-y-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Select Amenities</Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-2 w-72">
                            <Command>
                              <CommandInput placeholder="Search amenities" />
                              <CommandList>
                                <CommandEmpty>No results</CommandEmpty>
                                <CommandGroup heading="Amenities">
                                  {amenityOptions.map((opt: any) => (
                                    <CommandItem key={opt} onSelect={() => toggleRoomAmenity(room.id, opt)}>
                                      <Checkbox size="sm" checked={room.amenities.includes(opt)} className="mr-2" />
                                      <span>{opt}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                            <div className="mt-2 flex gap-2">
                              <Input
                                placeholder="Add amenity"
                                className="h-8"
                                value={roomAmenityDrafts[room.id] || ""}
                                onChange={(e: any) => setRoomAmenityDrafts((prev: any) => ({ ...prev, [room.id]: e.target.value }))}
                                onKeyDown={(e: any) => { if (e.key === 'Enter') addAmenityToRoom(room.id, roomAmenityDrafts[room.id] || ""); }}
                              />
                              <Button size="sm" className="h-8" onClick={() => addAmenityToRoom(room.id, roomAmenityDrafts[room.id] || "")}>Add</Button>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {amenityOptions.filter((o: any) => {
                                const q = String(roomAmenityDrafts[room.id] || "").trim().toLowerCase();
                                if (!q) return false;
                                return o.toLowerCase().includes(q) && !room.amenities.includes(o);
                              }).slice(0,5).map((s: any) => (
                                <Button key={s} variant="secondary" size="sm" className="h-6 px-2 text-xs" onClick={() => toggleRoomAmenity(room.id, s)}>
                                  {s}
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex flex-wrap gap-1">
                          {[...room.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      isMobile ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full" aria-label="Show Amenities">
                              {room.amenities.length}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-2 w-64">
                            <div className="flex flex-wrap gap-1">
                              {[...room.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">{amenity}</Badge>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {[...room.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                          ))}
                        </div>
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">{room.schedule}</TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingRoomId === room.id ? (
                      <Select value={room.status} onValueChange={(v: any) => setRoomsList((prev: any[]) => prev.map((r: any) => r.id === room.id ? { ...r, status: v } : r))}>
                        <SelectTrigger data-testid={`room-status-${room.id}`} className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={room.status === "Active" ? "default" : "secondary"}>{room.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {editingRoomId === room.id ? (
                        <>
                          <Button variant="outline" size="sm" className="h-10" onClick={() => { if (originalRoomEntry) setRoomsList((prev: any[]) => prev.map((r: any) => r.id === room.id ? originalRoomEntry : r)); setEditingRoomId(null); setOriginalRoomEntry(null); }}>Cancel</Button>
                          <Button size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={async () => {
                            try {
                              const payload: any = { id: String(room.id), name: room.name, amenities: room.amenities, is_active: room.status === 'Active' };
                              const res = await fetch(`${API_BASE}/rooms/${room.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                              const updated: any = await res.json();
                              setRoomsList((prev: any[]) => prev.map((r: any) => r.id === room.id ? { ...r, name: updated.name, amenities: (updated.amenities || r.amenities), status: updated.is_active ? 'Active' : 'Maintenance' } : r));
                              setEditingRoomId(null);
                              setOriginalRoomEntry(null);
                            } catch {
                              toast.error('Failed to save room');
                            }
                          }}>Save</Button>
                        </>
                      ) : (
                        <Button data-testid={`edit-room-${room.id}`} aria-label="Edit" variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { setEditingRoomId(room.id); setOriginalRoomEntry({ ...room }); }}>
                          <Edit className="w-2 h-2 md:w-4 md:h-4" />
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm"
                        aria-label="Delete"
                        onClick={() => requestDelete('room', String(room.id), room.name)}
                      >
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

export default RoomsTab;

/** The Rooms screen: its state, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useRoomsScreen({ roomsList, setRoomsList, amenityOptions, isMobile, requestDelete }: {
  roomsList: UiRoom[]; setRoomsList: React.Dispatch<React.SetStateAction<UiRoom[]>>; amenityOptions: string[]; isMobile: boolean;
  requestDelete: (kind: "room", id: string, name?: string) => void;
}) {
  const [editingRoomId, setEditingRoomId] = useState<string | number | null>(null);
  const [originalRoomEntry, setOriginalRoomEntry] = useState<UiRoom | null>(null);
  const [roomAmenityDrafts, setRoomAmenityDrafts] = useState<Record<string | number, string>>({});
  const [searchRooms, setSearchRooms] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [visibleRoomsRows, setVisibleRoomsRows] = useState(isMobile ? 20 : 40);
  const roomsTotalRef = useRef(0);
  useEffect(() => { setVisibleRoomsRows(isMobile ? 20 : 40); }, [searchRooms, roomsList, isMobile]);
  const [newRoom, setNewRoom] = useState({
    name: "",
    amenitiesText: "",
    schedule: "",
    status: "Active",
  });

  const toggleRoomAmenity = (roomId: string | number, amenity: string) => {
    setRoomsList((prev) => prev.map((r) => {
      if (r.id !== roomId) return r;
      const has = r.amenities.includes(amenity);
      const next = has ? r.amenities.filter((x) => x !== amenity) : [...r.amenities, amenity];
      return { ...r, amenities: [...new Set(next)].sort((a, b) => a.localeCompare(b)) };
    }));
  };

  const addAmenityToRoom = (roomId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    const current = roomsList.find((r) => r.id === roomId)?.amenities || [];
    if (current.includes(existing)) { setRoomAmenityDrafts((prev) => ({ ...prev, [roomId]: "" })); return; }
    setRoomsList((prev) => prev.map((r) => r.id === roomId ? { ...r, amenities: [...new Set([...r.amenities, existing])].sort((a, b) => a.localeCompare(b)) } : r));
    setRoomAmenityDrafts((prev) => ({ ...prev, [roomId]: "" }));
  };

  const compareRoomNames = (aName: string, bName: string) => {
    const ax = String(aName).trim();
    const bx = String(bName).trim();
    const am = ax.match(/^rm\s*(\d+)$/i);
    const bm = bx.match(/^rm\s*(\d+)$/i);
    if (am && bm) {
      const an = Number(am[1]);
      const bn = Number(bm[1]);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return ax.toLowerCase().localeCompare(bx.toLowerCase());
    }
    return ax.toLowerCase().localeCompare(bx.toLowerCase());
  };

  const tab = (
            <RoomsTab
              roomsList={roomsList}
              searchRooms={searchRooms}
              setSearchRooms={setSearchRooms}
              visibleRoomsRows={visibleRoomsRows}
              setVisibleRoomsRows={setVisibleRoomsRows}
              roomsTotalRef={roomsTotalRef}
              editingRoomId={editingRoomId}
              setEditingRoomId={setEditingRoomId}
              originalRoomEntry={originalRoomEntry}
              setOriginalRoomEntry={setOriginalRoomEntry}
              isMobile={isMobile}
              compareRoomNames={compareRoomNames}
              amenityOptions={amenityOptions}
              roomAmenityDrafts={roomAmenityDrafts}
              setRoomAmenityDrafts={setRoomAmenityDrafts}
              toggleRoomAmenity={toggleRoomAmenity}
              addAmenityToRoom={addAmenityToRoom}
              requestDelete={requestDelete}
              API_BASE={API_BASE}
              setRoomsList={setRoomsList}
              setShowAddRoom={setShowAddRoom}
            />
  );

  const dialogs = (
      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Room</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Room Name</Label>
            <Input value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} />
            <Label>Amenities (comma-separated)</Label>
            <Input value={newRoom.amenitiesText} onChange={(e) => setNewRoom({ ...newRoom, amenitiesText: e.target.value })} />
            <Label>Schedule</Label>
            <Input value={newRoom.schedule} onChange={(e) => setNewRoom({ ...newRoom, schedule: e.target.value })} />
            <Label>Status</Label>
            <Select value={newRoom.status} onValueChange={(v) => setNewRoom({ ...newRoom, status: v })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddRoom(false)}>Cancel</Button>
              <Button onClick={async () => {
                const amenities = newRoom.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean);
                const payload: { name: string; amenities: string[]; weekly_schedule: Record<string, unknown> } = { name: newRoom.name, amenities, weekly_schedule: {} };
                try {
                  const res = await fetch(`${API_BASE}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setRoomsList((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      amenities: created.amenities || [],
                      schedule: newRoom.schedule,
                      status: created.is_active ? 'Active' : 'Maintenance',
                    },
                  ]);
                  setShowAddRoom(false);
                  setNewRoom({ name: '', amenitiesText: '', schedule: '', status: 'Active' });
                } catch {
                  toast.error('Failed to save room');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );

  return { tab, dialogs, setVisibleRows: setVisibleRoomsRows, totalRef: roomsTotalRef };
}
