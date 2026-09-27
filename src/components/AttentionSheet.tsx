/**
 * The pill's sheet (#164, docs/design/phone.html): what needs the admin today,
 * in two sections. "For your action" is what the server would refuse, each with
 * the one move that fixes it or the choices it is asking about. "For your
 * information" is what the app already did (a therapist's day moved) and notes.
 *
 * Every answer comes from `/day-check`; a fix is accepted one row at a time
 * through `/day-check/accept`, whose guard checks it against the day as it is
 * now. The sheet stays open and redraws as rows are dealt with.
 */
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomBar";

export type Fix = {
  label: string;
  cost_note: string | null;
  appointment_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
  room_id: string | null;
  start_time: string;
  date: string;
  choice?: string;
  cancel?: boolean;
};

export type DayProblem = {
  id: string;
  kind: string;
  problem_class: "blocking" | "worth_knowing";
  who: string;
  start_time: string | null;
  what: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  staff_id: string | null;
  fix: Fix | null;
  choices: Fix[];
  no_fix_reason: string | null;
};

export type ReplanBatch = {
  batch_id: string;
  staff_name: string;
  moved: { appointment_id: string; to: { staff_name: string } ; from: { staff_name: string } }[];
  proposed: unknown[];
  unplaced: unknown[];
};

type Done = { text: string; undo: (() => Promise<boolean>) | null };

const listed = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const first = (name: string) => name.split(" ")[0];

