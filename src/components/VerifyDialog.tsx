/**
 * Verify — the one place the day gets fixed.
 *
 * It used to carry its own copy of the availability rules, written in the
 * browser, and disagreed with the scheduler: on the seeded day it reported a
 * clean schedule while the server refused four of its treatments. Every rule now
 * comes from `GET /day-check`, which is the same code that refuses a booking,
 * and every fix comes from the same ladder that rehouses an absent therapist's
 * day. Nothing here decides anything.
 *
 * Shape follows the day, not the database: one problem per card, worst first,
 * who and what on top, the answer already in the button. Everything speaks in
 * place — there are no toasts, because a toast about the day is gone before the
 * admin has read it, and this dialog is where they are looking.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type Fix = {
  label: string;
  tier: 1 | 2 | 3;
  cost_note: string | null;
  appointment_id: string;
  staff_id: string | null;
  staff_name: string;
  room_id: string | null;
  start_time: string;
  date: string;
};

export type DayProblem = {
  id: string;
  kind: string;
  problem_class: "blocking" | "worth_knowing";
  who: string;
  what: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  staff_id: string | null;
  fix: Fix | null;
  no_fix_reason: string | null;
};

type UpcomingDay = { date: string; count: number; headline: string | null };

/**
 * The rules, as the admin may argue with them. Only the two the fix-finder owns
 * can be switched off, and switching one off widens the search — it never books
 * something the server would refuse, which is why the rest are greyed with their
 * reason beside them rather than hidden.
 */
const NEGOTIABLE = [
  { key: "relax_preferred_staff", label: "Keep the resident's own therapist" },
  { key: "relax_buffer", label: "Keep the gap between treatments" },
] as const;

