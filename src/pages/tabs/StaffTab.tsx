import { useState } from "react";
import { PersonSheet } from "@/components/SetupSheets";
import { type UiStaff, type UiTherapy } from "./shared";

/** The therapist and doctor sheet (#285 session 6): rows live on the Team screen; a tap on one, or +, opens it. */
export function useStaffScreen({ staff, setStaff, therapies, requestDelete, centre }: {
  staff: UiStaff[]; setStaff: React.Dispatch<React.SetStateAction<UiStaff[]>>; therapies: UiTherapy[];
  requestDelete: (kind: "staff", id: string, name?: string) => void; centre: { opening: string; closing: string };
}) {
  const [open, setOpen] = useState<UiStaff | "new" | null>(null);
  const [preset, setPreset] = useState<{ gender?: "Female" | "Male"; gives?: string[]; role?: "doctor" }>();
  const dialogs = (
    <PersonSheet person={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} therapies={therapies} preset={preset} centre={centre}
      onSaved={(x) => setStaff((prev) => prev.some((s) => s.id === x.id) ? prev.map((s) => s.id === x.id ? x : s) : [...prev, x])}
      remove={(s) => requestDelete("staff", String(s.id), s.name)} />
  );
  return { dialogs, openAdd: (p?: { gender?: "Female" | "Male"; gives?: string[]; role?: "doctor" }) => { setPreset(p); setOpen("new"); }, openEdit: (id: string) => { const s = staff.find((x) => String(x.id) === id); if (s) setOpen(s); } };
}
