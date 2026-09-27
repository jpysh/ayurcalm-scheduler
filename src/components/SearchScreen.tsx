/**
 * Search, as a phone's calendar does it (#165, docs/design/phone.html): every
 * treatment past and future, grouped by day, Upcoming / Past / All, the words
 * that matched marked. Empty, it offers something to start from: recent
 * searches, the residents on the day, the therapists.
 */
import { useEffect, useState, type ReactNode } from "react";
import { DoorClosed } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";
import type { CardAppt } from "@/components/TreatmentCard";

export type Hit = CardAppt & { date: string; patient_name: string; therapy_name: string; room_name: string | null; staff_names: string[] };
type Scope = "upcoming" | "past" | "all";

const DAY_MS = 86400000;
// ponytail: a fixed window either side of today; widen it, or page, if a centre searches further back.
const WINDOW_DAYS = 120;
const RECENT_KEY = "recentSearches";
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const remember = (q: string) => {
  const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private window */ }
};

/** The text with every case-insensitive match of q marked, as React nodes: no HTML is built from what was typed. */
function marked(text: string, q: string): ReactNode {
  if (!q) return text;
  const out: ReactNode[] = [];
  const lower = text.toLowerCase(), ql = q.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(ql); i !== -1; i = lower.indexOf(ql, at)) {
    out.push(text.slice(at, i), <mark key={i} className="rounded-sm bg-[#F6E3A8] px-px text-inherit">{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  out.push(text.slice(at));
  return out;
}

export function SearchScreen({ query, setQuery, today, nowMinutes, residents, therapists, onOpen }: {
  query: string;
  setQuery: (q: string) => void;
  /** YYYY-MM-DD and minutes past midnight, on the centre's clock. */
  today: string;
  nowMinutes: number;
  residents: string[];
  therapists: string[];
  onOpen: (hit: Hit) => void;
}) {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) { setHits(null); return; }
    // Typed, not submitted: wait for a pause so each letter is not a request.
    const t = setTimeout(() => {
      fetch(`${API_BASE}/appointments/search?q=${encodeURIComponent(q)}&from=${shift(today, -WINDOW_DAYS)}&to=${shift(today, WINDOW_DAYS)}`)
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => setHits(Array.isArray(d.hits) ? d.hits : []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, today]);

  const chipb = (on = false) => `min-h-9 px-3 rounded-full border-[1.5px] text-sm ${on ? "border-primary bg-secondary font-semibold" : "border-border bg-card"}`;
  const label = "mx-1 mb-1.5 mt-3.5 text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground";

  if (!q) {
    const chips = (title: string, list: string[]) => list.length ? (
      <>
        <div className={label}>{title}</div>
        <div className="flex flex-wrap gap-1.5">{list.map((x) => <button key={x} type="button" className={chipb()} onClick={() => setQuery(x)}>{x}</button>)}</div>
      </>
    ) : null;
    return <div>{chips("Recent", readRecent())}{chips("Residents", residents.slice(0, 6))}{chips("Therapists", therapists)}</div>;
  }

  const isPast = (h: Hit) => h.date < today || (h.date === today && toM(h.start_time) + h.duration_minutes <= nowMinutes);
  const all = hits || [];
  let shown = all.filter((h) => scope === "all" || (scope === "past") === isPast(h));
  if (scope === "past") shown = [...shown].reverse();
  shown = shown.slice(0, 50);
  const days: [string, Hit[]][] = [];
  for (const h of shown) {
    if (days.length && days[days.length - 1][0] === h.date) days[days.length - 1][1].push(h);
    else days.push([h.date, [h]]);
  }
  const heading = (iso: string) => iso === today ? "Today" : iso === shift(today, 1) ? "Tomorrow" : iso === shift(today, -1) ? "Yesterday" : fmt(iso);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 pt-3">
        {([["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]] as const).map(([k, v]) => (
          <button key={k} type="button" className={chipb(scope === k)} aria-pressed={scope === k} onClick={() => setScope(k)}>{v}</button>
        ))}
      </div>
      {hits === null ? <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
        : shown.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No {scope === "all" ? "" : `${scope} `}treatments match “{q}”.{all.length ? " Try All." : ""}
          </div>
        ) : days.map(([iso, list]) => (
          <section key={iso}>
            <div className="sticky top-0 z-10 flex justify-between bg-background px-1 pb-1.5 pt-3 text-[13px] font-bold">
              {heading(iso)}<span className="font-normal text-muted-foreground">{heading(iso) !== fmt(iso) ? fmt(iso) : ""}</span>
            </div>
            <div className="overflow-hidden rounded-2xl bg-card">
              {list.map((h) => {
                const p = isPast(h);
                const others = h.staff_names.filter(Boolean);
                return (
                  <button key={h.id} type="button" onClick={() => { remember(q); onOpen(h); }}
                    className="flex w-full gap-2.5 min-h-[54px] py-2 px-3 border-b border-border last:border-b-0 text-left">
                    <span className={`w-12 flex-none tabular-nums text-[15px] leading-tight ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
                      {h.start_time}<small className="block text-xs font-normal text-muted-foreground">{hm(toM(h.start_time) + h.duration_minutes)}</small>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start gap-2">
                        <span className={`text-[16px] ${p ? "text-muted-foreground font-medium" : "font-semibold"}`}>
                          {h.status === "no_show" ? <s>{marked(h.patient_name, q)}</s> : marked(h.patient_name, q)}
                        </span>
                        <span className="ml-auto pt-0.5 text-xs text-muted-foreground whitespace-nowrap inline-flex items-center gap-1"><DoorClosed className="h-3 w-3" aria-hidden />{marked(h.room_name || "No room", q)}</span>
                      </span>
                      <span className="block text-[13px] text-muted-foreground">
                        {marked(h.therapy_name, q)} · {others.length ? <>with {others.map((n, i) => <span key={i}>{i ? " & " : ""}{marked(n, q)}</span>)}</> : "no therapist"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
