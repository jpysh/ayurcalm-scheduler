import { useRef, useState } from "react";
import { RoomSheet, Row, SetupPage, roomSub } from "@/components/SetupSheets";
import { type UiRoom } from "./shared";

/** The Rooms screen (#273 H1): plain rows; a tap or Add opens one sheet. */
export function useRoomsScreen({ roomsList, setRoomsList, amenityOptions, requestDelete }: {
  roomsList: UiRoom[]; setRoomsList: React.Dispatch<React.SetStateAction<UiRoom[]>>; amenityOptions: string[]; isMobile: boolean;
  requestDelete: (kind: "room", id: string, name?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<UiRoom | "new" | null>(null);
  const totalRef = useRef(0);
  const q = search.trim().toLowerCase();
  const rows = roomsList.filter((r) => !q || r.name.toLowerCase().includes(q) || r.amenities.join(",").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  totalRef.current = rows.length;

  const tab = (
    <SetupPage title="Rooms" note={`${roomsList.filter((r) => r.status === "Active").length} in use`}
      search={search} setSearch={setSearch} placeholder="Search rooms">
      {rows.map((r) => <Row key={r.id} name={r.name} sub={roomSub(r)} dim={r.status !== "Active"} onClick={() => setOpen(r)} />)}
    </SetupPage>
  );
  const dialogs = (
    <RoomSheet room={open === "new" ? null : open} open={!!open} onClose={() => setOpen(null)} amenityOptions={amenityOptions}
      onSaved={(x) => setRoomsList((prev) => prev.some((r) => r.id === x.id) ? prev.map((r) => r.id === x.id ? x : r) : [...prev, x])}
      remove={(r) => requestDelete("room", String(r.id), r.name)} />
  );
  return { tab, dialogs, setVisibleRows: (_: number) => {}, totalRef, openAdd: () => setOpen("new") };
}
