/**
 * Team and rooms (#137, docs/design/phone.html): who is working today and
 * which rooms there are, and the one thing each is asked most: a therapist not
 * in, in late or leaving early; a room out of use. Each is time off from now,
 * the same as the day's headings, so the server moves what it touches at once,
 * and Undo removes it.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomBar";
import { API_BASE } from "@/lib/apiBase";
import PageHead from "@/components/PageHead";
import { shareLink } from "@/lib/shareLink";

type Named = { id: string | number; name: string; is_active?: boolean; status?: string };
type Pick = { kind: "staff" | "room"; id: string; name: string } | null;
type Late = "late" | "early" | "away" | null;

export function TeamRooms({ staff, rooms, today, nowHM, opening, closing, refresh, edit }: {
  staff: Named[];
  rooms: Named[];
  /** YYYY-MM-DD and "14:35", on the centre's clock. */
  today: string;
  nowHM: string;
  opening: string;
  closing: string;
  refresh: () => Promise<void>;
  /** The full editors, for adding and changing therapists, rooms, therapies and events. */
  edit: (screen: "staff" | "rooms" | "therapies" | "events") => void;
}) {
  const [offToday, setOffToday] = useState<Record<string, string | null>>({});
  const [week, setWeek] = useState<Week | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const [pick, setPick] = useState<Pick>(null);
  const [late, setLate] = useState<Late>(null);
  const [at, setAt] = useState("");
  const [until, setUntil] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: { staff_id: string; off: string | null }[]) => setOffToday(Object.fromEntries(rows.map((x) => [x.staff_id, x.off]))))
      .catch(() => setOffToday({}));
  }, [today]);
  useEffect(() => { load(); }, [load]);
  // The week this day is in, from Monday: how full the team is, not what they do.
  useEffect(() => {
    const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    fetch(`${API_BASE}/staff-week?start=${monday}`).then((r) => (r.ok ? r.json() : null)).then(setWeek).catch(() => setWeek(null));
  }, [today]);

  const active = (x: Named) => x.is_active !== false && x.status !== "Inactive";
  const team = staff.filter(active).sort((a, b) => a.name.localeCompare(b.name));
  const notIn = team.filter((s) => offToday[String(s.id)]);

  /** Time off between from and until; null means the edge of the day. Days default to today. */
  async function takeOut(kind: "staff" | "room", id: string, name: string, from: string | null, until: string | null, what: string, days = { start: today, end: today }) {
    setPick(null);
    setLate(null);
    const res = await fetch(`${API_BASE}/timeoff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: kind, entity_id: id, date: days.start, start_date: days.start, end_date: days.end, start_time: from, end_time: from || until ? until || closing : null, description: what }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "That could not be saved."); return; }
    const moved = (body.replan || []).reduce((n: number, r: { moved: unknown[] }) => n + r.moved.length, 0);
    await refresh();
    load();
    toast(`${name}: ${what.toLowerCase()}${moved ? ` · ${moved} moved` : ""}`, {
      duration: 8000,
      action: { label: "Undo", onClick: async () => { await fetch(`${API_BASE}/timeoff/${body.id}`, { method: "DELETE" }); await refresh(); load(); } },
    });
  }

  const row = (key: string, name: string, sub: React.ReactNode, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} className="flex w-full min-h-[54px] flex-col justify-center border-b border-border px-3 py-2 text-left last:border-b-0">
      <span className="text-[16px] font-semibold">{name}</span>
      {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
    </button>
  );
  const label = "mx-1 mb-1.5 mt-3.5 text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground";
  const btn = "min-h-11 w-full rounded-full px-4 font-semibold";

  return (
    <div>
      <PageHead title="Team and rooms" note={`${team.length - notIn.length} in${notIn.length ? ` · ${notIn.length} not in` : ""}`} />
      {/* Always there, so the list does not move under a tap when the week arrives. */}
      <div className="mb-3 overflow-hidden rounded-2xl bg-card">
        {row("week", "This week", week ? weekLine(week) : "…", () => week && setShowWeek(true))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card">
        {team.map((s) => row(String(s.id), s.name,
          offToday[String(s.id)] ? <span className="text-destructive">Not in today</span> : "Working today",
          () => setPick({ kind: "staff", id: String(s.id), name: s.name })))}
      </div>
      <div className={label}>Rooms</div>
      <div className="overflow-hidden rounded-2xl bg-card">
        {rooms.filter(active).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((r) => row(String(r.id), r.name, null, () => setPick({ kind: "room", id: String(r.id), name: r.name })))}
      </div>
      <div className={label}>Change the lists</div>
      <div className="overflow-hidden rounded-2xl bg-card">
        {([["staff", "Therapists"], ["rooms", "Rooms"], ["therapies", "Therapies"], ["events", "Classes and events"]] as const)
          .map(([k, t]) => row(k, t, null, () => edit(k)))}
      </div>

      <BottomSheet open={showWeek} onOpenChange={setShowWeek} title="This week">
        {week ? <WeekList week={week} /> : null}
      </BottomSheet>

      <BottomSheet open={!!pick} onOpenChange={(o) => { if (!o) { setPick(null); setLate(null); } }} title={pick?.name || ""}>
        {pick?.kind === "room" ? (
          <button type="button" className={`${btn} border-[1.5px] border-destructive text-destructive`}
            onClick={() => takeOut("room", pick.id, pick.name, nowHM > opening ? nowHM : null, null, "Out of use from now")}>Out of use from now</button>
        ) : pick && late === null ? (
          <div className="grid gap-2">
            <button type="button" className={`${btn} border-[1.5px] border-destructive text-destructive`}
              onClick={() => takeOut("staff", pick.id, pick.name, nowHM > opening ? nowHM : null, null, "Not in from now")}>Not in from now</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`${btn} border-[1.5px] border-border bg-card`} onClick={() => { setLate("late"); setAt(nowHM > opening ? nowHM : opening); }}>In late</button>
              <button type="button" className={`${btn} border-[1.5px] border-border bg-card`} onClick={() => { setLate("early"); setAt(closing); }}>Leaving early</button>
            </div>
            <button type="button" className={`${btn} border-[1.5px] border-border bg-card`} onClick={() => { const t = nextDay(today); setLate("away"); setAt(t); setUntil(t); }}>Away another day</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`${btn} border-[1.5px] border-border bg-card`} onClick={() => shareLink("staff", pick.id, pick.name)}>Share their link</button>
              <button type="button" className={`${btn} text-muted-foreground`} onClick={() => shareLink("staff", pick.id, pick.name, true)}>New link</button>
            </div>
          </div>
        ) : pick && late === "away" ? (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[13px] text-muted-foreground">From
                <input type="date" className="min-h-11 rounded-xl border-[1.5px] border-border bg-card px-3 text-base text-foreground" min={today} value={at} onChange={(e) => { setAt(e.target.value); if (until < e.target.value) setUntil(e.target.value); }} />
              </label>
              <label className="grid gap-1 text-[13px] text-muted-foreground">To
                <input type="date" className="min-h-11 rounded-xl border-[1.5px] border-border bg-card px-3 text-base text-foreground" min={at} value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            </div>
            <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={!at || !until || until < at}
              onClick={() => takeOut("staff", pick.id, pick.name, null, null, "Leave", { start: at, end: until })}>
              Mark leave, move what they miss
            </button>
          </div>
        ) : pick ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-[13px] text-muted-foreground">{late === "late" ? "In at" : "Leaving at"}
              <input type="time" className="min-h-11 rounded-xl border-[1.5px] border-border bg-card px-3 text-base text-foreground" value={at} onChange={(e) => setAt(e.target.value)} />
            </label>
            <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={!at}
              onClick={() => (late === "late"
                ? takeOut("staff", pick.id, pick.name, opening, at, `In late, at ${at}`)
                : takeOut("staff", pick.id, pick.name, at, closing, `Leaving early, at ${at}`))}>
              Move what they miss
            </button>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}

/** The day after a YYYY-MM-DD, as one. */
const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86400000).toISOString().slice(0, 10);

type Week = { start: string; days: string[]; rows: { id: string; name: string; role: string; week: ("in" | "part" | "away" | "off")[]; booked: number; capacity: number }[] };
const hrs = (m: number) => `${Math.round(m / 60)}h`;
const weekLine = (w: Week) => {
  const booked = w.rows.reduce((n, r) => n + r.booked, 0), cap = w.rows.reduce((n, r) => n + r.capacity, 0);
  const away = w.rows.filter((r) => r.week.includes("away")).length;
  return `${hrs(booked)} booked of ${hrs(cap)}${cap ? ` (${Math.round((100 * booked) / cap)}%)` : ""}${away ? ` · ${away} away some days` : ""}`;
};

/** One line a person: their seven days and how full their week is. */
function WeekList({ week }: { week: Week }) {
  const letter = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });
  const look = { in: "bg-primary/15 text-foreground", part: "bg-amber-200 text-amber-900", away: "bg-destructive/15 text-destructive line-through", off: "text-muted-foreground/60" };
  return (
    <div className="-mt-1 max-h-[70dvh] overflow-y-auto">
      <p className="mb-2 text-[13px] text-muted-foreground">Week of {new Date(`${week.start}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}. Shaded: in. Amber: part of the day. Red: away.</p>
      <div className="overflow-hidden rounded-xl border">
        {week.rows.map((r) => (
          <div key={r.id} className="flex min-h-[54px] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
            <span className="flex gap-0.5" aria-label={r.week.map((s, i) => `${letter(week.days[i])} ${s}`).join(", ")}>
              {r.week.map((s, i) => <span key={i} className={`grid h-6 w-5 place-items-center rounded text-[11px] font-semibold ${look[s]}`}>{letter(week.days[i])}</span>)}
            </span>
            <span className="w-16 text-right text-[13px] tabular-nums text-muted-foreground">{hrs(r.booked)}/{hrs(r.capacity)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
