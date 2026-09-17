/**
 * Verify — what is wrong with the day, and the one plan that fixes it.
 *
 * Every rule and every answer comes from `/day-check`, which is the code that
 * refuses a booking and the planner that rehouses an absent therapist's day.
 * Nothing here decides anything.
 *
 * The screen is grouped by cause, because one therapist ringing in sick is one
 * thing that happened and not four: a heading, the treatments as rows underneath,
 * and one solid button at the bottom that accepts the whole plan. Changing a row
 * pins it and the rest of the plan is worked out again around it, so what is on
 * the screen can always be accepted whole.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

export type Fix = {
  label: string;
  tier: 1 | 2 | 3;
  cost_note: string | null;
  pinned: boolean;
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
  start_time: string | null;
  what: string;
  group_key: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  staff_id: string | null;
  blocked_by_preferred_staff: boolean;
  fix: Fix | null;
  no_fix_reason: string | null;
};

type ProblemGroup = {
  key: string;
  label: string;
  problem_class: "blocking" | "worth_knowing";
  staff_id: string | null;
  problem_ids: string[];
};

type DayCheck = { date: string; problems: DayProblem[]; groups: ProblemGroup[]; plan: Fix[]; headline: string | null };
type Pin = { appointment_id: string; staff_id: string | null; room_id: string | null; start_time: string; date: string };
type UpcomingDay = { date: string; count: number; headline: string | null };

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
  const [replanning, setReplanning] = useState(false);
  const [check, setCheck] = useState<DayCheck | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [relaxPreferred, setRelaxPreferred] = useState(false);
  const [accepted, setAccepted] = useState<{ text: string; batch_id: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, Fix[]>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reassignStaff, setReassignStaff] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDay[] | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // No Scan button: Verify is opened because something is wrong, and the plan is
  // worked out before the admin has finished reading the first line.
  const load = useCallback(async (nextPins: Pin[], relax: boolean, quiet = false) => {
    if (quiet) setReplanning(true); else setLoading(true);
    try {
      const res = await fetch(`${apiBase}/day-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateISO, pins: nextPins, relax_preferred_staff: relax }),
      });
      const data = await res.json().catch(() => null);
      setCheck(data && Array.isArray(data.problems) ? data : { date: dateISO, problems: [], groups: [], plan: [], headline: null });
    } finally {
      setLoading(false);
      setReplanning(false);
    }
  }, [apiBase, dateISO]);

  useEffect(() => {
    if (!open) return;
    setPins([]);
    setRelaxPreferred(false);
    setAccepted(null);
    setChanging(null);
    setOptions({});
    setConfirmDelete(null);
    setReassignStaff("");
    setNote(null);
    setUpcoming(null);
    load([], false);
  }, [open, load]);

  async function acceptPlan() {
    if (!check || check.plan.length === 0) return;
    setBusy("accept");
    try {
      const res = await fetch(`${apiBase}/day-check/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateISO,
          moves: check.plan.map((f) => ({
            appointment_id: f.appointment_id, staff_id: f.staff_id, room_id: f.room_id, start_time: f.start_time, date: f.date,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The day moved under the plan. Work it out again rather than arguing.
        setNote(body.message || "The day changed while this was open, so the plan has been worked out again.");
        setPins([]);
        await load([], relaxPreferred, true);
        return;
      }
      setAccepted({ text: `${body.applied} change${body.applied === 1 ? "" : "s"} made.`, batch_id: body.batch_id });
      setPins([]);
      await onRefresh([dateISO]);
      await load([], relaxPreferred, true);
    } finally {
      setBusy(null);
    }
  }

  async function undoAccepted() {
    if (!accepted?.batch_id) return;
    setBusy("accept");
    try {
      const res = await fetch(`${apiBase}/replan/undo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: accepted.batch_id }),
      });
      if (!res.ok) return;
      setAccepted({ text: "Put back as it was.", batch_id: null });
      await onRefresh([dateISO]);
      await load([], relaxPreferred, true);
    } finally {
      setBusy(null);
    }
  }

  async function openChange(problem: DayProblem) {
    if (!problem.appointment_id) return;
    const id = problem.id;
    if (changing === id) { setChanging(null); return; }
    setChanging(id);
    if (options[id]) return;
    setBusy(id);
    try {
      const params = new URLSearchParams({ date: dateISO, appointment_id: problem.appointment_id });
      if (relaxPreferred) params.set("relax_preferred_staff", "true");
      const res = await fetch(`${apiBase}/day-check/options?${params.toString()}`);
      const data = await res.json().catch(() => ({ options: [] }));
      setOptions((p) => ({ ...p, [id]: Array.isArray(data.options) ? data.options : [] }));
    } finally {
      setBusy(null);
    }
  }

  async function pick(fix: Fix) {
    const next = [
      ...pins.filter((p) => p.appointment_id !== fix.appointment_id),
      { appointment_id: fix.appointment_id, staff_id: fix.staff_id, room_id: fix.room_id, start_time: fix.start_time, date: fix.date },
    ];
    setPins(next);
    setChanging(null);
    setNote(null);
    await load(next, relaxPreferred, true);
  }

  async function useAnyone() {
    setRelaxPreferred(true);
    setOptions({});
    await load(pins, true, true);
  }

  async function removeAppointment(problem: DayProblem) {
    if (!problem.appointment_id) return;
    setBusy(problem.id);
    try {
      const res = await fetch(`${apiBase}/appointments/${problem.appointment_id}`, { method: "DELETE" });
      if (!res.ok) { setNote("That could not be deleted."); return; }
      const remaining = pins.filter((x) => x.appointment_id !== problem.appointment_id);
      setConfirmDelete(null);
      setPins(remaining);
      await onRefresh([dateISO]);
      await load(remaining, relaxPreferred, true);
    } finally {
      setBusy(null);
    }
  }

  async function reassignWholeDay(staffId: string) {
    setBusy("reassign");
    try {
      const res = await fetch(`${apiBase}/replan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, date: dateISO, apply: true }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out) { setNote("That day could not be reassigned."); return; }
      const needs = out.proposed.length + out.unplaced.length;
      setAccepted({
        text: `${out.staff_name}: ${out.moved.length} treatment${out.moved.length === 1 ? "" : "s"} given to someone else${needs > 0 ? `, ${needs} still to decide below` : ""}.`,
        batch_id: out.batch_id,
      });
      setPins([]);
      await onRefresh([dateISO]);
      await load([], relaxPreferred, true);
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

  const problems = check?.problems || [];
  const groups = check?.groups || [];
  const plan = check?.plan || [];
  const problemById = new Map(problems.map((p) => [p.id, p]));

  const row = (problem: DayProblem) => {
    const isChanging = changing === problem.id;
    const working = busy === problem.id;
    const fix = problem.fix;

    return (
      <li key={problem.id} className="border-t px-3 py-2.5 first:border-t-0">
        <div className="flex items-baseline gap-2">
          {problem.start_time ? (
            <span className="text-[13px] tabular-nums text-muted-foreground w-11 shrink-0">{problem.start_time}</span>
          ) : null}
          <span className="text-[14px] font-medium leading-snug">{problem.who}</span>
        </div>

        {fix ? (
          <div className="flex items-start gap-1.5 pl-[3.25rem] pt-1 text-[13px]">
            <ArrowRight className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted-foreground" />
            <span className={fix.pinned ? "font-medium" : undefined}>
              {fix.label}
              {fix.cost_note ? <span className="block text-muted-foreground">{fix.cost_note}</span> : null}
              {fix.pinned ? <span className="block text-muted-foreground">your choice</span> : null}
            </span>
          </div>
        ) : problem.appointment_id ? (
          <div className="pl-[3.25rem] pt-1 space-y-1">
            <p className="text-[13px] text-amber-700">{problem.no_fix_reason || "Nothing free to move it to."}</p>
            {/* The one negotiable rule, as a sentence where it matters rather
                than a switch in a panel of things that cannot be switched. */}
            {problem.blocked_by_preferred_staff && !relaxPreferred ? (
              <button type="button" className="text-[13px] underline min-h-9" onClick={useAnyone}>
                Let anyone treat them
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 pl-[3.25rem] pt-1">
          {problem.appointment_id ? (
            <>
              <button type="button" className="text-[13px] underline min-h-9" disabled={working} onClick={() => openChange(problem)}>
                {isChanging ? "Close" : "Change"}
              </button>
              <button type="button" className="text-[13px] underline min-h-9" onClick={() => onOpenAppointment(problem.appointment_id!)}>
                Open
              </button>
              {confirmDelete === problem.id ? (
                <span className="text-[13px] flex items-center gap-3 ml-auto">
                  Delete?
                  <button type="button" className="underline text-red-600 min-h-9" disabled={working} onClick={() => removeAppointment(problem)}>Yes</button>
                  <button type="button" className="underline min-h-9" onClick={() => setConfirmDelete(null)}>No</button>
                </span>
              ) : (
                <button type="button" className="text-[13px] underline text-red-600 min-h-9 ml-auto" onClick={() => setConfirmDelete(problem.id)}>
                  Delete
                </button>
              )}
            </>
          ) : (
            <button type="button" className="text-[13px] underline min-h-9" onClick={() => onAssignFor(problem.patient_id!)}>
              Book something for {problem.patient_name.split(" ")[0]}
            </button>
          )}
        </div>

        {isChanging ? (
          <div className="mt-2 ml-[3.25rem] rounded-md bg-muted/60 p-2 space-y-1.5">
            {working ? (
              <p className="text-[13px] text-muted-foreground">Looking…</p>
            ) : (options[problem.id] || []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing else is free.</p>
            ) : (
              (options[problem.id] || []).map((f, i) => (
                <Button
                  key={`${f.staff_id}-${f.start_time}-${i}`}
                  variant="outline"
                  className="w-full h-auto min-h-11 py-2 justify-start whitespace-normal text-[13px] font-normal"
                  onClick={() => pick(f)}
                >
                  {f.label}
                </Button>
              ))
            )}
          </div>
        ) : null}
      </li>
    );
  };

  const groupCard = (group: ProblemGroup) => {
    const rows = group.problem_ids.map((id) => problemById.get(id)).filter(Boolean) as DayProblem[];
    if (rows.length === 0) return null;
    return (
      <section key={group.key} className="rounded-lg border bg-card overflow-hidden">
        <header className="px-3 pt-3 pb-2 flex items-start gap-2">
          {group.problem_class === "blocking" ? <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" /> : null}
          <h3 className="text-[15px] font-semibold leading-snug">{group.label}</h3>
        </header>
        {/* One decision that settles the whole group, where there is one. */}
        {group.staff_id ? (
          <div className="px-3 pb-2">
            <Button
              variant="outline"
              className="w-full h-auto min-h-11 py-2 text-[13px]"
              disabled={busy === "reassign"}
              onClick={() => reassignWholeDay(group.staff_id!)}
            >
              {busy === "reassign" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Give this whole day to someone else
            </Button>
          </div>
        ) : null}
        <ul className="border-t">{rows.map(row)}</ul>
      </section>
    );
  };

  const blocking = groups.filter((g) => g.problem_class === "blocking");
  const worthKnowing = groups.filter((g) => g.problem_class === "worth_knowing");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-[100dvh] rounded-none p-0 gap-0 flex flex-col sm:max-w-lg sm:w-full sm:h-auto sm:max-h-[88vh] sm:rounded-lg">
        <DialogHeader className="px-4 pt-4 pb-3 space-y-0.5 text-left shrink-0">
          <DialogTitle className="text-lg">Verify</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{dateLabel(dateISO)}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Working out the day…</p>
          ) : (
            <>
              {accepted ? (
                <div className="rounded-lg border bg-card px-3 py-2.5 flex flex-wrap items-center gap-3">
                  <p className="text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />{accepted.text}</p>
                  {accepted.batch_id ? (
                    <button type="button" className="text-sm underline min-h-9" disabled={busy === "accept"} onClick={undoAccepted}>Undo</button>
                  ) : null}
                </div>
              ) : null}

              {note ? <p className="text-[13px] text-amber-700">{note}</p> : null}

              {groups.length === 0 ? (
                <p className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-700" />Nothing is wrong with this day.</p>
              ) : null}

              {blocking.map(groupCard)}

              {worthKnowing.length > 0 ? (
                <>
                  <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Worth knowing</h2>
                  {worthKnowing.map(groupCard)}
                </>
              ) : null}

              {/* A therapist who is not marked off but is not coming in either:
                  the phone call comes before the paperwork. */}
              <section className="rounded-lg border bg-card p-3 space-y-2">
                <h3 className="text-[15px] font-semibold">Give a therapist's whole day to someone else</h3>
                <Select value={reassignStaff} onValueChange={(v) => { setReassignStaff(v); reassignWholeDay(v); }}>
                  <SelectTrigger className="min-h-11 text-[14px]">
                    <SelectValue placeholder="Which therapist?" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </section>

              {/* Room and therapy edits can break a future day; absences already
                  fix themselves. So the future is offered, never scanned at you. */}
              <div>
                {upcoming === null ? (
                  <button type="button" className="text-[13px] underline min-h-11" disabled={upcomingLoading} onClick={loadUpcoming}>
                    {upcomingLoading ? "Checking…" : "Check the next 30 days?"}
                  </button>
                ) : upcoming.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">The next 30 days are clear.</p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-[13px]">{upcoming.length} day{upcoming.length === 1 ? "" : "s"} in the next 30 have something to fix:</p>
                    {upcoming.map((d) => (
                      <button key={d.date} type="button" className="block w-full text-left text-[13px] underline min-h-11"
                        onClick={() => { onJumpToDate(d.date); onOpenChange(false); }}>
                        {dateLabel(d.date)} — {d.count} thing{d.count === 1 ? "" : "s"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* One decision, always in reach of a thumb. */}
        <div className="shrink-0 border-t bg-background px-4 py-3 space-y-2">
          {plan.length > 0 ? (
            <Button className="w-full h-auto min-h-12 py-2.5 text-[15px]" disabled={busy === "accept" || replanning} onClick={acceptPlan}>
              {busy === "accept" || replanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {replanning ? "Working out the day…" : `Accept the plan — ${plan.length} change${plan.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
          <Button variant="ghost" className="w-full min-h-11 text-[14px]" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
