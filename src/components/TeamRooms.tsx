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

type Named = { id: string | number; name: string; is_active?: boolean; status?: string };
type Pick = { kind: "staff" | "room"; id: string; name: string } | null;
type Late = "late" | "early" | null;

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
  const [pick, setPick] = useState<Pick>(null);
  const [late, setLate] = useState<Late>(null);
  const [at, setAt] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/staff-day?date=${today}`).then((r) => (r.ok ? r.json() : []))
      .then((rows: { staff_id: string; off: string | null }[]) => setOffToday(Object.fromEntries(rows.map((x) => [x.staff_id, x.off]))))
      .catch(() => setOffToday({}));
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const active = (x: Named) => x.is_active !== false && x.status !== "Inactive";
  const team = staff.filter(active).sort((a, b) => a.name.localeCompare(b.name));
  const notIn = team.filter((s) => offToday[String(s.id)]);

  /** Time off today between from and until; null means the edge of the day. */
  async function takeOut(kind: "staff" | "room", id: string, name: string, from: string | null, until: string | null, what: string) {
    setPick(null);
    setLate(null);
    const res = await fetch(`${API_BASE}/timeoff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: kind, entity_id: id, date: today, start_time: from, end_time: from || until ? until || closing : null, description: what }),
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
      <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
        <h1 className="text-[22px] font-semibold">Team and rooms</h1>
        <span className="text-[13px] text-muted-foreground">{team.length - notIn.length} in{notIn.length ? ` · ${notIn.length} not in` : ""}</span>
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
