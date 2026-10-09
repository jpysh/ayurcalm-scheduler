import { useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Empty, LinkRow, ListGroup, Row } from "@/components/kit";
import PageHead from "@/components/PageHead";
import { TherapySheet, therapySub } from "@/components/SetupSheets";
import { TherapyLibrarySheet } from "@/components/TherapyLibrarySheet";
import { type UiTherapy } from "./shared";

type ApiTherapy = { id: string; name: string; duration_minutes: number; required_amenities: string[]; requires_gender_match: boolean; staff_required?: number; once_per_course?: boolean; before_purification?: boolean; checklist?: UiTherapy["checklist"]; vitals?: string[] };

/** The Therapies screen (#285 session 6): one row each, a tap or + opens the sheet, the library adds many. `q` is the bar's search. */
export function useTherapiesScreen({ therapies, setTherapies, amenityOptions, requestDelete, q, out, flag }: {
  therapies: UiTherapy[]; setTherapies: React.Dispatch<React.SetStateAction<UiTherapy[]>>; amenityOptions: string[]; q: string;
  requestDelete: (kind: "therapy", id: string, name?: string) => void;
  /** The therapy's days not given (#671), drawn inside its sheet. */ out: (id: string) => React.ReactNode;
  /** "Not available Thu 15 Oct" on the row (#695). */ flag: (id: string) => string | undefined;
}) {
  const [open, setOpen] = useState<UiTherapy | "new" | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const reload = async () => {
    const t: ApiTherapy[] | null = await fetch(`${API_BASE}/therapies`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(t)) setTherapies(t.map((x) => ({ id: x.id, name: x.name, duration: x.duration_minutes, amenities: x.required_amenities, genderMatch: x.requires_gender_match, staffRequired: x.staff_required ?? 1, once: !!x.once_per_course, before: !!x.before_purification, checklist: x.checklist || [], vitals: x.vitals })));
  };
  const ql = q.trim().toLowerCase();
  const rows = therapies.filter((t) => !ql || t.name.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name));

  const tab = (
    <div>
      <PageHead title="Therapies" note={`${therapies.length}`} />
      <ListGroup><LinkRow label="Standard therapies" value="Add from the library" onClick={() => setShowLibrary(true)} /></ListGroup>
      {rows.length === 0 ? <Empty text={ql ? "No therapy matches." : "No therapies yet. Add from the library, or tap + to add one."} /> : (
        <ListGroup title="Therapies" count={rows.length}>{rows.map((t) => <Row key={t.id} title={t.name} facts={therapySub(t)} flag={flag(String(t.id))} trailing="›" onClick={() => setOpen(t)} />)}</ListGroup>
      )}
    </div>
  );
  const dialogs = (<>
    <TherapyLibrarySheet open={showLibrary} onOpenChange={setShowLibrary} onImported={reload} onOwn={() => { setShowLibrary(false); setOpen("new"); }} />
    <TherapySheet therapy={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} amenityOptions={amenityOptions}
      onSaved={(x) => setTherapies((prev) => prev.some((t) => t.id === x.id) ? prev.map((t) => t.id === x.id ? x : t) : [...prev, x])}
      remove={(t) => requestDelete("therapy", String(t.id), t.name)} out={out} />
  </>);
  return { tab, dialogs, openAdd: () => setOpen("new"), openLibrary: () => setShowLibrary(true) };
}
