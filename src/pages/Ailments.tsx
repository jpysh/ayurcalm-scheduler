import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type UiTherapy = { id: string | number; name: string; duration: number; amenities: string[]; genderMatch: boolean };
type ApiTherapy = { id: string; name: string; required_amenities: string[]; duration_minutes: number; requires_gender_match: boolean };
type UiAilment = { id: string; name: string; category: string; therapyIds: string[]; notes?: string };


const fetchJsonWithTimeout = async <T = unknown>(url: string, ms = 6000): Promise<T> => {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try {
      return await attempt();
    } catch {
      return [] as T;
    }
  }
};

const Ailments = () => {
  const [categories, setCategories] = useState<string[]>(["General", "Digestive", "Musculoskeletal", "Respiratory"]);
  const [therapies, setTherapies] = useState<UiTherapy[]>([]);
  const therapyNameById = useMemo(() => Object.fromEntries(therapies.map((t) => [String(t.id), t.name])), [therapies]);
  const [ailments, setAilments] = useState<UiAilment[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>(categories[0] ?? "General");
  const [draftTherapyIds, setDraftTherapyIds] = useState<string[]>([]);
  const [draftNotes, setDraftNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const totalRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const list: ApiTherapy[] = await fetchJsonWithTimeout(`${API_BASE}/therapies`);
        const ui: UiTherapy[] = (Array.isArray(list) ? list : []).map((t) => ({ id: String(t.id), name: t.name, duration: t.duration_minutes, amenities: t.required_amenities, genderMatch: t.requires_gender_match }));
        setTherapies(ui);
      } catch {
        setTherapies([]);
      }
    })();
  }, []);

  const addOrUpdateAilment = () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Enter a name");
      return;
    }
    const cat = draftCategory.trim() || "General";
    const ids = Array.from(new Set(draftTherapyIds.map(String)));
    if (editingId) {
      setAilments((prev) => prev.map((a) => (a.id === editingId ? { ...a, name, category: cat, therapyIds: ids, notes: draftNotes } : a)));
      setEditingId(null);
      toast.success("Updated");
    } else {
      const id = `${Date.now()}`;
      setAilments((prev) => [{ id, name, category: cat, therapyIds: ids, notes: draftNotes }, ...prev]);
      toast.success("Added");
    }
    setDraftName("");
    setDraftTherapyIds([]);
    setDraftNotes("");
  };

  const startEdit = (id: string) => {
    const a = ailments.find((x) => x.id === id);
    if (!a) return;
    setEditingId(id);
    setDraftName(a.name);
    setDraftCategory(a.category);
    setDraftTherapyIds(a.therapyIds);
    setDraftNotes(a.notes || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
    setDraftTherapyIds([]);
    setDraftNotes("");
  };

  const removeAilment = (id: string) => {
    setAilments((prev) => prev.filter((a) => a.id !== id));
    if (editingId === id) cancelEdit();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-3 md:px-4 py-3 md:py-6">
        <Card>
          <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-xl font-semibold">Ailments</CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search ailments" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-[180px] md:w-[240px]" />
                <Button size="icon" className="h-[19px] w-[19px] min-w-0 min-h-0 p-0 leading-none [&_svg]:size-[19px]" aria-label="Add Ailment" onClick={() => { setEditingId(null); setDraftName(""); setDraftTherapyIds([]); setDraftNotes(""); }}>
                  <Plus />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 p-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v)}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Add Category</Label>
                    <div className="flex items-center gap-2">
                      <Input placeholder="New category" className="h-8" onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setCategories((prev) => Array.from(new Set([v, ...prev]))); (e.target as HTMLInputElement).value = ""; toast.success("Category added"); } } }} />
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={(e) => { const el = (e.currentTarget.previousSibling as HTMLInputElement | null); const v = el?.value?.trim(); if (v) { setCategories((prev) => Array.from(new Set([v, ...prev]))); if (el) el.value = ""; toast.success("Category added"); } }}>Add</Button>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-1">
                  {categories.map((c) => {
                    const count = ailments.filter((a) => a.category === c).length;
                    return (
                      <Button key={c} variant={selectedCategory === c ? "secondary" : "outline"} className="h-8 w-full justify-between" onClick={() => setSelectedCategory(c)}>
                        <span className="text-sm">{c}</span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Ailment Name</Label>
                    <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g., Lower back pain" className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={draftCategory} onValueChange={(v) => setDraftCategory(v)}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Map Therapies</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 px-2">Select therapies ({draftTherapyIds.length})</Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-2 w-[280px]">
                        <Command>
                          <CommandInput placeholder="Search therapies" className="h-8" />
                          <CommandList>
                            <CommandEmpty>No therapies found.</CommandEmpty>
                            <CommandGroup>
                              {therapies.map((t) => {
                                const selected = draftTherapyIds.includes(String(t.id));
                                return (
                                  <CommandItem key={String(t.id)} value={t.name} onSelect={() => {
                                    setDraftTherapyIds((prev) => {
                                      const s = new Set(prev);
                                      if (selected) s.delete(String(t.id)); else s.add(String(t.id));
                                      return Array.from(s);
                                    });
                                  }}>
                                    <div className="flex items-center gap-2"><Badge variant={selected ? "default" : "secondary"} className="text-xs">{t.name}</Badge></div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {draftTherapyIds.map((id) => (<Badge key={id} variant="secondary" className="text-xs">{therapyNameById[id] || id}</Badge>))}
                    </div>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Guidance, contraindications, observations" className="min-h-[80px]" />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <Button size="sm" className="h-8 px-3" onClick={addOrUpdateAilment}>{editingId ? "Save" : "Add"}</Button>
                    {editingId && (<Button size="sm" variant="outline" className="h-8 px-3" onClick={cancelEdit}>Cancel</Button>)}
                  </div>
                </div>
                <Separator />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Name</TableHead>
                      <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Category</TableHead>
                      <TableHead className="h-8 py-0 text-xs md:text-sm font-normal">Therapies</TableHead>
                      <TableHead className="h-8 py-0 text-xs md:text-sm font-normal text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const q = search.trim().toLowerCase();
                      const rows = ailments.filter((a) => {
                        const inCat = selectedCategory === "all" || a.category === selectedCategory;
                        const matches = !q || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.notes?.toLowerCase().includes(q);
                        return inCat && matches;
                      }).sort((a, b) => a.name.localeCompare(b.name));
                      totalRef.current = rows.length;
                      return rows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="align-top text-xs md:text-sm font-medium">{a.name}</TableCell>
                          <TableCell className="align-top text-xs md:text-sm">{a.category}</TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1">
                              {a.therapyIds.map((id) => (<Badge key={id} variant="secondary" className="text-xs">{therapyNameById[id] || id}</Badge>))}
                            </div>
                            {a.notes && (<div className="text-[11px] md:text-xs text-muted-foreground mt-1">{a.notes}</div>)}
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => startEdit(a.id)}><Edit className="h-4 w-4" /></Button>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => removeAilment(a.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
                <div className="text-xs text-muted-foreground">Total: {totalRef.current}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Ailments;
