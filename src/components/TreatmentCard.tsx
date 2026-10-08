/**
 * The treatment card (#136), built from the kit. Facts are lines; a line opens a
 * list the server worked out, and tapping an option applies it at once with Undo
 * (no confirm button). Every problem on one treatment sits behind one "Something
 * wrong?" line. History shows the latest change.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BottomSheet, Btn, Callout, ChangeLine, Consequence, EntryRow, Area, Empty, Group, LineDate, LineSelect, ListGroup, Loading, Picker, Row, SearchField, SheetFoot, Seg, Tag, TwoFoot, WhoPicker, dayText, say } from "@/components/kit";
import { API_BASE } from "@/lib/apiBase";
import { StaySheet, type StayTarget } from "@/components/CardSheets";
import { VITALS } from "@/components/SetupSheets";
import type { ApiStay } from "@/pages/tabs/shared";

export type CardAppt = {
  id: string;
  patient_id: string;
  therapy_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  session_number?: number;
  total_sessions?: number;
  status?: string;
  notes?: string | null;
  /** What the therapist, doctor or patient recorded from their private link (#219). */
  record?: { vitals?: Record<string, string>; checklist?: Record<string, boolean>; room_ready?: boolean; done?: string; feedback?: "up" | "down"; feedback_note?: string } | null;
};
type Named = { id: string | number; name: string };
/** `now` is the treatment as it stands, listed first and ticked (#201). */
type Choice = { label: string; hint?: string; best?: boolean; now?: boolean; change: Record<string, unknown> };
type Entry = { at: string; who: string; text: string };
type Page = "card" | "time" | "staff" | "room" | "therapy" | "note" | "wrong" | "history";

const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// The day on the centre's clock: scheduled_date is that day at UTC midnight.
const dayLabel = (iso: string, isToday: boolean) => (isToday ? "Today" : dayText(iso));
// On the centre's clock, not the phone's (#304).
const stamp = (iso: string, timeZone?: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });

type Props = {
  appt: CardAppt | null;
  onClose: () => void;
  /** The day is on the centre's clock: whether this is today, and minutes past midnight now. */
  isToday: boolean;
  nowMinutes: number;
  /** The centre's timezone, for the History stamps. */
  tz?: string;
  patients: Named[];
  staff: Named[];
  roomsList: Named[];
  therapyNameById: Record<string, string>;
  refresh: () => Promise<void>;
  /** Not in from now, and out of use from now: the same actions as the day's headings. */
  staffNotIn: (staffId: string, name: string) => Promise<void>;
  roomOut: (roomId: string, name: string) => Promise<void>;
  /** Set when opened from search: go to the treatment's day. */
  onShowDay?: () => void;
  /** The patient's name opens their card (#63). */
  openResident?: (patientId: string) => void;
  /** What the day check says is wrong with this treatment, with its fix (#67). */
  problem?: { what: string; short: string; blocking: boolean; fixes: { label: string; move: Record<string, unknown> }[] } | null;
};

