import { useRef, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Row, SetupPage, TherapySheet, therapySub } from "@/components/SetupSheets";
import { TherapyLibrarySheet } from "@/components/TherapyLibrarySheet";
import { type UiTherapy } from "./shared";

type ApiTherapy = { id: string; name: string; duration_minutes: number; required_amenities: string[]; requires_gender_match: boolean; staff_required?: number; checklist?: UiTherapy["checklist"]; vitals?: string[] };

/** The Therapies screen (#273 H1): plain rows; a tap or Add opens one sheet; From library adds many. */
export function useTherapiesScreen({ therapies, setTherapies, amenityOptions, requestDelete }: {
  therapies: UiTherapy[]; setTherapies: React.Dispatch<React.SetStateAction<UiTherapy[]>>; amenityOptions: string[]; isMobile: boolean;
  requestDelete: (kind: "therapy", id: string, name?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<UiTherapy | "new" | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const totalRef = useRef(0);
  const reload = async () => {
    const t: ApiTherapy[] | null = await fetch(`${API_BASE}/therapies`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(t)) setTherapies(t.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1, checklist: x.checklist || [], vitals: x.vitals })));
  };
  const q = search.trim().toLowerCase();
  const rows = therapies.filter((t) => !q || t.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  totalRef.current = rows.length;

  const tab = (
    <SetupPage title="Therapies" note={`${therapies.length}`} add={["Add therapy", () => setOpen("new")]}
      extra={<button type="button" className="min-h-11 rounded-full border px-4 font-semibold" onClick={() => setShowLibrary(true)}>From library</button>}
      search={search} setSearch={setSearch} placeholder="Search therapies">
      {rows.map((t) => <Row key={t.id} name={t.name} sub={therapySub(t)} onClick={() => setOpen(t)} />)}
    </SetupPage>
  );
  const dialogs = (<>
    <TherapyLibrarySheet open={showLibrary} onOpenChange={setShowLibrary} onImported={reload} />
    <TherapySheet therapy={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} amenityOptions={amenityOptions}
      onSaved={(x) => setTherapies((prev) => prev.some((t) => t.id === x.id) ? prev.map((t) => t.id === x.id ? x : t) : [...prev, x])}
      remove={(t) => requestDelete("therapy", String(t.id), t.name)} />
  </>);
  return { tab, dialogs, setVisibleRows: (_: number) => {}, totalRef, openLibrary: () => setShowLibrary(true) };
}
