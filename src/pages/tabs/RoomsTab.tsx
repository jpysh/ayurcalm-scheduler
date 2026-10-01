import { useState } from "react";
import { RoomSheet } from "@/components/SetupSheets";
import { type UiRoom } from "./shared";

/** The room sheet (#285 session 6): rows live on the Team screen; a tap on one, or +, opens it. */
export function useRoomsScreen({ roomsList, setRoomsList, amenityOptions, requestDelete }: {
  roomsList: UiRoom[]; setRoomsList: React.Dispatch<React.SetStateAction<UiRoom[]>>; amenityOptions: string[];
  requestDelete: (kind: "room", id: string, name?: string) => void;
}) {
  const [open, setOpen] = useState<UiRoom | "new" | null>(null);
  const dialogs = (
    <RoomSheet room={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} amenityOptions={amenityOptions}
      onSaved={(x) => setRoomsList((prev) => prev.some((r) => r.id === x.id) ? prev.map((r) => r.id === x.id ? x : r) : [...prev, x])}
      remove={(r) => requestDelete("room", String(r.id), r.name)} />
  );
  return { dialogs, openAdd: () => setOpen("new"), openEdit: (id: string) => { const r = roomsList.find((x) => String(x.id) === id); if (r) setOpen(r); } };
}
