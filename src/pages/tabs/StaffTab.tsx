import { useState } from "react";
import { PersonSheet } from "@/components/SetupSheets";
import { type UiStaff, type UiTherapy } from "./shared";

/** The therapist and doctor sheet (#285 session 6): rows live on the Team screen; a tap on one, or +, opens it. */
export function useStaffScreen({ staff, setStaff, therapies, requestDelete }: {
  staff: UiStaff[]; setStaff: React.Dispatch<React.SetStateAction<UiStaff[]>>; therapies: UiTherapy[];
  requestDelete: (kind: "staff", id: string, name?: string) => void;
}) {
  const [open, setOpen] = useState<UiStaff | "new" | null>(null);
  const dialogs = (
    <PersonSheet person={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} therapies={therapies}
      onSaved={(x) => setStaff((prev) => prev.some((s) => s.id === x.id) ? prev.map((s) => s.id === x.id ? x : s) : [...prev, x])}
      remove={(s) => requestDelete("staff", String(s.id), s.name)} />
  );
  return { dialogs, openAdd: () => setOpen("new"), openEdit: (id: string) => { const s = staff.find((x) => String(x.id) === id); if (s) setOpen(s); } };
}