export function TreatmentCard({ appt, onClose, isToday, nowMinutes, tz, patients, staff, roomsList, therapyNameById, refresh, staffNotIn, roomOut, onShowDay, openResident, problem }: Props) {
  const [page, setPage] = useState<Page>("card");
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [history, setHistory] = useState<Entry[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage("card");
    setHistory(null);
    if (!appt) return;
    setNote(appt.notes || "");
    fetch(`${API_BASE}/appointments/${appt.id}/history`).then((r) => (r.ok ? r.json() : { entries: [] })).then((d) => setHistory(d.entries || []));
  }, [appt]);

  if (!appt) return null;
  const nameIn = (list: Named[], id: unknown) => list.find((x) => String(x.id) === String(id))?.name || "";
  const who = nameIn(patients, appt.patient_id) || "Patient";
  const first = who.split(" ")[0];
  const team = [appt.staff_id, ...(appt.co_staff_ids || [])].filter((x): x is string => Boolean(x));
  const st = toM(appt.start_time), en = st + appt.duration_minutes;
  const past = isToday && en <= nowMinutes;
  const now = isToday && st <= nowMinutes && en > nowMinutes;
  const noShow = appt.status === "no_show";
  // A no-show stays open, as the design has it (#193): the admin moves the missed treatment straight away,
  // and moving it puts it back on the day (see apply).
  const locked = (past && !noShow) || appt.status === "cancelled";

  /** Applies a change, closes the card and offers Undo with the fields it replaced. */
  const apply = async (change: Record<string, unknown>, message: string) => {
    if (noShow && !("status" in change) && !("notes" in change)) change = { ...change, status: "pending" };
    setBusy(true);
    try {
      const before = Object.fromEntries(Object.keys(change).map((k) => [k, (appt as Record<string, unknown>)[k] ?? (k === "notes" ? "" : null)]));
      const res = await fetch(`${API_BASE}/appointments/${appt.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      if (!res.ok) {
        const refusal = await res.json().catch(() => ({}));
        // The server's refusal names the clash and, when there is one, the nearest time that works: one tap takes it.
        toast.error(refusal.message || "That could not be saved.", refusal.alternative_start_time ? { duration: 8000, action: { label: `Move to ${refusal.alternative_start_time}`, onClick: () => { void apply({ ...change, start_time: refusal.alternative_start_time }, message); } } } : undefined);
        return;
      }
      onClose();
      await refresh();
      toast(message, { duration: 8000, action: { label: "Undo", onClick: async () => {
        await fetch(`${API_BASE}/appointments/${appt.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(before) });
        await refresh();
      } } });
    } finally {
      setBusy(false);
    }
  };

  // "Stay day 4 of 14", from the patient's stay that holds this treatment,
  // which is not always their newest: a stay can be booked for next month (#190).
  const dayMs = (iso?: string) => (iso ? Date.parse(iso.slice(0, 10)) : NaN);
  const at = dayMs(appt.scheduled_date);
  const resident = patients.find((p) => String(p.id) === String(appt.patient_id)) as { stays?: { start_date: string; end_date: string }[] } | undefined;
  const holding = resident?.stays?.find((s) => at >= dayMs(s.start_date) && at <= dayMs(s.end_date));
  const stayDay = holding
    ? `stay day ${Math.round((at - dayMs(holding.start_date)) / 86400000) + 1} of ${Math.round((dayMs(holding.end_date) - dayMs(holding.start_date)) / 86400000) + 1}` : "";

  /** The day check's own fix for this treatment, accepted alone, with Undo. */
  const fixIt = async (f: { label: string; move: Record<string, unknown> }) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/day-check/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: String(appt.scheduled_date).slice(0, 10), moves: [f.move] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.message || "The day changed; open the card again for a new answer."); return; }
      onClose();
      await refresh();
      toast(`${first}: ${f.label}`, { duration: 8000, action: body.batch_id ? { label: "Undo", onClick: async () => {
        await fetch(`${API_BASE}/replan/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: body.batch_id }) });
        await refresh();
      } } : undefined });
    } finally {
      setBusy(false);
    }
  };

  const open = async (kind: "time" | "staff" | "room" | "therapy") => {
    setChoices(null);
    setPage(kind);
    const res = await fetch(`${API_BASE}/appointments/${appt.id}/choices?kind=${kind}${isToday ? `&now=${hm(nowMinutes)}` : ""}`);
    setChoices(res.ok ? (await res.json()).choices : []);
  };

  const TITLES: Record<string, [string, string]> = {
    time: [`Move ${first}'s treatment`, `Times when ${first}, the therapist and a room are free.`],
    staff: ["Therapist", "Free for the whole treatment, and trained for it"],
    room: ["Room", "Free for the whole treatment, with what it needs"],
    therapy: ["Treatment", "Fits the same time, therapist and room"],
  };
  const NAMES = { time: "Moved to", staff: "Now with", room: "Now in", therapy: "Changed to" } as const;

  let title = who;
  let note$: ReactNode = [appt.total_sessions ? `Session ${appt.session_number} of ${appt.total_sessions}` : "", stayDay].filter(Boolean).join(" · ");
  let foot: ReactNode;
  let body: ReactNode;
  if (page === "card") {
    const latest = history?.[0];
    // Records only (#219): read here, never flagged and never printed.
    const rec = appt.record || {};
    const ticked = Object.values(rec.checklist || {}).filter(Boolean).length;
    const recorded = [
      ...Object.entries(rec.vitals || {}).filter(([, v]) => v).map(([k, v]) => `${VITALS.find(([x]) => x === k)?.[1] || k} ${v}`),
      ticked ? `${ticked} check${ticked === 1 ? "" : "s"}` : "",
      rec.done ? `Done ${rec.done}` : "",
      rec.room_ready ? "Room ready" : "",
    ].filter(Boolean).join(" · ");
    const said = rec.feedback ? [rec.feedback === "up" ? "Good" : "Not good", rec.feedback_note].filter(Boolean).join(" · ") : "";
    foot = noShow ? <Btn kind="primary" disabled={busy} onClick={() => apply({ status: "pending" }, `${first} came after all`)}>{first} came after all</Btn>
      : onShowDay ? <Btn kind="secondary" onClick={onShowDay}>Show this day</Btn> : undefined;
    body = (
      <>
        {noShow ? <Tag tone="alert">Didn't come</Tag> : past ? <Tag>Finished</Tag> : now ? <Tag tone="now">In progress · {en - nowMinutes} min left</Tag> : null}
        {problem && !locked && !noShow ? (
          <div className="mb-2">
            <Callout tone={problem.blocking ? "alert" : "plain"} title={problem.short}
              actions={problem.fixes.map((f, i) => <Btn key={f.label} kind={i === 0 ? "quiet" : "secondary"} inline disabled={busy} onClick={() => fixIt(f)}>{f.label}</Btn>)}>{problem.what}</Callout>
          </div>
        ) : null}
        <div>
          {/* A finished card still reads at full strength: its lines only tell, they are not greyed out (#193). */}
          {openResident ? <ChangeLine label="Patient" value="Open card" onClick={() => openResident(appt.patient_id)} /> : null}
          <ChangeLine label="When" value={`${dayLabel(appt.scheduled_date, isToday)}, ${appt.start_time} to ${hm(en)}`} onClick={locked || busy ? undefined : () => open("time")} />
          <ChangeLine label="Treatment" value={`${say(therapyNameById[appt.therapy_id] || "Treatment")} · ${appt.duration_minutes} min`} onClick={locked || busy ? undefined : () => open("therapy")} />
          <ChangeLine label="With" value={team.map((id) => nameIn(staff, id)).join(" and ") || "No therapist"} onClick={locked || busy ? undefined : () => open("staff")} />
          <ChangeLine label="Room" value={nameIn(roomsList, appt.room_id) || "No room"} onClick={locked || busy ? undefined : () => open("room")} />
          <ChangeLine label="Note" faint={!appt.notes} value={appt.notes || "Add a note"} onClick={locked || busy ? undefined : () => setPage("note")} />
          {recorded ? <ChangeLine label="Recorded" value={recorded} /> : null}
          {said ? <ChangeLine label="Patient said" value={said} /> : null}
          {locked || noShow ? null : <ChangeLine label="Something wrong?" value="Didn't come, late, cancel" onClick={() => setPage("wrong")} />}
          <ChangeLine label="History" value={latest ? latest.text : "See all"} onClick={() => setPage("history")} />
        </div>
        {latest ? <p className="mt-1 text-sm text-muted-foreground">{stamp(latest.at, tz)} · {latest.who}</p> : null}
      </>
    );
  } else if (page === "wrong") {
    title = "Something wrong?";
    note$ = `${who} · ${appt.start_time} ${say(therapyNameById[appt.therapy_id] || "")}. Each acts at once; Undo follows.`;
    const items: [string, string, () => void][] = [
      [`${first} didn't come`, "", () => apply({ status: "no_show" }, `${first}: didn't come. Room and therapist are free.`)],
      [`${first} is running late`, "Start later ›", () => open("time")],
      [`${first} wants to cancel`, "", () => apply({ status: "cancelled" }, `${first}'s ${say(therapyNameById[appt.therapy_id] || "treatment")} cancelled`)],
      ...team.map((id): [string, string, () => void] => [`${nameIn(staff, id)} is not in`, "From now", () => { onClose(); staffNotIn(id, nameIn(staff, id)); }]),
      ...(appt.room_id ? [[`${nameIn(roomsList, appt.room_id)} can't be used`, "From now", () => { onClose(); roomOut(appt.room_id!, nameIn(roomsList, appt.room_id)); }] as [string, string, () => void]] : []),
    ];
    body = <><ListGroup>{items.map(([label, hint, go]) => <Row key={label} title={label} trailing={hint} onClick={busy ? undefined : go} />)}</ListGroup></>;
  } else if (page === "history") {
    title = "History";
    note$ = "Everything that changed on this treatment, newest first";
    body = <><ListGroup>{history === null ? <Loading rows={2} /> : history.length ? history.map((e, i) => <EntryRow key={i} time={new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })} text={e.text} by={`${new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz })} · ${e.who}`} />) : <Empty text="Nothing has changed yet." />}</ListGroup></>;
  } else if (page === "note") {
    title = "Note";
    foot = <SheetFoot busy={busy} ok={note.trim() !== (appt.notes || "").trim()} label={!note.trim() && appt.notes ? "Remove the note" : "Save the note"} save={() => apply({ notes: note.trim() }, note.trim() ? "Note saved" : "Note removed")} />;
    body = <><Area label="Note (optional)" note="Prints on the therapist's sheet" autoFocus rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></>;
  } else {
    [title, note$] = TITLES[page];
    const shown = choices?.map((c, i) => ({ id: String(i), name: say(c.label), note: c.best ? "Suggested" : undefined, fact: c.now ? undefined : c.hint, c })) ?? [];
    const current = shown.find((o) => o.c.now);
    body = (
      <>
        {choices === null ? <Loading rows={4} /> : (
          <>
            <Picker options={shown} value={current?.id ?? ""} onChange={(id) => { const o = shown[Number(id)]; if (!o.c.now && !busy) void apply(o.c.change, `${NAMES[page]} ${page === "time" ? o.c.label.replace(/ to \d\d:\d\d$/, "") : say(o.c.label)}`); }} />
            {!choices.some((c) => !c.now) ? <p className="mt-2 text-sm text-muted-foreground">Nothing else fits.</p> : null}
          </>
        )}
        {/* Another day keeps the time; the server refuses a clash and offers the nearest time that works. */}
        {page === "time" && choices !== null ? <ChangeLine label="Another day" value={dayLabel(appt.scheduled_date, isToday)} select={<LineDate label="Another day" value={appt.scheduled_date} onChange={(iso) => apply({ scheduled_date: iso }, `Moved to ${dayText(iso)}, ${appt.start_time}`)} />} /> : null}
      </>
    );
  }

  return (
    <BottomSheet open={!!appt} onOpenChange={(o) => { if (!o) onClose(); }} title={title} note={note$} foot={foot} onBack={page === "card" ? undefined : () => setPage("card")}>{body}</BottomSheet>
  );
}

type Slot = {
  patient_id: string; patient_name: string; therapy_id: string; therapy_name: string;
  start_time: string; duration_minutes: number; staff_id: string; staff_name: string; co_staff_ids: string[]; room_id: string; room_name: string;
};
type Option = { id: string; name: string; free: boolean; why?: string };
/** What the server offers beside a refusal or warning (#330); the sheet only carries each kind out. */
export type BookAction = { kind: "book_at" | "set_date" | "other_therapy" | "add_staff" | "add_room" | "allow_any_gender" | "change_stay" | "book_anyway"; label: string; amenities?: string[]; date?: string; start_time?: string; gender?: string; therapy_id?: string; patient_id?: string };
type Options = { times: Slot[]; staff: Option[]; rooms: Option[]; why?: string; actions: BookAction[]; warnings: { reason: string; message: string; actions?: BookAction[] }[] };
type Who = { id: string; name: string; note: string; therapy_id: string | null; last: { name: string; date: string } | null };
type TherapyFact = { id: string; name: string; duration_minutes: number; is_consultation: boolean; taken: boolean; repeat: boolean; fact?: string };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Why a course could not be placed, in the admin's words. */
const COURSE_WHY: Record<string, string> = { OUT_OF_RANGE: "The days ran out", NO_MATCHING_TIME_SLOTS: "No free time on those days", NO_ROOM_AVAILABLE: "No room is free", NO_STAFF_AVAILABLE: "No therapist is free", CENTER_HOLIDAY: "The centre is closed", STAFF_IN_EVENT: "The therapist is in an event", WINDOW_TOO_NARROW: "The time is too short" };
const COURSE_DAYS = [1, 3, 5, 7, 14];
/** "Mon 5 to Fri 9 Oct": the month once when both days share it. */
const span = (from: string, to: string) => {
  const [a, b] = [dayText(from), dayText(to)];
  return `${a.split(" ")[2] === b.split(" ")[2] ? a.split(" ").slice(0, 2).join(" ") : a} to ${b}`;
};

/**
 * Book from + (#285 story 5, #330), on one sheet. Who first (nobody booked today,
 * then recent, a search at the bottom); then the therapy, which is never chosen for
 * the admin: a visible list with when they last had each. Then the date, days in a
 * row, the best free time, a free therapist and a free room, each the admin's to
 * change. The button names the outcome. Every refusal comes with the server's
 * actions beside it, and a soft rule (a long day, the same therapy twice) turns
 * the button into Book anyway. `patient` skips the first step, for a booking
 * started from their card.
 */
export function BookSheet({ open, onClose, day, today, isToday, nowMinutes, refresh, patient, rev, onAction, onAddPatient }: {
  open: boolean; onClose: () => void; day: string; today: string; isToday: boolean; nowMinutes: number;
  refresh: () => Promise<void>; patient?: { id: string; name: string; consult?: boolean } | null;
  /** Changes when the team does, so the lists are asked again after a therapist is added. */
  rev?: number;
  /** Actions that leave the sheet's own screen (adding a therapist). */
  onAction?: (a: BookAction) => void;
  /** A name nobody matches becomes a new patient, who comes back chosen (#330). */
  onAddPatient?: (name: string, arriving: string, done: (p: { id: string; name: string }) => void) => void;
}) {
  const [who, setWho] = useState<{ none: Who[]; recent: Who[]; all: Who[] } | null>(null);
  const [facts, setFacts] = useState<TherapyFact[] | null>(null);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Who | null>(null);
  const [therapyId, setTherapyId] = useState("");
  const [date, setDate] = useState(day);
  const [sessions, setSessions] = useState(1);
  const [otherDays, setOtherDays] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [time, setTime] = useState("");
  const giver = facts?.find((t) => t.id === therapyId)?.is_consultation ? "Doctor" : "Therapist";
  const [staffId, setStaffId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  // After Book the sheet stays on this, so several treatments for one patient are a tap each (#330).
  const [booked, setBooked] = useState<{ text: string; count?: number; ids: string[]; note: string } | null>(null);
  const [round, setRound] = useState(0);
  // A centre with the whole library has forty therapies: past a dozen the list is the last one had, and a search.
  const [pickTherapy, setPickTherapy] = useState(false);
  const [tq, setTq] = useState("");
  // "Change their stay" opens the stay over the booking, which comes back on the same date (#343).
  const [stay, setStay] = useState<StayTarget | null>(null);
  const seq = useRef(0);
  // A time carried over from "Book that" on another day, applied when that day's times arrive.
  const pendingAt = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setQ(""); setChosen(null); setOpts(null); setDate(day); setWho(null); setSessions(1); setOtherDays(false); setTherapyId(""); setFacts(null); setBooked(null);
    fetch(`${API_BASE}/appointments/who?date=${day}`).then((r) => (r.ok ? r.json() : { none: [], recent: [], all: [] })).then(setWho).catch(() => setWho({ none: [], recent: [], all: [] }));
  }, [open, day]);

  /** The new patient is in the list the server gave, so ask again and choose them. */
  const addInline = (name: string) => onAddPatient?.(name, day, async (p) => {
    const w = await fetch(`${API_BASE}/appointments/who?date=${day}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (w) { setWho(w); const found = w.all.find((x: Who) => x.id === p.id); if (found) choose(found); }
  });
  const choose = (p: Who) => { setChosen(p); setTherapyId(""); setDate(day); };
  // The therapy and its facts, for this patient on this day.
  useEffect(() => {
    if (!open || !chosen) return;
    fetch(`${API_BASE}/appointments/therapies?date=${date}&patient_id=${chosen.id}`).then((r) => (r.ok ? r.json() : { therapies: [] })).then((d) => {
      setFacts(d.therapies);
      // A consultation is preselected only when the booking starts from a new patient's "book consultation".
      if (patient?.consult && chosen.id === patient.id) setTherapyId((cur) => cur || d.therapies.find((t: TherapyFact) => t.is_consultation)?.id || "");
    }).catch(() => setFacts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chosen, date, rev, round]);
  // From their card: the patient is known, so the sheet opens on their lines.
  useEffect(() => { if (open && patient && who && !chosen) { const p = who.all.find((x) => x.id === patient.id); if (p) choose(p); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, patient, who]);

  /** The free times, and for the time chosen (or the best) who is free and which room. */
  const load = (at?: string) => {
    if (!chosen || !therapyId) return;
    const n = ++seq.current;
    const nowQ = date === today ? `&now=${hm(nowMinutes)}` : "";
    fetch(`${API_BASE}/appointments/options?date=${date}&patient_id=${chosen.id}&therapy_id=${therapyId}${at ? `&at=${at}` : ""}${nowQ}`)
      .then((r) => (r.ok ? r.json() : null)).then((o: Options | null) => {
        if (n !== seq.current || !o) return;
        const slot = o.times.find((t) => t.start_time === at) || o.times[0];
        setOpts(o); setTime(slot?.start_time || ""); setStaffId(slot?.staff_id || ""); setRoomId(slot?.room_id || "");
      });
  };
  useEffect(() => { setOpts(null); const at = pendingAt.current; pendingAt.current = undefined; load(at); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chosen, therapyId, date, rev]);

  const slot = opts?.times.find((t) => t.start_time === time);
  const coStaff = (slot?.co_staff_ids || []).map((id) => (id === staffId ? slot!.staff_id : id));
  const therapyName = say(facts?.find((t) => t.id === therapyId)?.name || "");
  const first = chosen?.name.split(" ")[0] || "";
  // Soft rules apply to one treatment; a course books one a day through its own route.
  const warnings = sessions === 1 ? opts?.warnings || [] : [];

  /** Carries out what the server offered beside a refusal. */
  const carry = (a: BookAction) => {
    if (a.kind === "set_date" && a.date) setDate(a.date);
    else if (a.kind === "book_at" && a.date) { pendingAt.current = a.start_time; if (a.date === date) load(a.start_time); else setDate(a.date); }
    else if (a.kind === "other_therapy") { setTherapyId(""); setOpts(null); }
    else if (a.kind === "allow_any_gender" && a.therapy_id) {
      void fetch(`${API_BASE}/therapies/${a.therapy_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requires_gender_match: false }) }).then((r) => { if (r.ok) { toast(`${therapyName} can now be given by any therapist`); load(); } else toast.error("That could not be saved."); });
    } else if (a.kind === "change_stay" && chosen) {
      void fetch(`${API_BASE}/patients/${chosen.id}/stays`).then((r) => (r.ok ? r.json() : [])).then((stays: ApiStay[]) => {
        const gap = (st: ApiStay) => Math.min(Math.abs(Date.parse(st.start_date) - Date.parse(date)), Math.abs(Date.parse(st.end_date) - Date.parse(date)));
        const near = [...stays].sort((x, y) => gap(x) - gap(y))[0];
        setStay(near ? { id: near.id, start: near.start_date.slice(0, 10), end: near.end_date.slice(0, 10), package: null, accommodation: null } : { id: null, start: date, end: addDays(date, 13), package: null, accommodation: null });
      });
    }
    else if (a.kind === "add_staff" || a.kind === "add_room") onAction?.(a);
  };

  const bookOne = async () => {
    const res = await fetch(`${API_BASE}/appointments/one`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: chosen!.id, therapy_id: therapyId, date, start_time: time, staff_id: staffId, co_staff_ids: coStaff, room_id: roomId, confirm: warnings.length > 0 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const next = (body.actions as BookAction[] | undefined)?.find((a) => a.kind !== "book_anyway");
      toast.error(body.message || "That time has just gone. Choose another.", next ? { duration: 8000, action: { label: next.label, onClick: () => carry(next) } } : undefined);
      load(time);
      return;
    }
    await refresh();
    setBooked({ text: `${therapyName} at ${time}.`, count: body.day_count, ids: [body.id], note: `Booked ${first}: ${therapyName} at ${time}` });
  };
  /** A course: one a day from the date, at this time with this therapist and room. All of it or none of it. */
  const bookCourse = async () => {
    const end = hm(toM(time) + (slot?.duration_minutes || 60) + 30);
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: chosen!.id, therapy_id: therapyId, total_sessions: sessions, start_date: date, end_date: addDays(date, sessions + 10), preferred_days: [], preferred_time_range: { start: time, end }, preferred_staff_id: staffId || undefined, preferred_room_id: roomId || undefined, now: new Date().toISOString() }),
    });
    const body = await res.json().catch(() => ({}));
    const made: string[] = (body.appointments || []).map((a: { id: string }) => a.id);
    if (!res.ok) {
      await Promise.all(made.map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" })));
      toast.error(`${COURSE_WHY[body.conflicts?.reason] || "That course could not be placed"}. Nothing was booked: try fewer days, another time or another therapist.`);
      return;
    }
    await refresh();
    setBooked({ text: `${sessions} × ${therapyName} at ${time}.`, ids: made, note: `Booked ${first}: ${sessions} × ${therapyName} at ${time}` });
  };
  /** The sheet stays on Booked, so the note with Undo comes when it closes: at the bottom it would cover the buttons. */
  const close = () => {
    if (booked) toast(booked.note, { duration: 8000, action: { label: "Undo", onClick: async () => {
      await Promise.all(booked.ids.map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" })));
      await refresh();
    } } });
    onClose();
  };
  const undoBooked = async () => {
    if (!booked) return;
    setBusy(true);
    try {
      await Promise.all(booked.ids.map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" })));
      await refresh();
      setBooked(null); setTherapyId(""); setOpts(null); setRound((n) => n + 1);
    } finally { setBusy(false); }
  };
  const book = async () => {
    if (!chosen || !slot) return;
    setBusy(true);
    try { await (sessions > 1 ? bookCourse() : bookOne()); } finally { setBusy(false); }
  };

  /** Same patient, a new therapy at the next free time; the date stays. */
  const another = () => { setBooked(null); setTherapyId(""); setOpts(null); setSessions(1); setOtherDays(false); setRound((n) => n + 1); };

  const free = (l: Option[]) => l.filter((o) => o.free);
  const busyOnes = (l: Option[]) => l.filter((o) => !o.free);
  const nameOf = (l: Option[] | undefined, id: string) => l?.find((o) => o.id === id)?.name || "";
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const long = (facts?.length ?? 0) > 12;
  // The last one had comes first; what is already booked that day stays in view, greyed, so a repeat is seen before it is chosen.
  const listed = (facts || []).filter((t) => !long || t.repeat || t.taken).sort((a, b) => Number(b.repeat) - Number(a.repeat));
  const matching = (facts || []).filter((t) => say(t.name).toLowerCase().includes(tq.trim().toLowerCase()));
  const when = `${date === today ? "" : `${weekday} `}${time}`;
  const label = !therapyId ? "Choose a therapy" : !slot ? `Book ${first}` : warnings.length ? `Book anyway, ${sessions > 1 ? `${sessions} days from ` : ""}${when}` : `Book ${first}, ${sessions > 1 ? `${sessions} days from ` : ""}${when}`;

  return (
    <>
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) close(); }} title={booked ? "Booked" : chosen ? chosen.name : "Book a treatment"}
      note={booked ? chosen?.name : chosen ? chosen.note : "Who is it for?"}
      foot={booked ? undefined
        : chosen
        ? <SheetFoot busy={busy} ok={!!slot} save={book} label={label} />
        : <SearchField value={q} onChange={setQ} placeholder="Search patients" />}>
      {booked ? (
        <div>
          <Consequence>{booked.text}{booked.count ? ` ${first} has ${booked.count} ${date === today ? "today" : "that day"}.` : ""}</Consequence>
          <div className="mt-3"><TwoFoot main="Add another" onMain={another} alt="Done" onAlt={close} busy={busy} /></div>
          <div className="mt-1 text-center"><Btn kind="quiet" inline disabled={busy} onClick={undoBooked}>Undo</Btn></div>
        </div>
      ) : !chosen ? (
        who === null ? <Loading rows={3} /> : (
          <WhoPicker q={q} chosen={null} all={who.all} onChoose={choose} onAdd={onAddPatient ? addInline : undefined}
            groups={[{ title: `No treatment yet ${day === today ? "today" : "that day"}`, list: who.none }, { title: "Recently booked", list: who.recent }]} />
        )
      ) : (
        <div>
          {!patient ? <Btn kind="quiet" inline className="-ml-4" onClick={() => { setChosen(null); setOpts(null); }}>‹ Someone else</Btn> : null}
          <ChangeLine label={sessions > 1 ? "Starts" : "Date"} value={dayText(date)} select={<LineDate label="Date" value={date} min={today} onChange={setDate} />} />
          {therapyId ? <ChangeLine label="Therapy" value={therapyName} onClick={() => { setTherapyId(""); setOpts(null); }} /> : facts === null ? <Loading rows={3} /> : (
            <div className="mt-2">
              <p className="mb-1 text-sm font-semibold text-muted-foreground">Choose a therapy</p>
              <Picker value="" onChange={setTherapyId}
                options={listed.map((t) => ({ id: t.id, name: say(t.name), note: t.repeat ? "Same as last time" : undefined, fact: t.fact, faint: t.taken }))} />
              {long ? <div className="mt-2"><ListGroup><Row title="Other therapies" trailing="›" onClick={() => { setTq(""); setPickTherapy(true); }} /></ListGroup></div> : null}
            </div>
          )}
          {therapyId ? (
            <Group label="Days in a row">
              <Seg<number> options={[...COURSE_DAYS.map((n) => [n, n === 1 ? "One" : String(n)] as [number, string]), [0, "Other"]]} value={otherDays || !COURSE_DAYS.includes(sessions) ? 0 : sessions}
                onChange={(n) => { if (n === 0) { setOtherDays(true); if (COURSE_DAYS.includes(sessions)) setSessions(2); } else { setOtherDays(false); setSessions(n); } }} />
              {otherDays || !COURSE_DAYS.includes(sessions) ? (
                <ChangeLine label="Days" value={String(sessions)} select={<LineSelect label="Days in a row" value={String(sessions)} onChange={(v) => setSessions(Number(v))} free={Array.from({ length: 20 }, (_, i) => ({ id: String(i + 2), name: `${i + 2} days in a row` }))} />} />
              ) : null}
            </Group>
          ) : null}
          {!therapyId ? null : opts === null ? <Loading rows={3} /> : opts.times.length === 0 ? (
            <Callout tone="notice" title={opts.why || `No free time for ${first}.`}
              actions={opts.actions.map((a, i) => <Btn key={a.label} kind={i === 0 ? "primary" : "secondary"} inline onClick={() => carry(a)}>{a.label}</Btn>)} />
          ) : (<>
            {warnings.length ? <div className="mb-2 mt-2"><Callout tone="notice" title={warnings.map((w) => w.message).join(" ")} actions={warnings.flatMap((w) => (w.actions || []).filter((a) => a.kind !== "book_anyway")).map((a) => <Btn key={a.label} kind="quiet" inline onClick={() => carry(a)}>{a.label}</Btn>)}>Booking it is still possible.</Callout></div> : null}
            <ChangeLine label="Time" value={<>{time}{time === opts.times[0].start_time ? <span className="ml-2"><Tag tone="good">best</Tag></span> : null}</>}
              select={<LineSelect label="Time" value={time} onChange={(t) => load(t)} free={opts.times.map((t, i) => ({ id: t.start_time, name: t.start_time, tag: i === 0 ? "best" : undefined }))} />} />
            {/* A therapy worked by two names both: the second is booked too (#478). */}
            <ChangeLine label={coStaff.length ? `${giver}s` : giver} value={[nameOf(opts.staff, staffId) || slot?.staff_name, ...coStaff.map((id) => nameOf(opts.staff, id))].filter(Boolean).join(" & ") || "None free"}
              select={<LineSelect label={giver} value={staffId} onChange={setStaffId} free={free(opts.staff)} busy={busyOnes(opts.staff)} />} />
            <ChangeLine label="Room" value={nameOf(opts.rooms, roomId) || slot?.room_name || "None free"}
              select={<LineSelect label="Room" value={roomId} onChange={setRoomId} free={free(opts.rooms)} busy={busyOnes(opts.rooms)} />} />
            <p className="mt-2 text-sm text-muted-foreground">Chosen for you: free at {time}. Change any line.</p>
            <Consequence>{sessions === 1 ? `One treatment, ${dayText(date)}, at ${time}` : `One a day, ${span(date, addDays(date, sessions - 1))}, at ${time}. A day ${first} is away, or the therapist or room is not free, is skipped; if they do not all fit, nothing is booked.`}</Consequence>
          </>)}
        </div>
      )}
    </BottomSheet>
    {long ? (
      <BottomSheet open={pickTherapy} onOpenChange={setPickTherapy} title="Therapy" foot={<SearchField value={tq} onChange={setTq} placeholder="Search therapies" />}>
        {matching.length ? <ListGroup>{matching.map((t) => <Row key={t.id} title={say(t.name)} facts={t.fact} trailing={t.id === therapyId ? "✓" : undefined} onClick={() => { setTherapyId(t.id); setPickTherapy(false); }} />)}</ListGroup> : <Empty text="No therapy matches." />}
      </BottomSheet>
    ) : null}
    <StaySheet patient={stay && chosen ? chosen : null} target={stay} today={today} cover={date} onClose={() => setStay(null)} onSaved={() => {
      load(); setRound((r) => r + 1);
      // The header's "Day 2 of 14" is from the who list, so ask it again for the new stay.
      fetch(`${API_BASE}/appointments/who?date=${day}`).then((r) => (r.ok ? r.json() : null)).then((w) => { if (!w) return; setWho(w); const p = w.all.find((x: Who) => x.id === chosen?.id); if (p) setChosen(p); }).catch(() => {});
    }} />
    </>
  );
}
