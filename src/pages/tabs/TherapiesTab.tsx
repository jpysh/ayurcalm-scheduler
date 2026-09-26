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
import { API_TOKEN, type UiTherapy } from "./shared";

const TherapiesTab = ({
  therapies,
  searchTherapies,
  setSearchTherapies,
  visibleTherapiesRows,
  setVisibleTherapiesRows,
  therapiesTotalRef,
  editingTherapyId,
  setEditingTherapyId,
  originalTherapyEntry,
  setOriginalTherapyEntry,
  amenityOptions,
  therapyAmenityDrafts,
  setTherapyAmenityDrafts,
  toggleTherapyAmenity,
  addAmenityToTherapy,
  setTherapies,
  API_BASE,
  API_TOKEN,
  isMobile,
  requestDelete,
  setShowAddTherapy,
}: any) => {
  return (
    <Card>
      <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-base md:text-xl font-semibold">Therapy Management</CardTitle>
          <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Therapy" onClick={() => setShowAddTherapy(true)}>
            <Plus />
          </Button>
        </div>
        <div className="mt-0.5">
          <Input placeholder="Search therapies" value={searchTherapies} onChange={(e: any) => setSearchTherapies(e.target.value)} className="h-8 md:h-10 text-center" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-1 md:p-2">
        <Table data-testid="therapies-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Therapy Name</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Duration (min)</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Required Amenities</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Gender Match</TableHead>
              <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const rows = [...therapies.filter((t: any) => {
                const q = String(searchTherapies || '').trim().toLowerCase();
                if (!q) return true;
                return t.name.toLowerCase().includes(q) || String(t.duration).includes(q) || t.amenities.join(',').toLowerCase().includes(q);
              }).sort((a: any, b: any) => a.name.localeCompare(b.name))];
              therapiesTotalRef.current = rows.length;
              const shown = rows.slice(0, visibleTherapiesRows);
              return shown.map((therapy: any) => (
                <TableRow key={therapy.id}>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingTherapyId === therapy.id ? (
                      <Input value={therapy.name} onChange={(e: any) => setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, name: e.target.value } : t))} />
                    ) : therapy.name}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingTherapyId === therapy.id ? (
                      <Input data-testid={`therapy-duration-${therapy.id}`} type="number" value={String(therapy.duration)} onChange={(e: any) => setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, duration: Number(e.target.value) } : t))} />
                    ) : therapy.duration}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingTherapyId === therapy.id ? (
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
                                    <CommandItem key={opt} onSelect={() => toggleTherapyAmenity(therapy.id, opt)}>
                                      <Checkbox size="sm" checked={therapy.amenities.includes(opt)} className="mr-2" />
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
                                value={therapyAmenityDrafts[therapy.id] || ""}
                                onChange={(e: any) => setTherapyAmenityDrafts((prev: any) => ({ ...prev, [therapy.id]: e.target.value }))}
                                onKeyDown={(e: any) => { if (e.key === 'Enter') addAmenityToTherapy(therapy.id, therapyAmenityDrafts[therapy.id] || ""); }}
                              />
                              <Button size="sm" className="h-8" onClick={() => addAmenityToTherapy(therapy.id, therapyAmenityDrafts[therapy.id] || "")}>Add</Button>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {amenityOptions.filter((o: any) => {
                                const q = String(therapyAmenityDrafts[therapy.id] || '').trim().toLowerCase();
                                if (!q) return false;
                                return o.toLowerCase().includes(q) && !therapy.amenities.includes(o);
                              }).slice(0,5).map((s: any) => (
                                <Button key={s} variant="secondary" size="sm" className="h-6 px-2 text-xs" onClick={() => toggleTherapyAmenity(therapy.id, s)}>
                                  {s}
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex flex-wrap gap-1">
                          {[...therapy.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      isMobile ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full" aria-label="Show Required Amenities">
                              {therapy.amenities.length}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-2 w-64">
                            <div className="flex flex-wrap gap-1">
                              {[...therapy.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">{amenity}</Badge>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {[...therapy.amenities].sort((a: any, b: any) => a.localeCompare(b)).map((amenity: any, index: number) => (
                            <Badge key={index} variant="secondary" className="text-sm">{amenity}</Badge>
                          ))}
                        </div>
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-xs md:text-sm leading-tight py-0 pl-1.5 pr-1 md:py-0 md:px-3">
                    {editingTherapyId === therapy.id ? (
                      <div className="space-y-1">
                        <Select value={therapy.genderMatch ? 'true' : 'false'} onValueChange={(v: any) => setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, genderMatch: v === 'true' } : t))}>
                          <SelectTrigger data-testid={`therapy-gender-${therapy.id}`} className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Required</SelectItem>
                            <SelectItem value="false">Not Required</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 text-xs">
                          Therapists
                          <Input type="number" min={1} max={6} className="h-10 w-16" aria-label="Therapists needed" value={String(therapy.staffRequired ?? 1)}
                            onChange={(e: any) => setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, staffRequired: Math.max(1, Number(e.target.value) || 1) } : t))} />
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={therapy.genderMatch ? "default" : "secondary"}>{therapy.genderMatch ? "Required" : "Not Required"}</Badge>
                        {/* Only said when it is more than one, which is the case worth noticing. */}
                        {(therapy.staffRequired ?? 1) > 1 ? <Badge variant="outline">{therapy.staffRequired} therapists</Badge> : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {editingTherapyId === therapy.id ? (
                        <>
                          <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { if (originalTherapyEntry) setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? originalTherapyEntry : t)); setEditingTherapyId(null); setOriginalTherapyEntry(null); }}>Cancel</Button>
                          <Button size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={async () => {
                            try {
                              const payload = { name: therapy.name, required_amenities: therapy.amenities, duration_minutes: therapy.duration, requires_gender_match: therapy.genderMatch, staff_required: therapy.staffRequired ?? 1 };
                              const res = await fetch(`${API_BASE}/therapies/${therapy.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                              const updated = await res.json();
                              setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, name: updated.name, amenities: (updated.required_amenities || t.amenities), duration: (updated.duration_minutes ?? t.duration), genderMatch: !!updated.requires_gender_match, staffRequired: updated.staff_required ?? 1 } : t));
                              setEditingTherapyId(null);
                              setOriginalTherapyEntry(null);
                            } catch {
                              toast.error('Failed to save therapy');
                            }
                          }}>Save</Button>
                        </>
                      ) : (
                        <Button data-testid={`edit-therapy-${therapy.id}`} aria-label="Edit" variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { setEditingTherapyId(therapy.id); setOriginalTherapyEntry({ ...therapy }); }}>
                          <Edit className="w-2 h-2 md:w-4 md:h-4" />
                          Edit
                        </Button>
                      )}
                      <Button aria-label="Delete" variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => requestDelete('therapy', String(therapy.id), therapy.name)}>
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

export default TherapiesTab;

/** The Therapies screen: its state, the Add dialog and the tab, held by the dashboard so they last as long as it does. */
export function useTherapiesScreen({ therapies, setTherapies, amenityOptions, isMobile, requestDelete }: {
  therapies: UiTherapy[]; setTherapies: React.Dispatch<React.SetStateAction<UiTherapy[]>>; amenityOptions: string[]; isMobile: boolean;
  requestDelete: (kind: "therapy", id: string, name?: string) => void;
}) {
  const [editingTherapyId, setEditingTherapyId] = useState<string | number | null>(null);
  const [originalTherapyEntry, setOriginalTherapyEntry] = useState<UiTherapy | null>(null);
  const [therapyAmenityDrafts, setTherapyAmenityDrafts] = useState<Record<string | number, string>>({});
  const [searchTherapies, setSearchTherapies] = useState("");
  const [showAddTherapy, setShowAddTherapy] = useState(false);
  const [visibleTherapiesRows, setVisibleTherapiesRows] = useState(isMobile ? 20 : 40);
  const therapiesTotalRef = useRef(0);
  useEffect(() => { setVisibleTherapiesRows(isMobile ? 20 : 40); }, [searchTherapies, therapies, isMobile]);
  const [newTherapy, setNewTherapy] = useState({
    name: "",
    duration: 60,
    amenitiesText: "",
    genderMatch: false,
    staffRequired: 1,
  });

  const toggleTherapyAmenity = (therapyId: string | number, amenity: string) => {
    setTherapies((prev) => prev.map((t) => {
      if (t.id !== therapyId) return t;
      const has = t.amenities.includes(amenity);
      const next = has ? t.amenities.filter((x) => x !== amenity) : [...t.amenities, amenity];
      return { ...t, amenities: [...new Set(next)].sort((a, b) => a.localeCompare(b)) };
    }));
  };

  const addAmenityToTherapy = (therapyId: string | number, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const existing = amenityOptions.find((o) => o.toLowerCase() === value.toLowerCase()) || value;
    const current = therapies.find((t) => t.id === therapyId)?.amenities || [];
    if (current.includes(existing)) { setTherapyAmenityDrafts((prev) => ({ ...prev, [therapyId]: "" })); return; }
    setTherapies((prev) => prev.map((t) => t.id === therapyId ? { ...t, amenities: [...new Set([...t.amenities, existing])].sort((a, b) => a.localeCompare(b)) } : t));
    setTherapyAmenityDrafts((prev) => ({ ...prev, [therapyId]: "" }));
  };

  const tab = (
            <TherapiesTab
              therapies={therapies}
              searchTherapies={searchTherapies}
              setSearchTherapies={setSearchTherapies}
              visibleTherapiesRows={visibleTherapiesRows}
              setVisibleTherapiesRows={setVisibleTherapiesRows}
              therapiesTotalRef={therapiesTotalRef}
              editingTherapyId={editingTherapyId}
              setEditingTherapyId={setEditingTherapyId}
              originalTherapyEntry={originalTherapyEntry}
              setOriginalTherapyEntry={setOriginalTherapyEntry}
              amenityOptions={amenityOptions}
              therapyAmenityDrafts={therapyAmenityDrafts}
              setTherapyAmenityDrafts={setTherapyAmenityDrafts}
              toggleTherapyAmenity={toggleTherapyAmenity}
              addAmenityToTherapy={addAmenityToTherapy}
              setTherapies={setTherapies}
              API_BASE={API_BASE}
              API_TOKEN={API_TOKEN}
              isMobile={isMobile}
              requestDelete={requestDelete}
              setShowAddTherapy={setShowAddTherapy}
            />
  );

  const dialogs = (
      <Dialog open={showAddTherapy} onOpenChange={setShowAddTherapy}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Therapy</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Therapy Name</Label>
            <Input value={newTherapy.name} onChange={(e) => setNewTherapy({ ...newTherapy, name: e.target.value })} />
            <Label>Duration (min)</Label>
            <Input type="number" min={15} value={String(newTherapy.duration)} onChange={(e) => setNewTherapy({ ...newTherapy, duration: Number(e.target.value) })} />
            <Label>Required Amenities (comma-separated)</Label>
            <Input value={newTherapy.amenitiesText} onChange={(e) => setNewTherapy({ ...newTherapy, amenitiesText: e.target.value })} />
            <Label>Gender Match Required</Label>
            <Select value={newTherapy.genderMatch ? 'true' : 'false'} onValueChange={(v) => setNewTherapy({ ...newTherapy, genderMatch: v === 'true' })}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Required</SelectItem>
                <SelectItem value="false">Not Required</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="new-therapy-staff">Therapists needed</Label>
            <Input id="new-therapy-staff" type="number" min={1} max={6} value={String(newTherapy.staffRequired)} onChange={(e) => setNewTherapy({ ...newTherapy, staffRequired: Math.max(1, Number(e.target.value) || 1) })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddTherapy(false)}>Cancel</Button>
              <Button onClick={async () => {
                const required_amenities = newTherapy.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean);
                const payload = { name: newTherapy.name, required_amenities, duration_minutes: newTherapy.duration, requires_gender_match: newTherapy.genderMatch, staff_required: newTherapy.staffRequired };
                try {
                  const res = await fetch(`${API_BASE}/therapies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const created = await res.json();
                  setTherapies((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      duration: created.duration_minutes,
                      amenities: created.required_amenities || [],
                      genderMatch: !!created.requires_gender_match,
                      staffRequired: created.staff_required ?? 1,
                    },
                  ]);
                  setShowAddTherapy(false);
                  setNewTherapy({ name: '', duration: 60, amenitiesText: '', genderMatch: false, staffRequired: 1 });
                } catch {
                  toast.error('Failed to save therapy');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );

  return { tab, dialogs, setVisibleRows: setVisibleTherapiesRows, totalRef: therapiesTotalRef };
}
