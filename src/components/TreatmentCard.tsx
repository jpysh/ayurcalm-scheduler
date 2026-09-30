/**
 * The treatment card (#136), built to docs/design/phone.html. Facts are rows;
 * a row opens a list the server worked out, and tapping an option applies it
 * at once with Undo — no confirm button. Every problem on one treatment sits
 * behind one "Something wrong?" row. History shows the latest change.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomBar";
import { ChangeLine, LineDate, LineSelect, dayText, Loading, SearchField, WhoPicker, wide } from "@/components/kit";
import { API_BASE } from "@/lib/apiBase";

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
};
type Named = { id: string | number; name: string };
/** `now` is the treatment as it stands, listed first (#201). */
type Choice = { label: string; hint?: string; best?: boolean; now?: boolean; change: Record<string, unknown> };
type Entry = { at: string; who: string; text: string };
type Page = "card" | "time" | "staff" | "room" | "therapy" | "note" | "wrong" | "history";

const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// The day on the centre's clock: scheduled_date is that day at UTC midnight.
const dayLabel = (iso: string, isToday: boolean) =>
  isToday ? "Today" : new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type Props = {
  appt: CardAppt | null;
  onClose: () => void;
  /** The day is on the centre's clock: whether this is today, and minutes past midnight now. */
  isToday: boolean;
  nowMinutes: number;
  patients: Named[];
  staff: Named[];
  roomsList: Named[];
  therapyNameById: Record<string, string>;
  refresh: () => Promise<void>;
  /** Not in from now, and out of use from now: the same actions as the day's headings. */
  staffNotIn: (staffId: string, name: string) => Promise<void>;
  roomOut: (roomId: string, name: string) => Promise<void>;
  /** The full edit form, which keeps Delete. */
  editAll: (a: CardAppt) => void;
  /** Set when opened from search: go to the treatment's day. */
  onShowDay?: () => void;
  /** The resident's name opens their card (#63). */
  openResident?: (patientId: string) => void;
  /** What the day check says is wrong with this treatment, with its fix (#67). */
  problem?: { what: string; short: string; blocking: boolean; fixes: { label: string; move: Record<string, unknown> }[] } | null;
};

