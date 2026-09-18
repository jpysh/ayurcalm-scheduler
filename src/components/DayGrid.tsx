/**
 * The day's schedule, built for a phone (#61).
 *
 * Time runs down; three columns fit on a phone and six on a wide screen, and
 * the rest are a swipe (or an arrow) away. Grouped by therapist, because the
 * therapist is what runs out, not the room. "Who is free at 11:00" is its own
 * sheet, answered from the server's `/staff-day`, which applies the same leave
 * and event rules as a booking does — the browser only reads the intervals.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { API_BASE } from "@/lib/apiBase";

type Appt = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status?: string;
};
type Named = { id: string | number; name: string };
type StaffDay = { staff_id: string; off: string | null; busy: { s: number; e: number; label: string }[] };
type Column = { id: string; name: string; items: Appt[]; off: string | null; load: number };

const PX = 1.5; // pixels per minute: a 60-minute treatment shows name, therapy and room
const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const team = (a: Appt) => [a.staff_id, ...(a.co_staff_ids || [])].filter((x): x is string => Boolean(x));
const covers = (s: number, e: number, t: number) => s <= t && t < e;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-sky-100 border-sky-500 dark:bg-sky-950 dark:border-sky-400" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 border-emerald-600 dark:bg-emerald-950 dark:border-emerald-400" },
  completed: { label: "Done", cls: "bg-muted border-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 border-rose-500 line-through dark:bg-rose-950 dark:border-rose-400" },
};
const statusOf = (a: Appt) => STATUS[a.status || "pending"] || STATUS.pending;
const LEAVE_BG = "bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,transparent_6px_12px)]";

type Props = {
  dayAppointments: Appt[];
  dayKey: string;
  isToday: boolean;
  nowMinutes: number;
  timeSlots: string[];
  patients: Named[];
  roomsList: (Named & { amenities?: string[] })[];
  staff: Named[];
  therapyNameById: Record<string, string>;
  setSelectedAppointment: (v: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any -- the dashboard's edit-dialog shape
};

const DayGrid = ({ dayAppointments, dayKey, isToday, nowMinutes, timeSlots, patients, roomsList, staff, therapyNameById, setSelectedAppointment }: Props) => {
  const [mode, setMode] = useState<"staff" | "room">("staff");
  const [staffDay, setStaffDay] = useState<StaffDay[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [detail, setDetail] = useState<Appt | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(() => (window.innerWidth >= 900 ? 6 : 3));
  const pagerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => setPerPage(window.innerWidth >= 900 ? 6 : 3);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Refetched when the day's treatments change, so a move shows up in "who is free".
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/staff-day?date=${dayKey}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (live) setStaffDay(Array.isArray(d) ? d : []); })
      .catch(() => { if (live) setStaffDay([]); });
    return () => { live = false; };
  }, [dayKey, dayAppointments]);

  const staffName = useMemo(() => new Map(staff.map((s) => [String(s.id), String(s.name)])), [staff]);
  const roomName = useMemo(() => new Map(roomsList.map((r) => [String(r.id), String(r.name)])), [roomsList]);
  const patientName = useMemo(() => new Map(patients.map((p) => [String(p.id), String(p.name)])), [patients]);
  const names = (a: Appt) => team(a).map((id) => staffName.get(id) || "?").join(" & ");

  // Opening hours, stretched to any booking outside them: a treatment the grid
  // cannot place is a treatment nobody sees.
  const [start, end] = useMemo(() => {
    let s = timeSlots.length ? toM(timeSlots[0]) : 9 * 60;
    let e = timeSlots.length ? toM(timeSlots[timeSlots.length - 1]) : 18 * 60;
    for (const a of dayAppointments) { s = Math.min(s, toM(a.start_time)); e = Math.max(e, toM(a.start_time) + a.duration_minutes); }
    return [Math.floor(s / 60) * 60, Math.ceil(e / 60) * 60];
  }, [timeSlots, dayAppointments]);

  const [at, setAt] = useState(start);
  useEffect(() => {
    setAt(isToday && nowMinutes >= start && nowMinutes < end ? Math.floor(nowMinutes / 30) * 30 : (dayAppointments.length ? Math.min(...dayAppointments.map((a) => toM(a.start_time))) : start));
    // Only when the day changes; tapping a time must not be undone by a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, start]);

  const columns: Column[] = useMemo(() => {
    const load = (items: Appt[]) => items.reduce((x, a) => x + a.duration_minutes, 0);
    if (mode === "room") {
      const cols = roomsList.map((r) => ({ id: String(r.id), name: String(r.name), items: dayAppointments.filter((a) => String(a.room_id) === String(r.id)), off: null }))
        .filter((c) => c.items.length).map((c) => ({ ...c, load: load(c.items) })).sort((a, b) => b.load - a.load || a.name.localeCompare(b.name));
      const noRoom = dayAppointments.filter((a) => !a.room_id || !roomName.has(String(a.room_id)));
      return noRoom.length ? [{ id: "none", name: "No room", items: noRoom, off: null, load: load(noRoom) }, ...cols] : cols;
    }
    const ids = staffDay.length ? staffDay.map((d) => d.staff_id) : staff.map((s) => String(s.id));
    const offById = new Map(staffDay.map((d) => [d.staff_id, d.off]));
    // On leave with treatments still booked first (that needs fixing), then the
    // busiest, then anyone on leave with nothing to move.
    const rank = (c: Column) => (c.off && c.items.length ? 0 : c.off ? 2 : 1);
    const cols = ids.map((id) => {
      const items = dayAppointments.filter((a) => team(a).includes(id));
      return { id, name: staffName.get(id) || "?", items, off: offById.get(id) ?? null, load: load(items) };
    }).sort((a, b) => rank(a) - rank(b) || b.load - a.load || a.name.localeCompare(b.name));
    const unassigned = dayAppointments.filter((a) => team(a).length === 0);
    return unassigned.length ? [{ id: "none", name: "No therapist", items: unassigned, off: null, load: load(unassigned) }, ...cols] : cols;
  }, [mode, staffDay, staff, roomsList, dayAppointments, staffName, roomName]);

  const pages = Math.max(1, Math.ceil(columns.length / perPage));
  const goTo = (p: number) => {
    const el = pagerRef.current;
    const n = Math.max(0, Math.min(pages - 1, p));
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    setPage(n);
  };
  useEffect(() => { pagerRef.current?.scrollTo({ left: 0 }); setPage(0); }, [mode, dayKey, perPage]);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.children[page * perPage] as HTMLElement | undefined;
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - 8, behavior: "smooth" });
  }, [page, perPage]);

  const free = useMemo(() => {
    const act = staffDay.filter((d) => !d.off);
    const isBusy = (d: StaffDay) => d.busy.some((b) => covers(b.s, b.e, at));
    const busyRooms = new Set(dayAppointments.filter((a) => a.room_id && covers(toM(a.start_time), toM(a.start_time) + a.duration_minutes, at)).map((a) => String(a.room_id)));
    return {
      free: act.filter((d) => !isBusy(d)).map((d) => staffName.get(d.staff_id) || "?"),
      busy: act.filter(isBusy).map((d) => ({ name: staffName.get(d.staff_id) || "?", why: d.busy.find((b) => covers(b.s, b.e, at))!.label })),
      off: staffDay.filter((d) => d.off).map((d) => staffName.get(d.staff_id) || "?"),
      roomsFree: roomsList.filter((r) => !busyRooms.has(String(r.id))).length,
    };
  }, [staffDay, at, dayAppointments, roomsList, staffName]);

  const openEdit = (a: Appt) => {
    const room = roomsList.find((r) => String(r.id) === String(a.room_id));
    setDetail(null);
    setSelectedAppointment({
      id: a.id, scheduled_date: a.scheduled_date, start_time: a.start_time, duration_minutes: a.duration_minutes, time: a.start_time, duration: a.duration_minutes,
      patient_id: a.patient_id, therapy_id: a.therapy_id, staff_id: a.staff_id, co_staff_ids: a.co_staff_ids || [], room_id: a.room_id,
      patient: patientName.get(String(a.patient_id)) || "Patient", therapy: therapyNameById[String(a.therapy_id)] || "Therapy",
      staff: names(a), room: room ? String(room.name) : String(a.room_id || ""), roomAmenities: room?.amenities || [],
    });
  };

  if (dayAppointments.length === 0) return <div className="p-4 text-sm text-muted-foreground">No bookings for this day</div>;

  const H = (end - start) * PX;
  const hours: number[] = [];
  for (let m = start + 60; m < end; m += 60) hours.push(m);
  const offIds = new Set(staffDay.filter((d) => d.off).map((d) => d.staff_id));
  const offWithWork = (id: string) => staffDay.some((d) => d.staff_id === id && d.off) && dayAppointments.some((a) => team(a).includes(id));
  const times: number[] = [];
  for (let m = start; m < end; m += 30) times.push(m);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-md border overflow-hidden" role="group" aria-label="Group by">
            {(["staff", "room"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`px-3 h-8 text-sm ${mode === m ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                {m === "staff" ? "Therapists" : "Rooms"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setFreeOpen(true)} className="h-8 px-3 rounded-md border border-primary bg-primary/10 text-sm whitespace-nowrap">
            <b className="tabular-nums">{fmt(at)}</b> · {free.free.length} free
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {Object.values(STATUS).map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1"><i className={`inline-block w-2.5 h-2.5 rounded-sm border-l-[3px] ${s.cls}`} />{s.label}</span>
          ))}
          {mode === "staff" ? (
            <>
              <span className="inline-flex items-center gap-1"><i className={`inline-block w-2.5 h-2.5 rounded-sm border ${LEAVE_BG}`} />On leave</span>
              <span><b className="text-primary">+1</b> two therapists</span>
            </>
          ) : null}
          <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm ring-2 ring-inset ring-destructive" />Therapist on leave</span>
        </div>
      <div className="sticky top-0 z-20 bg-background space-y-1.5 py-1.5">
        <div ref={chipsRef} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {columns.map((c, i) => {
            const warn = mode === "staff" && offWithWork(c.id);
            const on = Math.floor(i / perPage) === page;
            return (
              <button key={c.id} type="button" onClick={() => goTo(Math.floor(i / perPage))}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${on ? (warn ? "bg-destructive text-destructive-foreground border-destructive" : "bg-primary text-primary-foreground border-primary") : warn ? "border-destructive text-destructive" : c.off ? "text-muted-foreground" : ""}`}>
                {mode === "staff" ? c.name.split(" ")[0] : c.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous" disabled={page === 0} onClick={() => goTo(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page * perPage + 1}–{Math.min(columns.length, page * perPage + perPage)} of {columns.length} {mode === "staff" ? "therapists" : "rooms in use"}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next" disabled={page >= pages - 1} onClick={() => goTo(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex rounded-md border bg-background">
        <div className="w-10 shrink-0 border-r">
          <div className="h-9 border-b" />
          <div className="relative" style={{ height: H }}>
            {hours.map((m) => <span key={m} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: (m - start) * PX }}>{fmt(m)}</span>)}
          </div>
        </div>
        <div ref={pagerRef} className="flex-1 min-w-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
          onScroll={(e) => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {Array.from({ length: pages }, (_, p) => (
            <div key={p} className="w-full shrink-0 snap-start grid" style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0,1fr))` }}>
              {columns.slice(p * perPage, p * perPage + perPage).map((c) => {
                const warn = mode === "staff" && offWithWork(c.id);
                return (
                  <div key={c.id} className="border-l first:border-l-0 min-w-0">
                    <div className={`h-9 border-b px-0.5 text-center text-xs font-semibold leading-tight overflow-hidden ${warn ? "text-destructive" : ""}`}>
                      <div className="truncate">{c.name}</div>
                      <div className="text-[10px] font-normal text-muted-foreground truncate">
                        {c.off ? (c.items.length ? `on leave · ${c.items.length}` : "on leave") : `${c.items.length} · ${(c.load / 60).toFixed(1)}h`}
                      </div>
                    </div>
                    <div className={`relative ${c.off ? LEAVE_BG : ""}`} style={{ height: H }}>
                      {hours.map((m) => <div key={m} className="absolute inset-x-0 border-t" style={{ top: (m - start) * PX }} />)}
                      <div className="absolute inset-x-0 border-t-2 border-primary z-10 pointer-events-none" style={{ top: (at - start) * PX }} />
                      {c.items.map((a) => {
                        const t = toM(a.start_time);
                        const extra = team(a).length - 1;
                        const onLeave = team(a).some((id) => offIds.has(id));
                        return (
                          <button key={a.id} type="button" onClick={() => setDetail(a)}
                            className={`absolute inset-x-0.5 rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight overflow-hidden ${statusOf(a).cls} ${onLeave ? "ring-2 ring-destructive ring-inset" : ""}`}
                            style={{ top: (t - start) * PX, height: a.duration_minutes * PX - 2 }}>
                            <span className="block text-[10px] text-muted-foreground tabular-nums">{a.start_time}–{fmt(t + a.duration_minutes)}</span>
                            <span className="block font-semibold line-clamp-2 break-words">
                              {patientName.get(String(a.patient_id)) || "Patient"}
                              {mode === "staff" && extra > 0 ? <b className="text-primary"> +{extra}</b> : null}
                            </span>
                            <span className="block truncate text-muted-foreground">{therapyNameById[String(a.therapy_id)] || "Therapy"}</span>
                            <span className={`block text-muted-foreground ${mode === "staff" ? "truncate" : "break-words"}`}>{mode === "staff" ? roomName.get(String(a.room_id)) || "No room" : names(a) || "No therapist"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Sheet open={freeOpen} onOpenChange={setFreeOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Who is free at {fmt(at)}</SheetTitle>
            <SheetDescription>{free.roomsFree} of {roomsList.length} rooms free</SheetDescription>
          </SheetHeader>
          <div className="mt-3 space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {times.map((m) => (
                <button key={m} type="button" onClick={() => setAt(m)}
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs tabular-nums ${m === at ? "bg-primary text-primary-foreground border-primary" : ""}`}>{fmt(m)}</button>
              ))}
            </div>
            <Group title={`Free · ${free.free.length}`}>{free.free.map((n) => <span key={n} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-sm">{n}</span>)}</Group>
            <Group title={`Busy · ${free.busy.length}`}>{free.busy.map((b) => <span key={b.name} className="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground">{b.name}{b.why !== "treatment" ? ` · ${b.why}` : ""}</span>)}</Group>
            <Group title={`On leave · ${free.off.length}`}>{free.off.map((n) => <span key={n} className="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground">{n}</span>)}</Group>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <SheetContent side="bottom">
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{patientName.get(String(detail.patient_id)) || "Patient"}</SheetTitle>
                <SheetDescription>{statusOf(detail).label}</SheetDescription>
              </SheetHeader>
              <div className="mt-3 space-y-1 text-sm">
                <div>{therapyNameById[String(detail.therapy_id)] || "Therapy"} · {detail.duration_minutes} min</div>
                <div className="tabular-nums">{detail.start_time}–{fmt(toM(detail.start_time) + detail.duration_minutes)} · {roomName.get(String(detail.room_id)) || "No room"}</div>
                <div>{names(detail) || "No therapist"}</div>
                {team(detail).some((id) => staffDay.find((d) => d.staff_id === id)?.off) ? (
                  <div className="rounded bg-destructive/10 text-destructive px-2 py-1.5">A therapist on this treatment is on leave today. Move it, or use Verify.</div>
                ) : null}
              </div>
              <Button className="mt-4 w-full" onClick={() => openEdit(detail)}>Edit</Button>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

export default DayGrid;
