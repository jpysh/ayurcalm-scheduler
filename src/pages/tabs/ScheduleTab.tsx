import DayList, { type DayView } from "@/components/DayList";
import { BookSheet, TreatmentCard, type CardAppt } from "@/components/TreatmentCard";
import { SearchScreen } from "@/components/SearchScreen";
import { useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

// A problem on a row, in a few words: the pill's sheet says the rest.
const SHORT: Record<string, string> = {
  STAFF_OFF: "Therapist not in", ROOM_OFF: "Room out of use", STAFF_BUSY: "Therapist booked twice", STAFF_IN_EVENT: "Therapist in an event",
  GENDER_MISMATCH: "Therapist must match", STAFF_SHORT: "Needs 2 therapists", PATIENT_BUSY: "Resident booked twice",
  ROOM_BUSY: "Room booked twice", AMENITIES_MISSING: "Room lacks what it needs", NO_THERAPIST: "Needs a therapist", EVENT_OVERLAP: "Runs through an event",
};
const flagsFor = (problems: { appointment_id: string | null; kind: string; problem_class: string }[]) =>
  Object.fromEntries(problems.filter((p) => p.appointment_id).map((p) => [p.appointment_id!, { text: SHORT[p.kind] || "Needs a look", blocking: p.problem_class === "blocking" }]));

/** Minutes past midnight now, on the centre's clock. */
const nowInTZ = (timeZone: string) => {
  try {
    const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
    return h * 60 + m;
  } catch {
    return new Date().getHours() * 60 + new Date().getMinutes();
  }
};

/** The Schedule screen, and the day sheets the bottom bar prints for the day it is on. */
export function useScheduleScreen({ ADMIN_TZ, ymdInTZ, appointmentsByDate, dayKeyMemo, patients, roomsList, staff, therapyNameById, setSelectedAppointment, closingTime, refreshDay, openFullBooking, movedFrom, problems, showDay }: Record<string, any>) {
  const [view, setView] = useState<DayView>("time");
  const [query, setQuery] = useState("");
  // Search is its own screen over every day (#165); the day list does not filter.
  const [searching, setSearching] = useState(false);
  // Opened from search: the card's day is the treatment's, not the one on screen.
  const [fromSearch, setFromSearch] = useState(false);
  const [card, setCard] = useState<CardAppt | null>(null);
  const [booking, setBooking] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<'patient' | 'therapist' | null>(null);
  // Two sheets off the same day: the patient one for the notice board, the
  // therapist rota for the treatment team.
  const printSheet = async (kind: 'patient' | 'therapist' = 'patient') => {
    setPdfLoading(kind);
    // Opened before the await, because a phone browser blocks a window opened
    // after one: by then the tap is over and it is a popup. The tab sits blank
    // while the sheet is built, then gets the same blob the download uses.
    const tab = window.open('', '_blank');
    try {
      const iso = dayKeyMemo;
      const res = await fetch(`${API_BASE}/daily-schedule-pdf?date=${iso}${kind === 'therapist' ? '&view=therapist' : ''}`);
      if (!res.ok) throw new Error('failed');
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = `ayurcalm-${kind === 'therapist' ? 'therapist-rota' : 'daily-schedule'}-${iso}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Not revoked: the new tab is still reading this URL. The browser frees it
      // when the page goes.
      return true;
    } catch {
      tab?.close();
      toast.error('Failed to generate PDF');
      return false;
    } finally {
      setPdfLoading(null);
    }
  };

  const isToday = dayKeyMemo === ymdInTZ(new Date());
  const now = nowInTZ(ADMIN_TZ);

  // The edit dialog's shape. #136 replaces this with the treatment card.
  const nameIn = (list: { id: string | number; name: string }[], id: unknown) => list.find((x) => String(x.id) === String(id))?.name;
  const openEdit = (a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- the dashboard's edit-dialog shape
    const room = roomsList.find((r: { id: unknown }) => String(r.id) === String(a.room_id));
    setSelectedAppointment({
      ...a, time: a.start_time, duration: a.duration_minutes, co_staff_ids: a.co_staff_ids || [],
      patient: nameIn(patients, a.patient_id) || "Patient", therapy: therapyNameById[String(a.therapy_id)] || "Therapy",
      staff: [a.staff_id, ...(a.co_staff_ids || [])].map((id: unknown) => nameIn(staff, id)).filter(Boolean).join(" & "),
      room: room ? String(room.name) : String(a.room_id || ""), roomAmenities: room?.amenities || [],
    });
  };

  // "Not in from now" (a therapist) and "out of use from now" (a room): the
  // same time off Verify records, so the server moves the treatments at once;
  // Undo removes it. Today from now, any other day the whole day.
  const takeOut = async (entity_type: "staff" | "room", id: string, name: string) => {
    const from = isToday ? `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(now % 60).padStart(2, "0")}` : null;
    const res = await fetch(`${API_BASE}/timeoff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type, entity_id: id, date: dayKeyMemo, start_time: from, end_time: from ? closingTime : null, description: entity_type === "staff" ? "Not in" : "Out of use" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "That could not be saved."); return; }
    await refreshDay(dayKeyMemo);
    const moved = (body.replan || []).reduce((n: number, r: { moved: unknown[] }) => n + r.moved.length, 0);
    toast(`${name} ${entity_type === "staff" ? "not in" : "out of use"} ${from ? `from ${from}` : "all day"}${moved ? ` · ${moved} moved` : ""}`, {
      duration: 8000,
      action: { label: "Undo", onClick: async () => { await fetch(`${API_BASE}/timeoff/${body.id}`, { method: "DELETE" }); await refreshDay(dayKeyMemo); } },
    });
  };
  const notIn = (staffId: string, name: string) => takeOut("staff", staffId, name);

  // The day, the print buttons, booking and search are on the bottom bar (#66, #62).
  const todayISO = ymdInTZ(new Date());
  const tab = searching ? (
    <SearchScreen
      query={query}
      setQuery={setQuery}
      today={todayISO}
      nowMinutes={now}
      residents={[...new Set((Array.isArray(appointmentsByDate?.[todayISO]) ? appointmentsByDate[todayISO] : [])
        .map((a: { patient_id: string }) => nameIn(patients, a.patient_id)).filter(Boolean) as string[])]}
      therapists={staff.filter((s: { status?: string }) => s.status !== 'Inactive').map((s: { name: string }) => s.name.split(' ')[0])}
      onOpen={(h) => { setFromSearch(true); setCard(h); }}
    />
  ) : (
    <DayList
      appointments={Array.isArray(appointmentsByDate?.[dayKeyMemo]) ? appointmentsByDate[dayKeyMemo] : []}
      isToday={isToday}
      nowMinutes={now}
      view={view}
      setView={setView}
      query=""
      patients={patients}
      roomsList={roomsList}
      staff={staff}
      therapyNameById={therapyNameById}
      onOpen={setCard}
      onNotIn={notIn}
      movedFrom={movedFrom}
      roomCount={roomsList.filter((r: { is_active?: boolean }) => r.is_active !== false).length}
      flags={flagsFor(problems || [])}
    />
  );

  const cardDay = card ? String(card.scheduled_date).slice(0, 10) : dayKeyMemo;
  const cardSheet = (
    <TreatmentCard
      appt={card}
      onClose={() => { setCard(null); setFromSearch(false); }}
      isToday={cardDay === todayISO}
      nowMinutes={now}
      patients={patients}
      staff={staff}
      roomsList={roomsList}
      therapyNameById={therapyNameById}
      refresh={() => refreshDay(cardDay)}
      onShowDay={fromSearch ? () => { setCard(null); setFromSearch(false); setSearching(false); setQuery(""); setView("time"); showDay(cardDay); } : undefined}
      staffNotIn={notIn}
      roomOut={(id, name) => takeOut("room", id, name)}
      editAll={(a) => { setCard(null); openEdit(a); }}
    />
  );

  const bookSheet = (
    <BookSheet open={booking} onClose={() => setBooking(false)} day={dayKeyMemo} isToday={isToday} nowMinutes={now}
      refresh={() => refreshDay(dayKeyMemo)} other={openFullBooking} />
  );

  return { tab: <>{tab}{cardSheet}{bookSheet}</>, openBook: () => setBooking(true), printSheet, pdfLoading, view, setView, query, setQuery, searching, setSearching };
}
