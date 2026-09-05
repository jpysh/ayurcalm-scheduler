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
                      <Select value={therapy.genderMatch ? 'true' : 'false'} onValueChange={(v: any) => setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, genderMatch: v === 'true' } : t))}>
                        <SelectTrigger data-testid={`therapy-gender-${therapy.id}`} className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Required</SelectItem>
                          <SelectItem value="false">Not Required</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={therapy.genderMatch ? "default" : "secondary"}>{therapy.genderMatch ? "Required" : "Not Required"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {editingTherapyId === therapy.id ? (
                        <>
                          <Button variant="outline" size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={() => { if (originalTherapyEntry) setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? originalTherapyEntry : t)); setEditingTherapyId(null); setOriginalTherapyEntry(null); }}>Cancel</Button>
                          <Button size="sm" className="h-5 md:h-8 px-2 md:px-3 text-xs md:text-sm" onClick={async () => {
                            try {
                              const payload = { name: therapy.name, required_amenities: therapy.amenities, duration_minutes: therapy.duration, requires_gender_match: therapy.genderMatch };
                              const res = await fetch(`${API_BASE}/therapies/${therapy.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(API_TOKEN ? { 'x-api-key': API_TOKEN } : {}) }, body: JSON.stringify(payload) });
                              const updated = await res.json();
                              setTherapies((prev: any[]) => prev.map((t: any) => t.id === therapy.id ? { ...t, name: updated.name, amenities: (updated.required_amenities || t.amenities), duration: (updated.duration_minutes ?? t.duration), genderMatch: !!updated.requires_gender_match } : t));
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