export function TreatmentCard({ appt, onClose, isToday, nowMinutes, patients, staff, roomsList, therapyNameById, refresh, staffNotIn, roomOut, editAll, onShowDay, openResident, problem }: Props) {
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
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message || "That could not be saved."); return; }
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

  // "Stay day 4 of 14", from the resident's stay that holds this treatment,
  // which is not always their newest: a stay can be booked for next month (#190).
  const dayMs = (iso?: string) => (iso ? Date.parse(iso.slice(0, 10)) : NaN);
  const at = dayMs(appt.scheduled_date);
  const resident = patients.find((p) => String(p.id) === String(appt.patient_id)) as { stays?: { start_date: string; end_date: string }[] } | undefined;
  const holding = resident?.stays?.find((s) => at >= dayMs(s.start_date) && at <= dayMs(s.end_date));
  const stayOf = holding && { actualStart: holding.start_date, actualEnd: holding.end_date };
  const stayDay = stayOf && at >= dayMs(stayOf.actualStart) && at <= dayMs(stayOf.actualEnd)
    ? `stay day ${Math.round((at - dayMs(stayOf.actualStart)) / 86400000) + 1} of ${Math.round((dayMs(stayOf.actualEnd) - dayMs(stayOf.actualStart)) / 86400000) + 1}` : "";

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

  const row = "flex w-full min-h-12 items-center gap-3 border-b border-border px-1 py-2.5 text-left text-[15px] last:border-b-0 disabled:opacity-60";
  // A finished card still reads at full strength: it is locked, not greyed out (#193).
  const Fact = ({ label, value, onClick }: { label: string; value: ReactNode; onClick: () => void }) => (
    <button type="button" className={`${row} disabled:opacity-100`} disabled={locked || busy} onClick={onClick}>
      <span className="w-20 flex-none text-[13px] text-muted-foreground">{label}</span>
      <span className="flex-1 min-w-0">{value}</span>
      {locked ? null : <span className="text-muted-foreground">›</span>}
    </button>
  );
  const Back = ({ title, action }: { title: string; action?: ReactNode }) => (
    <div className="-mt-1 mb-1 grid grid-cols-[1fr_auto_1fr] items-center">
      <button type="button" className="min-h-10 justify-self-start px-1 font-semibold text-primary" onClick={() => setPage("card")}>‹ Back</button>
      <h3 className="text-lg font-semibold">{title}</h3>
      <span className="justify-self-end">{action}</span>
    </div>
  );
  const box = "rounded-xl border px-3";

  const TITLES: Record<string, [string, string]> = {
    time: [`Move ${first}'s treatment`, `Times when ${first}, the therapist and a room are free.`],
    staff: ["Therapist", "Free for the whole treatment, and trained for it"],
    room: ["Room", "Free for the whole treatment, with what it needs"],
    therapy: ["Treatment", "Fits the same time, therapist and room"],
  };
  const NAMES = { time: "Moved to", staff: "Now with", room: "Now in", therapy: "Changed to" } as const;

  let body: ReactNode;
  if (page === "card") {
    const latest = history?.[0];
    body = (
      <>
        <div>
          {noShow ? <span className="rounded-full px-2.5 py-[3px] text-xs font-bold tracking-[.03em] bg-[#FBEAE3] text-destructive">Didn't come</span>
            : past ? <span className="rounded-full px-2.5 py-[3px] text-xs font-bold tracking-[.03em] bg-secondary text-muted-foreground">Finished</span>
            : now ? <span className="rounded-full px-2.5 py-[3px] text-xs font-bold tracking-[.03em] bg-[#FFF4EE] text-now">In progress · {en - nowMinutes} min left</span> : null}
          <button type="button" className="block text-left text-[22px] font-semibold leading-tight disabled:opacity-100" disabled={!openResident} onClick={() => openResident?.(appt.patient_id)}>
            {who}{openResident ? <span className="ml-1 text-muted-foreground">›</span> : null}
          </button>
          <div className="text-[13px] text-muted-foreground">
            {[appt.total_sessions ? `Session ${appt.session_number} of ${appt.total_sessions}` : "", stayDay].filter(Boolean).join(" · ")}
          </div>
        </div>
        {problem && !locked && !noShow ? (
          <div className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 text-sm ${problem.blocking ? "bg-[#FBEAE3]" : "bg-background"}`}>
            <b className={problem.blocking ? "text-destructive" : undefined}>{problem.short}</b>
            <span>{problem.what}</span>
            <div className="mt-0.5 flex flex-wrap justify-end gap-1">
              {problem.fixes.map((f, i) => (
                <button key={f.label} type="button" disabled={busy} className={`min-h-10 rounded-full px-3 text-sm ${i === 0 ? "font-bold text-primary" : "font-semibold text-muted-foreground"}`}
                  onClick={() => fixIt(f)}>{f.label}</button>
              ))}
            </div>
          </div>
        ) : null}
        <div className={box}>
          <Fact label="When" value={`${dayLabel(appt.scheduled_date, isToday)}, ${appt.start_time} to ${hm(en)}`} onClick={() => open("time")} />
          <Fact label="Treatment" value={`${therapyNameById[appt.therapy_id] || "Treatment"} · ${appt.duration_minutes} min`} onClick={() => open("therapy")} />
          <Fact label="With" value={team.map((id) => nameIn(staff, id)).join(" and ") || "No therapist"} onClick={() => open("staff")} />
          <Fact label="Room" value={nameIn(roomsList, appt.room_id) || "No room"} onClick={() => open("room")} />
          <Fact label="Note" value={appt.notes || <span className="text-muted-foreground">Add a note</span>} onClick={() => setPage("note")} />
        </div>
        {locked || noShow ? null : (
          <div className={box}>
            <button type="button" className={row} onClick={() => setPage("wrong")}>
              <span className="flex-1 font-semibold text-destructive">Something wrong?<small className="block text-[13px] font-normal text-muted-foreground">Didn't come, running late, cancel, therapist or room</small></span>
              <span className="text-muted-foreground">›</span>
            </button>
          </div>
        )}
        <div className={box}>
          <button type="button" className={row} onClick={() => setPage("history")}>
            <span className="w-20 flex-none text-[13px] text-muted-foreground">History</span>
            <span className="flex-1 min-w-0">{latest ? <>{latest.text}<small className="block text-[13px] text-muted-foreground">{new Date(latest.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {latest.who}</small></> : "…"}</span>
            <span className="text-muted-foreground">›</span>
          </button>
        </div>
        {onShowDay ? <button type="button" className="min-h-11 rounded-full border-2 font-semibold" onClick={onShowDay}>Show this day</button> : null}
        {noShow ? <button type="button" className="min-h-11 rounded-full border-2 font-semibold" disabled={busy} onClick={() => apply({ status: "pending" }, `${first} came after all`)}>{first} came after all</button> : null}
        <button type="button" className="min-h-11 font-semibold text-muted-foreground" onClick={() => editAll(appt)}>Edit everything</button>
      </>
    );
  } else if (page === "wrong") {
    const items: [string, string, () => void][] = [
      [`${first} didn't come`, "", () => apply({ status: "no_show" }, `${first}: didn't come. Room and therapist are free.`)],
      [`${first} is running late`, "Start later ›", () => open("time")],
      [`${first} wants to cancel`, "", () => apply({ status: "cancelled" }, `${first}'s ${therapyNameById[appt.therapy_id] || "treatment"} cancelled`)],
      ...team.map((id): [string, string, () => void] => [`${nameIn(staff, id)} is not in`, "From now", () => { onClose(); staffNotIn(id, nameIn(staff, id)); }]),
      ...(appt.room_id ? [[`${nameIn(roomsList, appt.room_id)} can't be used`, "From now", () => { onClose(); roomOut(appt.room_id!, nameIn(roomsList, appt.room_id)); }] as [string, string, () => void]] : []),
    ];
    body = (
      <>
        <Back title="Something wrong?" />
        <div className="text-[13px] text-muted-foreground">{who} · {appt.start_time} {therapyNameById[appt.therapy_id]}. Each acts at once; Undo follows.</div>
        <div className={box}>
          {items.map(([label, hint, go]) => (
            <button key={label} type="button" className={row} disabled={busy} onClick={go}>
              <span className="flex-1">{label}</span><span className="text-[13px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (page === "history") {
    body = (
      <>
        <Back title="History" />
        <div className="text-[13px] text-muted-foreground">Everything that changed on this treatment, newest first</div>
        {/* A timeline, as the design's .log: a line down the left and a dot per change, the newest filled. */}
        <ol aria-label="Changes" className="ml-1 mt-1 flex list-none flex-col gap-3.5 border-l-2 border-border pl-3.5">
          {(history || []).map((e, i) => (
            <li key={i} className="relative flex flex-col text-[15px] before:absolute before:-left-5 before:top-1.5 before:size-2.5 before:rounded-full before:border-2 before:border-border before:bg-card before:content-[''] first:before:border-primary first:before:bg-primary">{e.text}
              <small className="block text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.who}</small>
            </li>
          ))}
        </ol>
      </>
    );
  } else if (page === "note") {
    body = (
      <>
        <Back title="Note" action={<button type="button" className="min-h-10 px-1 font-semibold text-primary" disabled={busy} onClick={() => apply({ notes: note.trim() }, note.trim() ? "Note saved" : "Note removed")}>Save</button>} />
        <div className="text-[13px] text-muted-foreground">Prints on the therapist's sheet</div>
        <textarea autoFocus rows={3} className="rounded-xl border-2 border-input bg-card p-2.5 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
      </>
    );
  } else {
    const [title, hint] = TITLES[page];
    body = (
      <>
        <Back title={title} />
        <div className="text-[13px] text-muted-foreground">{hint}</div>
        <div className={box}>
          {choices === null ? <div className="py-3 text-muted-foreground">Finding what fits…</div>
            : choices.map((c) => (
              // The current one reads at full strength, marked "✓ now", and cannot be picked (#201).
              <button key={c.label} type="button" className={c.now ? row.replace("disabled:opacity-60", "") : row} disabled={busy || c.now}
                onClick={() => apply(c.change, `${NAMES[page]} ${page === "time" ? c.label.replace(/ to \d\d:\d\d$/, "") : c.label}`)}>
                <span className="flex-1">{c.label}{c.best ? <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs">Suggested</span> : null}</span>
                <span className={`text-[13px] ${c.now ? "font-semibold text-primary" : "text-muted-foreground"}`}>{c.now ? "✓ now" : c.hint}</span>
              </button>
            ))}
          {choices !== null && !choices.some((c) => !c.now) ? <div className="py-3 text-muted-foreground">Nothing else fits.</div> : null}
          {page === "time" && choices !== null ? (
            <button type="button" className={row} onClick={() => editAll(appt)}>
              <span className="flex-1">Another day or time…</span><span className="text-muted-foreground">›</span>
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <BottomSheet open={!!appt} onOpenChange={(o) => { if (!o) onClose(); }} title="">
      <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto">{body}</div>
    </BottomSheet>
  );
}

type Slot = {
  patient_id: string; patient_name: string; therapy_id: string; therapy_name: string;
  start_time: string; duration_minutes: number; staff_id: string; staff_name: string; co_staff_ids: string[]; room_id: string; room_name: string;
};
type Option = { id: string; name: string; free: boolean; why?: string };
type Options = { times: Slot[]; staff: Option[]; rooms: Option[]; why?: string };
type Who = { id: string; name: string; note: string; therapy_id: string | null; last: { name: string; date: string } | null };

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/**
 * Book one treatment from + (#285 story 5), on one sheet. Who first (nobody
 * booked today, then recent, a search at the bottom); choosing them fills in the
 * rest in place, every line the admin's to change: their last therapy, the date,
 * the best free time, a free therapist and a free room. The button names the outcome.
 * `patient` skips the first step, for a booking started from their card.
 */
export function BookSheet({ open, onClose, day, today, isToday, nowMinutes, refresh, other, patient }: {
  open: boolean; onClose: () => void; day: string; today: string; isToday: boolean; nowMinutes: number;
  refresh: () => Promise<void>; other: () => void; patient?: { id: string; name: string } | null;
}) {
  const [who, setWho] = useState<{ none: Who[]; recent: Who[]; all: Who[] } | null>(null);
  const [therapies, setTherapies] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Who | null>(null);
  const [therapyId, setTherapyId] = useState("");
  const [date, setDate] = useState(day);
  const [opts, setOpts] = useState<Options | null>(null);
  const [time, setTime] = useState("");
  const [staffId, setStaffId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ(""); setChosen(null); setOpts(null); setDate(day); setWho(null);
    fetch(`${API_BASE}/appointments/who?date=${day}`).then((r) => (r.ok ? r.json() : { none: [], recent: [], all: [] })).then(setWho).catch(() => setWho({ none: [], recent: [], all: [] }));
    fetch(`${API_BASE}/therapies`).then((r) => (r.ok ? r.json() : [])).then((t: { id: string; name: string; is_consultation?: boolean }[]) => setTherapies([...t].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setTherapies([]));
  }, [open, day]);

  const choose = (p: Who) => { setChosen(p); setTherapyId(p.therapy_id || therapies[0]?.id || ""); setDate(day); };
  // From their card: the patient is known, so the sheet opens on their lines.
  useEffect(() => { if (open && patient && who && !chosen) { const p = who.all.find((x) => x.id === patient.id); if (p) choose(p); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, patient, who, therapies]);

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
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chosen, therapyId, date]);

  const slot = opts?.times.find((t) => t.start_time === time);
  const coStaff = (slot?.co_staff_ids || []).filter((id) => id !== staffId);
  const book = async () => {
    if (!chosen || !slot) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/appointments/one`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: chosen.id, therapy_id: therapyId, date, start_time: time, staff_id: staffId, co_staff_ids: coStaff, room_id: roomId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.message || "That time has just gone. Choose another."); load(time); return; }
      onClose();
      await refresh();
      const first = chosen.name.split(" ")[0];
      toast(`Booked ${first}: ${therapies.find((t) => t.id === therapyId)?.name.replace(/_/g, " ")} at ${time}`, { duration: 8000, action: { label: "Undo", onClick: async () => {
        await fetch(`${API_BASE}/appointments/${body.id}`, { method: "DELETE" });
        await refresh();
      } } });
    } finally {
      setBusy(false);
    }
  };

  const free = (l: Option[]) => l.filter((o) => o.free);
  const busyOnes = (l: Option[]) => l.filter((o) => !o.free);
  const nameOf = (l: Option[] | undefined, id: string) => l?.find((o) => o.id === id)?.name || "";
  const first = chosen?.name.split(" ")[0] || "";
  const when = date === today ? "today" : new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={chosen ? chosen.name : "Book a treatment"}
      note={chosen ? chosen.note : "Who is it for?"}
      foot={chosen
        ? <button type="button" className={`${wide} bg-primary text-primary-foreground disabled:opacity-50`} disabled={busy || !slot} onClick={book}>{busy ? "Saving…" : slot ? `Book ${first}, ${date === today ? "" : `${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} `}${time}` : `Book ${first}`}</button>
        : <SearchField value={q} onChange={setQ} placeholder="Search patients" />}>
      {!chosen ? (
        who === null ? <Loading rows={3} /> : (<>
          <WhoPicker q={q} chosen={null} all={who.all} onChoose={choose}
            groups={[{ title: `No treatment yet ${day === today ? "today" : "that day"}`, list: who.none }, { title: "Recently booked", list: who.recent }]} />
          <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-primary" onClick={() => { onClose(); other(); }}>A course over several days ›</button>
        </>)
      ) : (
        <div>
          {!patient ? <button type="button" className="-mt-1 mb-1 min-h-10 text-sm font-semibold text-primary" onClick={() => { setChosen(null); setOpts(null); }}>‹ Someone else</button> : null}
          <ChangeLine label={chosen.last ? `Therapy · last: ${chosen.last.name.replace(/_/g, " ")}, ${shortDay(chosen.last.date)}` : "Therapy"} value={therapies.find((t) => t.id === therapyId)?.name.replace(/_/g, " ") || "Choose"}
            select={<LineSelect label="Therapy" value={therapyId} onChange={setTherapyId} free={therapies.map((t) => ({ id: t.id, name: t.name.replace(/_/g, " ") }))} />} />
          <ChangeLine label="Date" value={dayText(date)} select={<LineDate label="Date" value={date} min={today} onChange={setDate} />} />
          {opts === null ? <Loading rows={3} /> : opts.times.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{opts.why || `No free time for ${first} ${when}. Try another day or therapy.`}</p>
          ) : (<>
            <ChangeLine label="Time" value={<>{time}{time === opts.times[0].start_time ? <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">best</span> : null}</>}
              select={<LineSelect label="Time" value={time} onChange={(t) => load(t)} free={opts.times.map((t, i) => ({ id: t.start_time, name: t.start_time, tag: i === 0 ? "best" : undefined }))} />} />
            <ChangeLine label="Therapist" value={nameOf(opts.staff, staffId) || slot?.staff_name || "None free"}
              select={<LineSelect label="Therapist" value={staffId} onChange={setStaffId} free={free(opts.staff)} busy={busyOnes(opts.staff)} />} />
            <ChangeLine label="Room" value={nameOf(opts.rooms, roomId) || slot?.room_name || "None free"}
              select={<LineSelect label="Room" value={roomId} onChange={setRoomId} free={free(opts.rooms)} busy={busyOnes(opts.rooms)} />} />
            <p className="mt-2 text-[13px] text-muted-foreground">Chosen for you: free at {time}. Change any line.</p>
          </>)}
        </div>
      )}
    </BottomSheet>
  );
}
