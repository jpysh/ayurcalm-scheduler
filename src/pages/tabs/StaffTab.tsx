import { useRef, useState } from "react";
import { PersonSheet, Row, SetupPage, personSub } from "@/components/SetupSheets";
import { type UiStaff, type UiTherapy } from "./shared";

/** The Therapists screen (#273 H1): plain rows; a tap or Add opens one sheet. */
export function useStaffScreen({ staff, setStaff, therapies, requestDelete }: {
  staff: UiStaff[]; setStaff: React.Dispatch<React.SetStateAction<UiStaff[]>>; therapies: UiTherapy[]; isMobile: boolean;
  requestDelete: (kind: "staff", id: string, name?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<UiStaff | "new" | null>(null);
  const totalRef = useRef(0);
  const q = search.trim().toLowerCase();
  const rows = staff.filter((s) => !q || s.name.toLowerCase().includes(q) || s.specializations.join(",").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  totalRef.current = rows.length;

  const tab = (
    <SetupPage title="Therapists and doctors" note={`${staff.filter((s) => s.status === "Active").length} working`} add={["Add therapist or doctor", () => setOpen("new")]}
      search={search} setSearch={setSearch} placeholder="Search by name or therapy">
      {rows.map((s) => <Row key={s.id} name={s.name} sub={personSub(s)} dim={s.status !== "Active"} onClick={() => setOpen(s)} />)}
    </SetupPage>
  );
  const dialogs = (
    <PersonSheet person={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} therapies={therapies}
      onSaved={(x) => setStaff((prev) => prev.some((s) => s.id === x.id) ? prev.map((s) => s.id === x.id ? x : s) : [...prev, x])}
      remove={(s) => requestDelete("staff", String(s.id), s.name)} />
  );
  return { tab, dialogs, setVisibleRows: (_: number) => {}, totalRef };
}
