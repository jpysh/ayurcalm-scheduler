/**
 * The treatment card (#136), built to docs/design/phone.html. Facts are rows;
 * a row opens a list the server worked out, and tapping an option applies it
 * at once with Undo — no confirm button. Every problem on one treatment sits
 * behind one "Something wrong?" row. History shows the latest change.
 */
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomBar";
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
type Choice = { label: string; hint?: string; best?: boolean; change: Record<string, unknown> };
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
  const who = nameIn(patients, appt.patient_id) || "Resident";
  const first = who.split(" ")[0];
  const team = [appt.staff_id, ...(appt.co_staff_ids || [])].filter((x): x is string => Boolean(x));
  const st = toM(appt.start_time), en = st + appt.duration_minutes;
  const past = isToday && en <= nowMinutes;
  const now = isToday && st <= nowMinutes && en > nowMinutes;
  const noShow = appt.status === "no_show";
  const locked = past || noShow || appt.status === "cancelled";

  /** Applies a change, closes the card and offers Undo with the fields it replaced. */
  const apply = async (change: Record<string, unknown>, message: string) => {
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

  // "Stay day 4 of 14", from the resident's stay that holds this treatment.
  const stayOf = (patients.find((p) => String(p.id) === String(appt.patient_id)) as { actualStart?: string; actualEnd?: string } | undefined);
  const dayMs = (iso?: string) => (iso ? Date.parse(iso.slice(0, 10)) : NaN);
  const at = dayMs(appt.scheduled_date);
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
  const Fact = ({ label, value, onClick }: { label: string; value: ReactNode; onClick: () => void }) => (
    <button type="button" className={row} disabled={locked || busy} onClick={onClick}>
      <span className="w-20 flex-none text-muted-foreground">{label}</span>
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
    time: [`Move ${first}'s treatment`, `Later today, with the same therapist and room. Only times where everyone stays free.`],
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
          {noShow ? <span className="text-sm font-semibold text-destructive">Didn't come</span>
            : past ? <span className="text-sm text-muted-foreground">Finished</span>
            : now ? <span className="text-sm font-semibold text-now">In progress · {en - nowMinutes} min left</span> : null}
          <button type="button" className="block text-left text-[22px] font-semibold leading-tight disabled:opacity-100" disabled={!openResident} onClick={() => openResident?.(appt.patient_id)}>
            {who}{openResident ? <span className="ml-1 text-muted-foreground">›</span> : null}
          </button>
          <div className="text-[13px] text-muted-foreground">
            {[appt.total_sessions ? `Session ${appt.session_number} of ${appt.total_sessions}` : "", stayDay].filter(Boolean).join(" · ")}
          </div>
        </div>
        {problem && !locked ? (
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
        {locked ? null : (
          <div className={box}>
            <button type="button" className={row} onClick={() => setPage("wrong")}>
              <span className="flex-1">Something wrong?<small className="block text-[13px] text-muted-foreground">Didn't come, running late, cancel, therapist or room</small></span>
              <span className="text-muted-foreground">›</span>
            </button>
          </div>
        )}
        <div className={box}>
          <button type="button" className={row} onClick={() => setPage("history")}>
            <span className="w-20 flex-none text-muted-foreground">History</span>
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
        <ol className={box}>
          {(history || []).map((e, i) => (
            <li key={i} className="border-b border-border py-2.5 last:border-b-0">{e.text}
              <small className="block text-[13px] text-muted-foreground">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.who}</small>
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
            : choices.length === 0 ? <div className="py-3 text-muted-foreground">Nothing fits. Try Edit everything for another day.</div>
            : choices.map((c) => (
              <button key={c.label} type="button" className={row} disabled={busy} onClick={() => apply(c.change, `${NAMES[page]} ${page === "time" ? c.label.split(" ")[0] : c.label}`)}>
                <span className="flex-1">{c.label}{c.best ? <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs">Suggested</span> : null}</span>
                <span className="text-[13px] text-muted-foreground">{c.hint}</span>
              </button>
            ))}
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

type Suggestion = {
  patient_id: string; patient_name: string; therapy_id: string; therapy_name: string;
  start_time: string; duration_minutes: number; staff_id: string; staff_name: string; room_id: string; room_name: string;
};

/**
 * Book one treatment from + (#136): the server's next free time for the
 * residents furthest behind on their stay, the best one chosen, one tap to book.
 * "Someone else…" is the full booking form.
 */
export function BookSheet({ open, onClose, day, isToday, nowMinutes, refresh, other }: {
  open: boolean; onClose: () => void; day: string; isToday: boolean; nowMinutes: number;
  refresh: () => Promise<void>; other: () => void;
}) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setPick(0);
    fetch(`${API_BASE}/appointments/suggest?date=${day}${isToday ? `&now=${hm(nowMinutes)}` : ""}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] })).then((d) => setList(d.suggestions || []));
  }, [open, day, isToday, nowMinutes]);

  const chosen = list?.[pick];
  const book = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/appointments/one`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: chosen.patient_id, therapy_id: chosen.therapy_id, date: day, start_time: chosen.start_time, staff_id: chosen.staff_id, room_id: chosen.room_id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.message || "That time has just gone. Try again."); return; }
      onClose();
      await refresh();
      const ids: string[] = [body.id];
      toast(`Booked ${chosen.patient_name.split(" ")[0]}: ${chosen.therapy_name} at ${chosen.start_time}`, { duration: 8000, action: { label: "Undo", onClick: async () => {
        await Promise.all(ids.map((id) => fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" })));
        await refresh();
      } } });
    } finally {
      setBusy(false);
    }
  };

  const opt = "flex w-full min-h-12 items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-[15px] aria-pressed:border-primary aria-pressed:bg-secondary";
  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Book a treatment">
      <div className="flex flex-col gap-3">
        <div className="-mt-2 text-[13px] text-muted-foreground">
          {list === null ? "Finding the next free time…" : chosen ? `Next free: ${chosen.start_time} · ${chosen.staff_name} · ${chosen.room_name} · residents furthest behind on their stay` : "Nobody in house can be fitted in today."}
        </div>
        <div className="flex flex-col gap-1.5">
          {(list || []).map((s, i) => (
            <button key={s.patient_id} type="button" aria-pressed={i === pick} className={opt} onClick={() => setPick(i)}>
              <span>{s.patient_name} · {s.therapy_name}<small className="block text-[13px] text-muted-foreground">{s.start_time} with {s.staff_name} · {s.room_name}</small></span>
              {i === 0 ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">best</span> : null}
            </button>
          ))}
          <button type="button" className={opt} onClick={() => { onClose(); other(); }}>Someone else…</button>
        </div>
        {chosen ? <button type="button" className="min-h-11 rounded-full bg-primary font-semibold text-primary-foreground" disabled={busy} onClick={book}>Book {chosen.patient_name}</button> : null}
      </div>
    </BottomSheet>
  );
}
