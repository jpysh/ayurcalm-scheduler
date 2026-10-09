/**
 * Search, as a phone's calendar does it (#165, docs/design/phone.html): every
 * treatment past and future, grouped by day, Upcoming / Past / All, the words
 * that matched marked. Empty, it offers something to start from: recent
 * searches, the residents on the day, the therapists.
 */
import { useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "@/lib/apiBase";
import type { CardAppt } from "@/components/TreatmentCard";
import { Empty, ListGroup, Loading, Row, SectionHead, dayText, Seg, chip, say } from "@/components/kit";

export type Hit = CardAppt & { date: string; patient_name: string; therapy_name: string; room_name: string | null; staff_names: string[] };
type Scope = "upcoming" | "past" | "all";
type PatientHit = { id: string; name: string; when: "in" | "arriving" | "past" | "none"; start: string | null; end: string | null; room: string | null; diet: string | null };

const DAY_MS = 86400000;
// ponytail: a fixed window either side of today; widen it, or page, if a centre searches further back.
const WINDOW_DAYS = 120;
const RECENT_KEY = "recentSearches";
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmt = (iso: string) => dayText(iso);

const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const remember = (q: string) => {
  const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private window */ }
};

/** The text with every case-insensitive match of q marked, as React nodes: no HTML is built from what was typed. */
export function marked(text: string, q: string): ReactNode {
  if (!q) return text;
  const out: ReactNode[] = [];
  const lower = text.toLowerCase(), ql = q.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(ql); i !== -1; i = lower.indexOf(ql, at)) {
    out.push(text.slice(at, i), <mark key={i} className="rounded-sm bg-notice-bg px-px font-semibold text-notice">{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  out.push(text.slice(at));
  return out;
}

export function SearchScreen({ query, setQuery, today, nowMinutes, residents, therapists, onOpen, onOpenPatient, onOpenOut }: {
  query: string;
  setQuery: (q: string) => void;
  /** YYYY-MM-DD and minutes past midnight, on the centre's clock. */
  today: string;
  nowMinutes: number;
  residents: string[];
  therapists: string[];
  onOpen: (hit: Hit) => void;
  /** Opens the patient's card, past guests included (#412). */
  onOpenPatient?: (id: string) => void;
  /** A thing not available (#695): opens its entry on Availability. */
  onOpenOut?: (timeOffId: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [people, setPeople] = useState<PatientHit[]>([]);
  const [out, setOut] = useState<{ id: string; name: string; kind: string; when: string }[]>([]);
  const q = query.trim();

  useEffect(() => {
    if (!q) { setHits(null); setPeople([]); setOut([]); return; }
    // Typed, not submitted: wait for a pause so each letter is not a request.
    const t = setTimeout(() => {
      fetch(`${API_BASE}/appointments/search?q=${encodeURIComponent(q)}&from=${shift(today, -WINDOW_DAYS)}&to=${shift(today, WINDOW_DAYS)}`)
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => { setHits(Array.isArray(d.hits) ? d.hits : []); setPeople(Array.isArray(d.patients) ? d.patients : []); setOut(Array.isArray(d.out) ? d.out : []); })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, today]);

  if (!q) {
    const chips = (title: string, list: string[]) => list.length ? (
      <>
        <SectionHead>{title}</SectionHead>
        <div className="flex flex-wrap gap-1.5">{list.map((x) => <button key={x} type="button" className={chip} onClick={() => setQuery(x)}>{x}</button>)}</div>
      </>
    ) : null;
    return <div>{chips("Recent", readRecent())}{chips("Patients", residents.slice(0, 6))}{chips("Therapists", therapists)}</div>;
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

  const stayLine = (p: PatientHit) => p.when === "in" ? ["In house", p.room, p.diet].filter(Boolean).join(" · ")
    : p.when === "arriving" ? `Arrives ${fmt(p.start!)}` : p.when === "past" ? `Stayed until ${fmt(p.end!)}` : "No stay yet";

  return (
    <div>
      {onOpenPatient && people.length ? (
        <ListGroup title="Patients" count={Math.min(people.length, 5)}>
          {people.slice(0, 5).map((p) => (
            <Row key={p.id} onClick={() => { remember(q); onOpenPatient(p.id); }} title={marked(p.name, q)} facts={stayLine(p)} />
          ))}
        </ListGroup>
      ) : null}
      {out.length ? (
        <ListGroup title="Not available" count={out.length}>
          {out.map((o) => <Row key={o.id} title={marked(o.name, q)} facts={`${o.kind} · ${o.when}`} trailing={onOpenOut ? "›" : undefined} onClick={onOpenOut ? () => { remember(q); onOpenOut(o.id); } : undefined} />)}
        </ListGroup>
      ) : null}
      <div className="pt-3"><Seg<Scope> options={[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]]} value={scope} onChange={setScope} /></div>
      {hits === null ? <Loading rows={3} />
        : shown.length === 0 ? <Empty text={`No ${scope === "all" ? "" : `${scope} `}treatments match “${q}”.${all.length ? " Try All." : ""}`} />
        : days.map(([iso, list]) => (
          <ListGroup key={iso} title={heading(iso) === fmt(iso) ? heading(iso) : `${heading(iso)} · ${fmt(iso)}`} count={list.length}>
            {list.map((h) => {
              const p = isPast(h);
              const others = h.staff_names.filter(Boolean);
              return (
                <Row key={h.id} onClick={() => { remember(q); onOpen(h); }}
                  title={<span className={p ? "font-medium text-muted-foreground" : ""}>{h.status === "no_show" ? <s>{marked(h.patient_name, q)}</s> : marked(h.patient_name, q)}</span>}
                  facts={<>{marked(say(h.therapy_name), q)} · {others.length ? <>with {others.map((n, i) => <span key={i}>{i ? " & " : ""}{marked(n, q)}</span>)}</> : "no therapist"} · {marked(h.room_name || "No room", q)}</>}
                  trailing={<span className="tabular-nums">{h.start_time}<small className="block text-sm">{hm(toM(h.start_time) + h.duration_minutes)}</small></span>} />
              );
            })}
          </ListGroup>
        ))}
    </div>
  );
}
