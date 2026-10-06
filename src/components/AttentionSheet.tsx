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
import { InboxSheet, ItemRow, ListGroup, Row, Btn } from "@/components/kit";
import type { AttentionItem } from "@/lib/attention";

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

export function AttentionSheet({ open, onOpenChange, apiBase, day, today, problems, replans, dismissed, dismiss, undoReplan, onChanged, seeIt, afterConsultation, items, onItem, openRules }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  apiBase: string;
  /** The day on screen and today, YYYY-MM-DD on the centre's clock. */
  day: string;
  today: string;
  problems: DayProblem[];
  replans: ReplanBatch[];
  /** Notes and replans the admin has dismissed today. */
  dismissed: string[];
  dismiss: (id: string) => void;
  undoReplan: (b: ReplanBatch) => Promise<boolean>;
  onChanged: () => Promise<void>;
  seeIt: (appointmentId: string) => void;
  /** After a consultation (#219): straight into the resident's meals or their card, to book. */
  afterConsultation: (p: DayProblem, what: "diet" | "treatments") => void;
  /** Patient and team items from the rules in Settings, What needs you (#288). */
  items: AttentionItem[];
  onItem: (i: AttentionItem) => void;
  openRules: () => void;
}) {
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setDone(null); setError(null); } }, [open]);

  const act = problems.filter((p) => p.problem_class === "blocking");
  // Only rows with one answer: a row asking the admin to choose is never chosen for them.
  const fixable = act.filter((p) => p.fix && p.choices.length <= 1);
  // A resident with nothing booked is a rest day, not a note (#144).
  const notes = problems.filter((p) => p.problem_class === "worth_knowing" && p.kind !== "IDLE_RESIDENT" && !dismissed.includes(p.id));
  const patientAct = items.filter((i) => i.section === "Patients" && i.kind === "action");
  const teamAct = items.filter((i) => i.section === "Team" && i.kind === "action");
  const didForYou = replans.filter((b) => !dismissed.includes(b.batch_id));
  // A therapist whose day was moved already has their line under the day.
  const teamInfo = items.filter((i) => i.kind === "information" && !didForYou.some((b) => b.staff_name === i.who));
  const empty = act.length + notes.length + didForYou.length + patientAct.length + teamAct.length + teamInfo.length === 0;

  // Nothing left: say so, then get out of the way, as the design does. Not
  // while an Undo is showing: with the pill gone it could not be reached again.
  const undoable = Boolean(done?.undo);
  useEffect(() => {
    if (!open || !empty || undoable) return;
    const t = setTimeout(() => onOpenChange(false), 1600);
    return () => clearTimeout(t);
  }, [open, empty, undoable, onOpenChange]);

  // Every move in one call: the server checks them all before writing any, so it is one batch and one Undo (story 3).
  async function apply(p: DayProblem | null, ...fixes: Fix[]) {
    setBusy(p?.id ?? "all");
    setError(null);
    try {
      const res = await fetch(`${apiBase}/day-check/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day, moves: fixes.map((f) => ({ appointment_id: f.appointment_id, staff_id: f.staff_id, co_staff_ids: f.co_staff_ids || [], room_id: f.room_id, start_time: f.start_time, date: f.date, cancel: f.cancel })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The day moved under the answer. The fresh check has a new one.
        setError(body.message || "The day changed while this was open; the answer has been worked out again.");
        await onChanged();
        return;
      }
      const batch = body.batch_id as string | null;
      const f = fixes[0];
      setDone({
        text: !p ? `${fixes.length} treatments fixed as shown.` : f.cancel ? `${p.patient_name}'s treatment at ${p.start_time} cancelled.` : `${p.patient_name}: ${f.label}.`,
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

  const tb = (main = false) => `min-h-11 px-3 rounded-full text-sm ${main ? "font-bold text-primary" : "font-semibold text-muted-foreground"} disabled:opacity-50`;
  const item = (key: string, title: string, body: string | null, buttons: React.ReactNode, choose = false) => <ItemRow key={key} title={title} facts={body} stacked={choose}>{buttons}</ItemRow>;

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

  // The sheet opens on whatever day is on screen, so it names that day (#193).
  const dayName = day === today ? "Today" : new Date(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <InboxSheet open={open} onOpenChange={onOpenChange} title={dayName} empty="Nothing else needs you."
      foot={<Btn kind="quiet" onClick={() => { onOpenChange(false); openRules(); }}>What needs you · change the rules ›</Btn>}
      // The one inbox for the whole app (story 1). Patients and Team come from the rules in Settings, What needs you; empty sections do not show.
      sections={[{
        name: "Day", count: act.length,
        body: act.length + didForYou.length + notes.length === 0 ? null : (
          <div className="space-y-3">
            {fixable.length > 1 ? <Btn kind="primary" disabled={busy !== null} onClick={() => apply(null, ...fixable.map((p) => p.fix!))}>{busy === "all" ? "Fixing…" : `Fix all ${fixable.length} as shown`}</Btn> : null}
            {act.length ? <ListGroup>{act.map(actionItem)}</ListGroup> : null}
            {didForYou.length + notes.length ? (
              <ListGroup title="Information · not counted">
            {didForYou.map((b) => item(b.batch_id, `${b.staff_name} is not in ${day === today ? "today" : `on ${dayName}`}`,
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
            {notes.map((p) => item(p.id, [p.start_time, p.who].filter(Boolean).join(" · "), p.what, p.kind === "CONSULTED" ? <>
              <button type="button" className={tb(true)} onClick={() => afterConsultation(p, "diet")}>Diet</button>
              <button type="button" className={tb(true)} onClick={() => afterConsultation(p, "treatments")}>Treatments</button>
              <button type="button" className={tb()} onClick={() => dismiss(p.id)}>Dismiss</button>
            </> : <>
              {p.appointment_id ? <button type="button" className={tb()} onClick={() => seeIt(p.appointment_id!)}>See it</button> : null}
              <button type="button" className={tb()} onClick={() => dismiss(p.id)}>Dismiss</button>
            </>))}
              </ListGroup>
            ) : null}
          </div>
        ),
      }, {
        name: "Patients", count: patientAct.length,
        body: patientAct.length ? <ListGroup>{patientAct.map((i) => <Row key={i.id} title={i.who} facts={i.what} trailing={{ card: "Open card ›", diet: "Choose diet ›", summary: "Summary ›" }[i.action ?? "card"]} onClick={() => onItem(i)} />)}</ListGroup> : null,
      }, {
        name: "Team", count: teamAct.length,
        body: teamAct.length + teamInfo.length ? <ListGroup>{[...teamAct, ...teamInfo].map((i) => <Row key={i.id} title={i.kind === "information" ? i.what : i.who} facts={i.kind === "information" ? "Information · not counted" : i.what} />)}</ListGroup> : null,
      }]}>
      {done ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-primary">
          <span>✓ {done.text}</span>
          {done.undo ? <button type="button" className={tb()} disabled={busy === "undo"} onClick={undoDone}>Undo</button> : null}
        </div>
      ) : null}
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
    </InboxSheet>
  );
}