export function AttentionSheet({ open, onOpenChange, apiBase, day, problems, replans, dismissed, dismiss, undoReplan, onChanged, seeIt }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  apiBase: string;
  day: string;
  problems: DayProblem[];
  replans: ReplanBatch[];
  /** Notes and replans the admin has dismissed today. */
  dismissed: string[];
  dismiss: (id: string) => void;
  undoReplan: (b: ReplanBatch) => Promise<boolean>;
  onChanged: () => Promise<void>;
  seeIt: (appointmentId: string) => void;
}) {
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setDone(null); setError(null); } }, [open]);

  const act = problems.filter((p) => p.problem_class === "blocking");
  // A resident with nothing booked is a rest day, not a note (#144).
  const notes = problems.filter((p) => p.problem_class === "worth_knowing" && p.kind !== "IDLE_RESIDENT" && !dismissed.includes(p.id));
  const didForYou = replans.filter((b) => !dismissed.includes(b.batch_id));
  const empty = act.length + notes.length + didForYou.length === 0;

  // Nothing left: say so, then get out of the way, as the design does. Not
  // while an Undo is showing: with the pill gone it could not be reached again.
  const undoable = Boolean(done?.undo);
  useEffect(() => {
    if (!open || !empty || undoable) return;
    const t = setTimeout(() => onOpenChange(false), 1600);
    return () => clearTimeout(t);
  }, [open, empty, undoable, onOpenChange]);

  async function apply(p: DayProblem, f: Fix) {
    setBusy(p.id);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/day-check/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day, moves: [{ appointment_id: f.appointment_id, staff_id: f.staff_id, co_staff_ids: f.co_staff_ids || [], room_id: f.room_id, start_time: f.start_time, date: f.date, cancel: f.cancel }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The day moved under the answer. The fresh check has a new one.
        setError(body.message || "The day changed while this was open; the answer has been worked out again.");
        await onChanged();
        return;
      }
      const batch = body.batch_id as string | null;
      setDone({
        text: f.cancel ? `${p.patient_name}'s treatment at ${p.start_time} cancelled.` : `${p.patient_name}: ${f.label}.`,
        undo: batch ? async () => (await fetch(`${apiBase}/replan/undo`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: batch }),
        })).ok : null,
      });
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function undoDone() {
    if (!done?.undo) return;
    setBusy("undo");
    try {
      if (await done.undo()) { setDone({ text: "Put back as it was.", undo: null }); await onChanged(); }
      else setError("That could not be undone.");
    } finally {
      setBusy(null);
    }
  }

  const tb = (main = false) => `min-h-10 px-3 rounded-full text-sm ${main ? "font-bold text-primary" : "font-semibold text-muted-foreground"} disabled:opacity-50`;
  const item = (key: string, title: string, body: string | null, buttons: React.ReactNode, choose = false) => (
    <div key={key} className="flex flex-col gap-0.5 border-t border-black/[.07] py-2.5 first-of-type:border-t-0">
      <b className="text-[15px] leading-snug">{title}</b>
      {body ? <div className="text-sm text-muted-foreground">{body}</div> : null}
      <div className={`mt-1 flex ${choose ? "flex-col items-end" : "justify-end"} gap-1`}>{buttons}</div>
    </div>
  );

  const actionItem = (p: DayProblem) => {
    const see = p.appointment_id ? <button type="button" className={tb()} onClick={() => seeIt(p.appointment_id!)}>See it</button> : null;
    const at = [p.start_time, p.who].filter(Boolean).join(" · ");
    if (p.choices.length > 1) {
      return item(p.id, p.what, [at, p.no_fix_reason].filter(Boolean).join(". "), <>
        {p.choices.map((c, i) => (
          <button key={c.choice || i} type="button" data-main={i === 0 || undefined} className={`${tb(i === 0)} text-right`} disabled={busy !== null} onClick={() => apply(p, c)}>{c.label}</button>
        ))}
        {see}
      </>, true);
    }
    if (p.fix) {
      return item(p.id, p.what, [at, p.fix.cost_note].filter(Boolean).join(". "), <>
        <button type="button" data-main className={`${tb(true)}`} disabled={busy !== null} onClick={() => apply(p, p.fix!)}>{p.fix.label}</button>
        {see}
      </>);
    }
    return item(p.id, p.what, [at, p.no_fix_reason].filter(Boolean).join(". "), see);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Today">
      <div className="max-h-[70dvh] space-y-3 overflow-y-auto">
        {done ? (
          <div className="flex items-center justify-between gap-2 rounded-[10px] bg-secondary px-3 py-2 text-sm font-semibold text-primary">
            <span>✓ {done.text}</span>
            {done.undo ? <button type="button" className={tb()} disabled={busy === "undo"} onClick={undoDone}>Undo</button> : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {empty ? <div className="p-4 text-center text-muted-foreground">Nothing else needs you.</div> : null}
        {act.length ? (
          <section className="rounded-2xl bg-[#FBEAE3] px-3 py-1">
            <div className="pb-0.5 pt-2.5 text-xs font-bold uppercase tracking-[.05em] text-destructive">For your action · {act.length}</div>
            {act.map(actionItem)}
          </section>
        ) : null}
        {didForYou.length + notes.length ? (
          <section className="rounded-2xl bg-background px-3 py-1">
            <div className="pb-0.5 pt-2.5 text-xs font-bold uppercase tracking-[.05em] text-muted-foreground">For your information · {didForYou.length + notes.length}</div>
            {didForYou.map((b) => item(b.batch_id, `${b.staff_name} is not in today`,
              b.moved.length
                ? `${first(b.staff_name)}'s ${b.moved.length} treatment${b.moved.length === 1 ? "" : "s"} went to ${listed([...new Set(b.moved.map((m) => first(m.to.staff_name)))])}.`
                : "Nothing of theirs could be moved by itself.", <>
                <button type="button" className={tb()} disabled={busy !== null} onClick={async () => {
                  setBusy(b.batch_id);
                  try {
                    if (await undoReplan(b)) setDone({ text: `${first(b.staff_name)}'s treatments are back on their name.`, undo: null });
                  } finally { setBusy(null); }
                }}>Undo</button>
                <button type="button" className={tb()} onClick={() => dismiss(b.batch_id)}>Dismiss</button>
              </>))}
            {notes.map((p) => item(p.id, [p.start_time, p.who].filter(Boolean).join(" · "), p.what, <>
              {p.appointment_id ? <button type="button" className={tb()} onClick={() => seeIt(p.appointment_id!)}>See it</button> : null}
              <button type="button" className={tb()} onClick={() => dismiss(p.id)}>Dismiss</button>
            </>))}
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
