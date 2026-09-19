/**
 * Verify — what changed today, what is wrong with the day, and the one plan
 * that fixes it.
 *
 * The admin's problems arrive as events, not as data: a therapist rings in
 * late, a resident does not turn up, a room's heater fails. So the sheet opens
 * on those three, each a short form that records it and hands the fallout to
 * the same planner as everything else.
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, DoorClosed, Loader2, MoreHorizontal, UserMinus, UserX } from "lucide-react";

export type Fix = {
  label: string;
  tier: 1 | 2 | 3;
  cost_note: string | null;
  pinned: boolean;
  appointment_id: string;
  staff_id: string | null;
  co_staff_ids?: string[];
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
type Pin = { appointment_id: string; staff_id: string | null; co_staff_ids: string[]; room_id: string | null; start_time: string; date: string };
type UpcomingDay = { date: string; count: number; headline: string | null };

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export type DayTreatment = { id: string; start_time: string; status: string; notes: string | null; label: string };

type Report = "staff" | "noshow" | "room";
/** What was just done, and how to take it back. */
type Done = { text: string; undo: (() => Promise<boolean>) | null };

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes() - (d.getMinutes() % 5)).padStart(2, "0")}`;

export function VerifyDialog({
  open, onOpenChange, apiBase, currentDate, staff, rooms, treatments, openingTime, closingTime,
  onOpenAppointment, onAssignFor, onJumpToDate, onRefresh,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiBase: string;
  /** The day the schedule is on. Verify checks that day and asks no date question. */
  currentDate: Date;
  staff: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  /** The day's treatments, for picking the one a resident missed. */
  treatments: DayTreatment[];
  openingTime: string;
  closingTime: string;
  onOpenAppointment: (appointmentId: string) => void;
  /** Booking a resident's day is the Assign dialog's job, with them filled in. */
  onAssignFor: (patientId: string) => void;
  onJumpToDate: (dateISO: string) => void;
  onRefresh: (datesISO: string[]) => Promise<void>;
}) {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateISO = iso(currentDate);
  const isToday = dateISO === iso(new Date());

  const [loading, setLoading] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [check, setCheck] = useState<DayCheck | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [relaxPreferred, setRelaxPreferred] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, Fix[]>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDay[] | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [form, setForm] = useState({ who: "", from: "", until: "", reason: "" });

  // No Scan button: Verify is opened because something is wrong, and the plan is
  // worked out before the admin has finished reading the first line.
  const load = useCallback(async (nextPins: Pin[], relax: boolean, quiet = false): Promise<DayCheck | null> => {
    if (quiet) setReplanning(true); else setLoading(true);
    try {
      const res = await fetch(`${apiBase}/day-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateISO, pins: nextPins, relax_preferred_staff: relax }),
      });
      const data = await res.json().catch(() => null);
      const next: DayCheck = data && Array.isArray(data.problems) ? data : { date: dateISO, problems: [], groups: [], plan: [], headline: null };
      setCheck(next);
      return next;
    } catch {
      return null;
    } finally {
      setLoading(false);
      setReplanning(false);
    }
  }, [apiBase, dateISO]);

  useEffect(() => {
    if (!open) return;
    setPins([]);
    setRelaxPreferred(false);
    setDone(null);
    setChanging(null);
    setOptions({});
    setConfirmDelete(null);
    setNote(null);
    setUpcoming(null);
    setShowNotes(false);
    setReport(null);
    load([], false);
  }, [open, load]);

  const refresh = async () => {
    setPins([]);
    await onRefresh([dateISO]);
    return load([], relaxPreferred, true);
  };

  function startReport(kind: Report) {
    if (report === kind) { setReport(null); return; }
    setReport(kind);
    setNote(null);
    // From now if it is today, else the whole day; until closing either way.
    const now = hhmm(new Date());
    setForm({ who: "", from: isToday && now > openingTime ? now : openingTime, until: closingTime, reason: "" });
  }

  /** A therapist or a room out for some hours is time off with those hours. */
  async function reportOff(kind: "staff" | "room") {
    const whole = form.from <= openingTime && form.until >= closingTime;
    const name = (kind === "staff" ? staff : rooms).find((x) => x.id === form.who)?.name || "";
    setBusy("report");
    try {
      const res = await fetch(`${apiBase}/timeoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: kind, entity_id: form.who, date: dateISO,
          start_time: whole ? null : form.from, end_time: whole ? null : form.until,
          description: form.reason.trim() || (kind === "staff" ? "Not in" : "Out of use"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setNote(body.error || "That could not be saved."); return; }
      const hours = whole ? "all day" : `${form.from}–${form.until}`;
      const undo = async () => (await fetch(`${apiBase}/timeoff/${body.id}`, { method: "DELETE" })).ok;
      setReport(null);
      const after = await refresh();
      // Say what it touched: a room with nothing booked in those hours is
      // worth knowing too, or the admin goes looking for a change that is not there.
      const reason = kind === "staff" ? "STAFF_OFF" : "ROOM_OFF";
      const left = (after?.problems || []).filter((p) => p.kind === reason && p.what.startsWith(name)).length;
      // A therapist's absence moves their treatments straight away (the Time
      // off tab does the same); a room's show below as a plan to accept.
      const moved = kind === "staff" ? (body.replan || []).reduce((n: number, r: { moved: unknown[] }) => n + r.moved.length, 0) : 0;
      const parts = [moved ? `${moved} moved` : "", left ? `${left} to fix below` : ""].filter(Boolean);
      setDone({
        text: `${name} ${kind === "staff" ? "not in" : "out of use"} ${hours} — ${parts.length ? parts.join(", ") : "nothing booked then"}.`,
        undo,
      });
    } finally {
      setBusy(null);
    }
  }

  async function reportNoShow() {
    const t = treatments.find((x) => x.id === form.who);
    if (!t) return;
    setBusy("report");
    try {
      const put = (status: string, notes: string) => fetch(`${apiBase}/appointments/${t.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes }),
      });
      const res = await put("cancelled", t.notes ? `No-show. ${t.notes}` : "No-show");
      if (!res.ok) { setNote("That could not be saved."); return; }
      setDone({
        text: `${t.label.split(" — ")[0]} marked as no-show; the therapist and room are free.`,
        undo: async () => (await put(t.status, t.notes || "")).ok,
      });
      setReport(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

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
            appointment_id: f.appointment_id, staff_id: f.staff_id, co_staff_ids: f.co_staff_ids || [], room_id: f.room_id, start_time: f.start_time, date: f.date,
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
      const batch = body.batch_id as string | null;
      setDone({
        text: `${body.applied} change${body.applied === 1 ? "" : "s"} made.`,
        undo: batch ? async () => (await fetch(`${apiBase}/replan/undo`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: batch }),
        })).ok : null,
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function undoDone() {
    if (!done?.undo) return;
    setBusy("undo");
    try {
      if (!(await done.undo())) { setNote("That could not be undone."); return; }
      setDone({ text: "Put back as it was.", undo: null });
      await refresh();
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
      { appointment_id: fix.appointment_id, staff_id: fix.staff_id, co_staff_ids: fix.co_staff_ids || [], room_id: fix.room_id, start_time: fix.start_time, date: fix.date },
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
  const blocking = groups.filter((g) => g.problem_class === "blocking");
  const worthKnowing = groups.filter((g) => g.problem_class === "worth_knowing");
  const toFix = problems.filter((p) => p.problem_class === "blocking").length;
  const notes = problems.length - toFix;

  // A resident can only miss what has not happened yet. On today that is
  // anything that started in the last two hours or later; another day, all of it.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const missable = treatments
    .filter((t) => t.status !== "cancelled" && t.status !== "completed")
    .filter((t) => !isToday || Number(t.start_time.slice(0, 2)) * 60 + Number(t.start_time.slice(3, 5)) >= nowMin - 120)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const row = (problem: DayProblem) => {
    const isChanging = changing === problem.id;
    const working = busy === problem.id;
    const fix = problem.fix;

    // A note about a resident is one line and one action.
    if (!problem.appointment_id) {
      return (
        <li key={problem.id} className="flex items-center gap-2 px-3 py-1">
          <span className="flex-1 text-[14px]">{problem.patient_name}</span>
          <Button variant="ghost" size="sm" className="h-9 text-[13px]" onClick={() => onAssignFor(problem.patient_id!)}>Book</Button>
        </li>
      );
    }

    return (
      <li key={problem.id} className="px-3 py-3 space-y-1.5">
        <div className="flex items-baseline gap-3">
          <span className="w-11 shrink-0 text-[13px] tabular-nums text-muted-foreground">{problem.start_time}</span>
          <span className="text-[14px] font-medium leading-snug">{problem.who}</span>
        </div>

        <div className="pl-14 space-y-1.5">
          {fix ? (
            <p className="flex items-start gap-1.5 text-[13px]">
              <ArrowRight className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <span className={fix.pinned ? "font-medium" : undefined}>
                {fix.label}
                {fix.cost_note ? <span className="block text-muted-foreground">{fix.cost_note}</span> : null}
                {fix.pinned ? <span className="block text-muted-foreground">your choice</span> : null}
              </span>
            </p>
          ) : (
            <div className="text-[13px] text-amber-800">
              <p>{problem.no_fix_reason || "Nothing free to move it to."}</p>
              {/* The one negotiable rule, as a sentence where it matters rather
                  than a switch in a panel of things that cannot be switched. */}
              {problem.blocked_by_preferred_staff && !relaxPreferred ? (
                <button type="button" className="min-h-9 font-medium underline" onClick={useAnyone}>Let anyone treat them</button>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 text-[13px]" disabled={working} onClick={() => openChange(problem)}>
              {isChanging ? "Close" : "Change"}
            </Button>
            {confirmDelete === problem.id ? (
              <span className="ml-auto flex items-center gap-3 text-[13px]">
                Delete it?
                <button type="button" className="min-h-9 text-red-600 underline" disabled={working} onClick={() => removeAppointment(problem)}>Yes</button>
                <button type="button" className="min-h-9 underline" onClick={() => setConfirmDelete(null)}>No</button>
              </span>
            ) : (
              /* Delete sits behind a menu: next to every row it was the loudest
                 thing on the sheet, one stray thumb from a mistake. */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More" className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onOpenAppointment(problem.appointment_id!)}>Open</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onSelect={() => setConfirmDelete(problem.id)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {isChanging ? (
            <div className="space-y-1.5 rounded-md bg-muted/60 p-2">
              {working ? (
                <p className="text-[13px] text-muted-foreground">Looking…</p>
              ) : (options[problem.id] || []).length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Nothing else is free.</p>
              ) : (
                (options[problem.id] || []).map((f, i) => (
                  <Button key={`${f.staff_id}-${f.start_time}-${i}`} variant="outline"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-[13px] font-normal" onClick={() => pick(f)}>
                    {f.label}
                  </Button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  const groupCard = (group: ProblemGroup) => {
    const rows = group.problem_ids.map((id) => problemById.get(id)).filter(Boolean) as DayProblem[];
    if (rows.length === 0) return null;
    return (
      <section key={group.key} className="overflow-hidden rounded-xl border border-amber-300 bg-card">
        <h3 className="flex items-start gap-2 bg-amber-50 px-3 py-2.5 text-[15px] font-semibold leading-snug dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{group.label}
        </h3>
        <ul className="divide-y">{rows.map(row)}</ul>
      </section>
    );
  };

  const tiles: { kind: Report; label: string; Icon: typeof UserX }[] = [
    { kind: "staff", label: "Therapist not in", Icon: UserX },
    { kind: "noshow", label: "Resident didn't come", Icon: UserMinus },
    { kind: "room", label: "Room out of use", Icon: DoorClosed },
  ];

  const hours = (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-[13px]">From
        <Input type="time" className="min-h-11 min-w-0 px-2 text-[14px]" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
      </label>
      <label className="space-y-1 text-[13px]">Until
        <Input type="time" className="min-h-11 min-w-0 px-2 text-[14px]" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
      </label>
    </div>
  );

  const reportForm = report === null ? null : (
    <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
      {report === "noshow" ? (
        missable.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No treatment left {isToday ? "today" : "on this day"} to miss.</p>
        ) : (
          <Select value={form.who} onValueChange={(v) => setForm({ ...form, who: v })}>
            <SelectTrigger className="min-h-11 text-[14px]"><SelectValue placeholder="Which treatment?" /></SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {missable.map((t) => <SelectItem key={t.id} value={t.id} className="whitespace-normal">{t.start_time} · {t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )
      ) : (
        <>
          <Select value={form.who} onValueChange={(v) => setForm({ ...form, who: v })}>
            <SelectTrigger className="min-h-11 text-[14px]"><SelectValue placeholder={report === "staff" ? "Which therapist?" : "Which room?"} /></SelectTrigger>
            <SelectContent>
              {(report === "staff" ? staff : rooms).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hours}
          <Input className="min-h-11 text-[14px]" placeholder={report === "staff" ? "Why? e.g. late, unwell" : "Why? e.g. heater broken"}
            value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </>
      )}
      <Button className="min-h-11 w-full" disabled={!form.who || busy === "report" || (report !== "noshow" && form.from >= form.until)}
        onClick={() => (report === "noshow" ? reportNoShow() : reportOff(report))}>
        {busy === "report" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {report === "staff" ? "Move their treatments" : report === "room" ? "Find other rooms" : "Mark as no-show"}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[88vh] sm:w-full sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-0.5 border-b px-4 pb-3 pt-4 text-left">
          <DialogTitle className="text-lg">Verify</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{dateLabel(dateISO)}</p>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* What happened, first: it is why the admin opened this. */}
          <section className="space-y-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Something changed?</h2>
            <div className="grid grid-cols-3 gap-2">
              {tiles.map(({ kind, label, Icon }) => (
                <button key={kind} type="button" onClick={() => startReport(kind)} aria-pressed={report === kind}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center text-[13px] leading-tight transition-colors ${report === kind ? "border-primary bg-primary/10 font-medium" : "bg-card hover:bg-muted"}`}>
                  <Icon className="h-5 w-5" />{label}
                </button>
              ))}
            </div>
            {reportForm}
          </section>

          {note ? <p className="text-[13px] text-amber-800">{note}</p> : null}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Working out the day…</p>
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  To fix{toFix ? ` · ${toFix}` : ""}
                </h2>
                {blocking.length === 0 ? (
                  <p className="flex items-center gap-2 text-[14px]"><CheckCircle2 className="h-4 w-4 text-emerald-700" />Nothing to fix {isToday ? "today" : "on this day"}.</p>
                ) : blocking.map(groupCard)}
              </section>

              {/* Notes are often by design (a rest day), so they wait to be asked for. */}
              {notes > 0 ? (
                <section className="rounded-xl border">
                  <button type="button" aria-expanded={showNotes} onClick={() => setShowNotes(!showNotes)}
                    className="flex min-h-11 w-full items-center justify-between px-3 text-[14px] text-muted-foreground">
                    <span>Notes · {notes}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showNotes ? "rotate-180" : ""}`} />
                  </button>
                  {showNotes ? worthKnowing.map((g) => {
                    const rows = g.problem_ids.map((id) => problemById.get(id)).filter(Boolean) as DayProblem[];
                    return (
                      <div key={g.key} className="border-t py-1">
                        <p className="px-3 pt-1.5 text-[13px] font-medium">{g.label}</p>
                        <ul>{rows.map(row)}</ul>
                      </div>
                    );
                  }) : null}
                </section>
              ) : null}

              {/* Room and therapy edits can break a future day; absences already
                  fix themselves. So the future is offered, never scanned at you. */}
              <div>
                {upcoming === null ? (
                  <button type="button" className="min-h-11 text-[13px] underline" disabled={upcomingLoading} onClick={loadUpcoming}>
                    {upcomingLoading ? "Checking…" : "Check the next 30 days"}
                  </button>
                ) : upcoming.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">The next 30 days are clear.</p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-[13px]">{upcoming.length} day{upcoming.length === 1 ? "" : "s"} in the next 30 have something to fix:</p>
                    {upcoming.map((d) => (
                      <button key={d.date} type="button" className="block min-h-11 w-full text-left text-[13px] underline"
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
        <div className="shrink-0 space-y-2 border-t bg-background px-4 py-3">
          {done ? (
            <div className="flex items-start gap-2 text-[14px]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <p className="flex-1 leading-snug">{done.text}</p>
              {done.undo ? <button type="button" className="-my-2 min-h-9 shrink-0 font-medium underline" disabled={busy === "undo"} onClick={undoDone}>Undo</button> : null}
            </div>
          ) : null}
          {plan.length > 0 ? (
            <Button className="h-auto min-h-12 w-full py-2.5 text-[15px]" disabled={busy === "accept" || replanning} onClick={acceptPlan}>
              {busy === "accept" || replanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {replanning ? "Working out the day…" : `Accept the plan — ${plan.length} change${plan.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
          <Button variant="ghost" className="min-h-11 w-full text-[14px]" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
