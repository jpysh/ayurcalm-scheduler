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
import { API_TOKEN, type UiStaff, type UiTherapy } from "./shared";

const StaffTab = ({
  staff,
  therapies,
  searchStaff,
  setSearchStaff,
  visibleStaffRows,
  setVisibleStaffRows,
  staffTotalRef,
  editingStaffId,
  setEditingStaffId,
  originalStaffEntry,
  setOriginalStaffEntry,
  API_BASE,
  API_TOKEN,
  setShowAddStaff,
  toggleStaffTherapy,
  requestDelete,
  setStaff,
}: any) => {
  return (
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Staff Management</CardTitle>
          <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Staff" onClick={() => setShowAddStaff(true)}>
            <Plus />
          </Button>
        </div>
        <div className="mt-0.5">
          <Input placeholder="Search staff" value={searchStaff} onChange={(e: any) => setSearchStaff(e.target.value)} className="h-8 md:h-10 text-center" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2">
        <Table data-testid="staff-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Name</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Gender</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Therapies</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Phone</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Schedule</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Status</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const rows = [...staff.filter((s: any) => {
                const q = String(searchStaff || '').trim().toLowerCase();
                if (!q) return true;
                return s.name.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q) || s.specializations.join(',').toLowerCase().includes(q);
              }).sort((a: any, b: any) => a.name.localeCompare(b.name))];
              staffTotalRef.current = rows.length;
              const shown = rows.slice(0, visibleStaffRows);
              return shown.map((staff: any) => (
                <TableRow key={staff.id}>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <Input data-testid={`staff-name-${staff.id}`} value={staff.name} onChange={(e: any) => setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, name: e.target.value } : s))} />
                    ) : staff.name}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <Select value={staff.gender} onValueChange={(v: any) => setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, gender: v } : s))}>
                        <SelectTrigger data-testid={`staff-gender-${staff.id}`} className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : staff.gender}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <div className="space-y-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Select Therapies</Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-2 w-72">
                            <Command>
                              <CommandInput placeholder="Search therapies" />
                              <CommandList>
                                <CommandEmpty>No results</CommandEmpty>
                                <CommandGroup heading="Therapies">
                                  {therapies.map((t: any) => {
                                    const selected = staff.specializations.includes(t.name);
                                    return (
                                      <CommandItem key={String(t.id)} onSelect={() => toggleStaffTherapy(staff.id, t.name)}>
                                        <Checkbox size="sm" checked={selected} className="mr-2" />
                                        <span>{t.name}</span>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <div className="flex flex-wrap gap-1">
                          {staff.specializations.map((spec: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">{spec}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full" aria-label="Show Therapies">
                            {staff.specializations.length}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2 w-64">
                          <div className="flex flex-wrap gap-1">
                            {[...staff.specializations].sort((a: any, b: any) => a.localeCompare(b)).map((spec: any, index: number) => (
                              <Badge key={index} variant="secondary" className="text-xs">{spec}</Badge>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <Input value={staff.phone} onChange={(e: any) => setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, phone: e.target.value } : s))} />
                    ) : staff.phone}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <Input value={staff.schedule} onChange={(e: any) => setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, schedule: e.target.value } : s))} />
                    ) : staff.schedule}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingStaffId === staff.id ? (
                      <Select value={staff.status} onValueChange={(v: any) => setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, status: v } : s))}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : staff.status}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {editingStaffId === staff.id ? (
                        <>
                          <Button variant="outline" size="sm" className="h-10" onClick={() => {
                            if (originalStaffEntry) setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? originalStaffEntry : s));
                            setEditingStaffId(null);
                            setOriginalStaffEntry(null);
                          }}>Cancel</Button>
                          <Button size="sm" className="h-10" onClick={async () => {
                            try {
                              const specIds = staff.specializations
                                .map((name: any) => {
                                  const t = therapies.find((tt: any) => tt.name === name);
                                  return t ? String(t.id) : undefined;
                                })
                                .filter((id: any) => !!id);
                              const payload: any = {
                                name: staff.name,
                                gender: String(staff.gender).toLowerCase(),
                                specializations: specIds,
                                phone: staff.phone,
                                is_active: staff.status === 'Active',
                              };
                              const res = await fetch(`${API_BASE}/staff/${staff.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                              const updated: any = await res.json();
                              setStaff((prev: any[]) => prev.map((s: any) => s.id === staff.id ? { ...s, name: updated.name ?? s.name, gender: updated.gender === 'male' ? 'Male' : updated.gender === 'female' ? 'Female' : (updated.gender ? 'Other' : s.gender), phone: updated.phone || s.phone, status: (typeof updated.is_active === 'boolean' ? (updated.is_active ? 'Active' : 'Inactive') : s.status), specializations: (updated.specializations || []).map((id: any) => {
                                const t = therapies.find((tt: any) => String(tt.id) === String(id));
                                return t ? t.name : undefined;
                              }).filter((n: any) => !!n) } : s));
                              setEditingStaffId(null);
                              setOriginalStaffEntry(null);
                            } catch {
                              toast.error('Failed to save staff');
                            }
                          }}>Save</Button>
                        </>
                      ) : (
                        <Button data-testid={`edit-staff-${staff.id}`} aria-label="Edit" variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { setEditingStaffId(staff.id); setOriginalStaffEntry({ ...staff }); }}>
                          <Edit className="w-2 h-2 md:w-4 md:h-4" />
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm"
                        aria-label="Delete"
                        onClick={() => requestDelete('staff', String(staff.id), staff.name)}
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

export default StaffTab;

/** The Staff screen: its state, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useStaffScreen({ staff, setStaff, therapies, isMobile, requestDelete }: {
  staff: UiStaff[]; setStaff: React.Dispatch<React.SetStateAction<UiStaff[]>>; therapies: UiTherapy[]; isMobile: boolean;
  requestDelete: (kind: "staff", id: string, name?: string) => void;
}) {
  const [editingStaffId, setEditingStaffId] = useState<string | number | null>(null);
  const [originalStaffEntry, setOriginalStaffEntry] = useState<UiStaff | null>(null);
  const [searchStaff, setSearchStaff] = useState("");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [visibleStaffRows, setVisibleStaffRows] = useState(isMobile ? 20 : 40);
  const staffTotalRef = useRef(0);
  useEffect(() => { setVisibleStaffRows(isMobile ? 20 : 40); }, [searchStaff, staff, isMobile]);
  const [newStaff, setNewStaff] = useState({
    name: "",
    gender: "Female",
    specializationsText: "",
    phone: "",
    schedule: "",
    status: "Active" as "Active" | "Inactive",
  });

  const toggleStaffTherapy = (staffId: string | number, therapyName: string) => {
    setStaff((prev) => prev.map((s) => {
      if (s.id !== staffId) return s;
      const set = new Set<string>(s.specializations);
      if (set.has(therapyName)) set.delete(therapyName); else set.add(therapyName);
      return { ...s, specializations: Array.from(set).sort((a,b)=>a.localeCompare(b)) };
    }));
  };

  const tab = (
            <StaffTab
              staff={staff}
              therapies={therapies}
              searchStaff={searchStaff}
              setSearchStaff={setSearchStaff}
              visibleStaffRows={visibleStaffRows}
              setVisibleStaffRows={setVisibleStaffRows}
              staffTotalRef={staffTotalRef}
              editingStaffId={editingStaffId}
              setEditingStaffId={setEditingStaffId}
              originalStaffEntry={originalStaffEntry}
              setOriginalStaffEntry={setOriginalStaffEntry}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              setShowAddStaff={setShowAddStaff}
              toggleStaffTherapy={toggleStaffTherapy}
              requestDelete={requestDelete}
              setStaff={setStaff}
            />
  );

  const dialogs = (
      <Dialog open={showAddStaff} onOpenChange={setShowAddStaff}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Staff</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Name</Label>
            <Input value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
            <Label>Gender</Label>
            <Select value={newStaff.gender} onValueChange={(v) => setNewStaff({ ...newStaff, gender: v })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
            <Label>Specializations (comma-separated)</Label>
            <Input value={newStaff.specializationsText} onChange={(e) => setNewStaff({ ...newStaff, specializationsText: e.target.value })} />
            <Label>Phone</Label>
            <Input value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} />
            <Label>Schedule</Label>
            <Input value={newStaff.schedule} onChange={(e) => setNewStaff({ ...newStaff, schedule: e.target.value })} />
            <Label>Status</Label>
            <Select value={newStaff.status} onValueChange={(v) => setNewStaff({ ...newStaff, status: v as 'Active'|'Inactive' })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddStaff(false)}>Cancel</Button>
              <Button onClick={async () => {
                const specsInput = newStaff.specializationsText.split(',').map((s) => s.trim()).filter(Boolean);
                const specIds = specsInput.map((name) => therapies.find((t) => t.name === name)?.id || name);
                const payload: { name: string; gender: 'male'|'female'|'other'; specializations: (string | number)[]; phone: string; weekly_schedule: Record<string, unknown>; is_active: boolean } = { name: newStaff.name, gender: newStaff.gender.toLowerCase() as 'male'|'female'|'other', specializations: specIds, phone: newStaff.phone || '', weekly_schedule: {}, is_active: newStaff.status === 'Active' };
                try {
                  const res = await fetch(`${API_BASE}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setStaff((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      gender: created.gender === 'male' ? 'Male' : created.gender === 'female' ? 'Female' : 'Other',
                      specializations: (created.specializations || []).map((id: string) => therapies.find((k) => k.id === id)?.name ?? id),
                      phone: created.phone || '',
                      schedule: '',
                      status: (typeof created.is_active === 'boolean' ? (created.is_active ? 'Active' : 'Inactive') : newStaff.status),
                    },
                  ]);
                  setShowAddStaff(false);
                  setNewStaff({ name: '', gender: 'Female', specializationsText: '', phone: '', schedule: '', status: 'Active' });
                } catch {
                  toast.error('Failed to save staff');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );

  return { tab, dialogs, setVisibleRows: setVisibleStaffRows, totalRef: staffTotalRef };
}