const FIXED_RULES = [
  { label: "One therapist, one treatment at a time", why: "One person cannot be in two rooms." },
  { label: "One room, one treatment at a time", why: "Same room, same hour, two residents." },
  { label: "A therapist who is not in cannot treat", why: "They are not in the building." },
  { label: "Therapist of the resident's own gender", why: "Set by the centre in Settings." },
  { label: "The room has what the treatment needs", why: "A Pizhichil without a droni cannot happen." },
] as const;

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function VerifyDialog({
  open, onOpenChange, apiBase, currentDate, staff, onOpenAppointment, onAssignFor, onJumpToDate, onRefresh,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiBase: string;
  /** The day the schedule is on. Verify checks that day and asks no date question. */
  currentDate: Date;
  staff: { id: string; name: string }[];
  onOpenAppointment: (appointmentId: string) => void;
  /** Booking a resident's day is the Assign dialog's job, with them filled in. */
  onAssignFor: (patientId: string) => void;
  onJumpToDate: (dateISO: string) => void;
  onRefresh: (datesISO: string[]) => Promise<void>;
}) {
  const dateISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

  const [loading, setLoading] = useState(false);
  const [problems, setProblems] = useState<DayProblem[]>([]);
  /** What each card says after it acted, and how to put it back. */
  const [done, setDone] = useState<Record<string, { text: string; batch_id: string | null }>>({});
  /**
   * A card that has been dealt with stays where it was, saying so, until the
   * dialog is closed — the problem itself is gone from the next check, and a
   * card that vanishes takes the admin's place in the list with it.
   */
  const [resolved, setResolved] = useState<DayProblem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, Fix[]>>({});
  const [relaxed, setRelaxed] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reassignStaff, setReassignStaff] = useState<string>("");
  const [reassignNote, setReassignNote] = useState<{ text: string; batch_id: string | null } | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDay[] | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // No Scan button: Verify is opened because something is wrong, and the
  // reassignment has usually already happened.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/day-check?date=${dateISO}`);
      const data = await res.json().catch(() => ({ problems: [] }));
      setProblems(Array.isArray(data.problems) ? data.problems : []);
    } catch {
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, dateISO]);

  useEffect(() => {
    if (!open) return;
    setDone({});
    setResolved([]);
    setExpanded(null);
    setOptions({});
    setRelaxed({});
    setConfirmDelete(null);
    setReassignNote(null);
    setUpcoming(null);
    setReassignStaff("");
    load();
  }, [open, load]);

  async function takeFix(problem: DayProblem, fix: Fix) {
    setBusy(problem.id);
    try {
      const res = await fetch(`${apiBase}/day-check/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: fix.appointment_id,
          staff_id: fix.staff_id,
          room_id: fix.room_id,
          start_time: fix.start_time,
          date: fix.date,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDone((p) => ({ ...p, [problem.id]: { text: body.message || "That could not be done.", batch_id: null } }));
        return;
      }
      setResolved((r) => (r.some((x) => x.id === problem.id) ? r : [...r, problem]));
      const where = fix.date === dateISO ? `at ${fix.start_time}` : `to ${dateLabel(fix.date)}, ${fix.start_time}`;
      setDone((p) => ({ ...p, [problem.id]: { text: `Moved ${where} with ${fix.staff_name}.`, batch_id: body.batch_id ?? null } }));
      await onRefresh([dateISO, fix.date]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function undo(problemId: string, batchId: string) {
    setBusy(problemId);
    try {
      const res = await fetch(`${apiBase}/replan/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      if (!res.ok) return;
      // Put back means put back: the card returns as a problem with its fix on
      // it, rather than as a note about something that is true again.
      setDone((p) => { const next = { ...p }; delete next[problemId]; return next; });
      setResolved((r) => r.filter((x) => x.id !== problemId));
      await onRefresh([dateISO]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function loadOptions(problem: DayProblem, relaxKeys: string[]) {
    if (!problem.appointment_id) return;
    setBusy(problem.id);
    try {
      const params = new URLSearchParams({ date: dateISO, appointment_id: problem.appointment_id });
      for (const k of relaxKeys) params.set(k, "true");
      const res = await fetch(`${apiBase}/day-check/options?${params.toString()}`);
      const data = await res.json().catch(() => ({ options: [] }));
      setOptions((p) => ({ ...p, [problem.id]: Array.isArray(data.options) ? data.options : [] }));
    } finally {
      setBusy(null);
    }
  }

  async function removeAppointment(problem: DayProblem) {
    if (!problem.appointment_id) return;
    setBusy(problem.id);
    try {
      const res = await fetch(`${apiBase}/appointments/${problem.appointment_id}`, { method: "DELETE" });
      if (!res.ok) {
        setDone((p) => ({ ...p, [problem.id]: { text: "That could not be deleted.", batch_id: null } }));
        return;
      }
      setResolved((r) => (r.some((x) => x.id === problem.id) ? r : [...r, problem]));
      setDone((p) => ({ ...p, [problem.id]: { text: "Deleted.", batch_id: null } }));
      setConfirmDelete(null);
      await onRefresh([dateISO]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function reassignWholeDay() {
    if (!reassignStaff) return;
    setBusy("reassign");
    try {
      const res = await fetch(`${apiBase}/replan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: reassignStaff, date: dateISO, apply: true }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out) {
        setReassignNote({ text: "That day could not be reassigned.", batch_id: null });
        return;
      }
      const needs = out.proposed.length + out.unplaced.length;
      setReassignNote({
        text: `${out.staff_name}: ${out.moved.length} treatment${out.moved.length === 1 ? "" : "s"} given to someone else${needs > 0 ? `, ${needs} still need${needs === 1 ? "s" : ""} a decision below` : ""}.`,
        batch_id: out.batch_id,
      });
      await onRefresh([dateISO]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function undoReassign() {
    if (!reassignNote?.batch_id) return;
    setBusy("reassign");
    try {
      const res = await fetch(`${apiBase}/replan/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: reassignNote.batch_id }),
      });
      if (!res.ok) return;
      setReassignNote({ text: "Put back as it was.", batch_id: null });
      await onRefresh([dateISO]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function loadUpcoming() {
    setUpcomingLoading(true);
    try {
      const res = await fetch(`${apiBase}/day-check/upcoming?from=${dateISO}&days=30`);
      const data = await res.json().catch(() => ({ days_with_problems: [] }));
      setUpcoming(Array.isArray(data.days_with_problems) ? data.days_with_problems : []);
    } finally {
      setUpcomingLoading(false);
    }
  }

  // Cards already dealt with keep their place; the rest come from the last check.
  const fresh = problems.filter((p) => !done[p.id]);
  const shown = [...resolved, ...fresh.filter((p) => !resolved.some((r) => r.id === p.id))];
  const blocking = shown.filter((p) => p.problem_class === "blocking");
  const worthKnowing = shown.filter((p) => p.problem_class === "worth_knowing");

  const card = (problem: DayProblem) => {
    const acted = done[problem.id];
    const relaxKeys = relaxed[problem.id] || [];
    const isOpen = expanded === problem.id;
    const working = busy === problem.id;

    return (
      <div key={problem.id} className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-start gap-2">
          {problem.problem_class === "blocking" ? (
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          ) : null}
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-snug">{problem.who}</p>
            <p className="text-sm text-muted-foreground leading-snug">{problem.what}</p>
          </div>
        </div>

        {acted ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
              {acted.text}
            </p>
            {acted.batch_id ? (
              <button type="button" className="text-sm underline min-h-11 px-1" disabled={working} onClick={() => undo(problem.id, acted.batch_id!)}>
                Undo
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {problem.fix ? (
              <Button
                className="w-full h-auto min-h-11 py-2 whitespace-normal text-left justify-start"
                disabled={working}
                onClick={() => takeFix(problem, problem.fix!)}
              >
                {working ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                <span>
                  {problem.fix.label}
                  {problem.fix.cost_note ? <span className="block text-xs opacity-90">{problem.fix.cost_note}</span> : null}
                </span>
              </Button>
            ) : problem.kind === "IDLE_RESIDENT" ? (
              <Button className="w-full h-auto min-h-11 py-2 whitespace-normal" onClick={() => onAssignFor(problem.patient_id!)}>
                Book something for {problem.patient_name}
              </Button>
            ) : (
              <p className="text-sm text-amber-700">{problem.no_fix_reason || "Nothing free to move it to."}</p>
            )}

            {/* Secondary actions in words, never an icon on its own. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {problem.appointment_id ? (
                <>
                  <button
                    type="button"
                    className="text-sm underline min-h-11"
                    onClick={() => {
                      const next = isOpen ? null : problem.id;
                      setExpanded(next);
                      if (next && !options[problem.id]) loadOptions(problem, relaxKeys);
                    }}
                  >
                    {isOpen ? "Hide other options" : "Other options"}
                  </button>
                  <button type="button" className="text-sm underline min-h-11" onClick={() => onOpenAppointment(problem.appointment_id!)}>
                    Open the appointment
                  </button>
                  {confirmDelete === problem.id ? (
                    <span className="text-sm flex items-center gap-3">
                      Delete?
                      <button type="button" className="underline min-h-11" disabled={working} onClick={() => removeAppointment(problem)}>Yes</button>
                      <button type="button" className="underline min-h-11" onClick={() => setConfirmDelete(null)}>No</button>
                    </span>
                  ) : (
                    <button type="button" className="text-sm underline min-h-11 text-muted-foreground" onClick={() => setConfirmDelete(problem.id)}>
                      Delete
                    </button>
                  )}
                </>
              ) : null}
            </div>

            {isOpen ? (
              <div className="rounded-md bg-muted/50 p-2 space-y-2">
                {working ? (
                  <p className="text-sm text-muted-foreground">Looking…</p>
                ) : (options[problem.id] || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing else is free.</p>
                ) : (
                  (options[problem.id] || []).map((f, i) => (
                    <Button key={`${f.staff_id}-${f.start_time}-${i}`} variant="outline" className="w-full h-auto min-h-11 py-2 whitespace-normal justify-start" onClick={() => takeFix(problem, f)}>
                      {f.label}
                    </Button>
                  ))
                )}

                <div className="pt-1 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rules used</p>
                  {NEGOTIABLE.map((r) => (
                    <label key={r.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{r.label}</span>
                      <Switch
                        checked={!relaxKeys.includes(r.key)}
                        onCheckedChange={(on) => {
                          const next = on ? relaxKeys.filter((k) => k !== r.key) : [...relaxKeys, r.key];
                          setRelaxed((p) => ({ ...p, [problem.id]: next }));
                          loadOptions(problem, next);
                        }}
                      />
                    </label>
                  ))}
                  {FIXED_RULES.map((r) => (
                    <div key={r.label} className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
                      <span>{r.label}</span>
                      <span className="text-xs text-right shrink-0 max-w-[45%]">{r.why}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full height on a phone, an ordinary dialog from tablet up. */}
      <DialogContent className="max-w-none w-screen h-[100dvh] rounded-none p-4 gap-3 overflow-y-auto sm:max-w-lg sm:w-full sm:h-auto sm:max-h-[85vh] sm:rounded-lg">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle>Verify</DialogTitle>
          <p className="text-sm text-muted-foreground">{dateLabel(dateISO)}</p>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Checking the day…</p>
        ) : (
          <div className="space-y-3">
            {blocking.length === 0 && worthKnowing.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-700" />Nothing is wrong with this day.</p>
              </div>
            ) : null}

            {blocking.map(card)}

            {worthKnowing.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Worth knowing</p>
                {worthKnowing.map(card)}
              </>
            ) : null}

            {/* Whole-day reassignment lives here, not in the dashboard header:
                "give me Dr Joshi's day to someone else" and "fix this one
                session" are the same job. No absence has to be filed first. */}
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <p className="font-semibold text-sm">Give a therapist's whole day to someone else</p>
              {reassignNote ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />{reassignNote.text}</p>
                  {reassignNote.batch_id ? (
                    <button type="button" className="text-sm underline min-h-11" disabled={busy === "reassign"} onClick={undoReassign}>Undo</button>
                  ) : null}
                </div>
              ) : null}
              <Select value={reassignStaff} onValueChange={setReassignStaff}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Which therapist?" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full min-h-11" disabled={!reassignStaff || busy === "reassign"} onClick={reassignWholeDay}>
                {busy === "reassign" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Reassign this day
              </Button>
            </div>

            {/* Room and therapy edits can break a future day; absences already
                fix themselves. So the future is offered, never scanned at you. */}
            <div className="pt-1">
              {upcoming === null ? (
                <button type="button" className="text-sm underline min-h-11" disabled={upcomingLoading} onClick={loadUpcoming}>
                  {upcomingLoading ? "Checking…" : "Check the next 30 days?"}
                </button>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">The next 30 days are clear.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm">{upcoming.length} day{upcoming.length === 1 ? "" : "s"} in the next 30 have something to fix:</p>
                  {upcoming.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      className="block w-full text-left text-sm underline min-h-11"
                      onClick={() => { onJumpToDate(d.date); onOpenChange(false); }}
                    >
                      {dateLabel(d.date)} — {d.count} thing{d.count === 1 ? "" : "s"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Button variant="outline" className="w-full min-h-11" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}
