/**
 * A private link's page (#219): a therapist's, doctor's or patient's own day,
 * opened from a URL with no sign-in. Everything recorded here lands on the
 * treatment as a record for the patient's log; nothing here changes the plan.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useMadeWith, useReception } from "@/lib/centreName";
import { Area, BottomSheet, Btn, Empty, FullPage, ItemRow, LinkBtn, ListGroup, Loading, QuietLink, Row, Seg, Text, Tick, dayText } from "@/components/kit";
import DischargeForm, { type DischargeView } from "@/components/DischargeForm";

type Check = { text: string; required: boolean; done: boolean };
type Item = {
  id: string; start_time: string; duration_minutes: number; status: string; therapy: string; description: string | null; room: string | null;
  with: string[]; patient?: string; products?: string[]; amenities?: string[]; checklist?: Check[];
  vitals?: { field: string; value: string }[]; room_ready?: boolean; note?: string | null;
  feedback?: "up" | "down" | null; feedback_note?: string | null;
};
type Day = { who: { kind: "therapist" | "doctor" | "patient"; name: string }; centre: string; date: string; today: string; items: Item[] };

const VITAL: Record<string, string> = { bp: "BP", pulse: "Pulse", weight: "Weight (kg)", temp: "Temperature", spo2: "SpO₂", sugar: "Blood sugar" };
const ISSUES: [string, string][] = [["room", "Room not usable"], ["co_therapist", "Co-therapist not here"], ["patient_absent", "Patient not here"], ["permission", "Need permission"], ["note", "A note for the admin"], ["sos", "SOS: need help now"]];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const shift = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const nowHM = () => new Date().toTimeString().slice(0, 5);

export default function LinkView() {
  const made = useMadeWith();
  const reception = useReception();
  const { token = "" } = useParams();
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [gone, setGone] = useState(false);
  const [raise, setRaise] = useState<{ appointment_id?: string } | null>(null);
  const [issueNote, setIssueNote] = useState("");
  // A doctor writes the discharge summaries of patients leaving around today (#194).
  const [leaving, setLeaving] = useState<{ stay_id: string; name: string; to: string; saved: boolean; final: boolean }[]>([]);
  const [discharge, setDischarge] = useState<DischargeView | null>(null);
  const isDoctor = day?.who.kind === "doctor";
  useEffect(() => {
    if (isDoctor) fetch(`${API_BASE}/public/link/${token}/discharges`).then((r) => r.json()).then((l: typeof leaving) => setLeaving([...l].sort((a, b) => Number(a.final) - Number(b.final) || a.to.localeCompare(b.to)))).catch(() => setLeaving([]));
  }, [isDoctor, token, discharge]);
  const openDischarge = async (stayId: string) => {
    const res = await fetch(`${API_BASE}/public/link/${token}/discharges/${stayId}`).catch(() => null);
    if (res?.ok) setDischarge(await res.json()); else toast.error("Could not open it. Check the connection.");
  };
  const saveDischarge = async (body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/public/link/${token}/discharges/${discharge!.stay_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) { toast.error(res?.status === 409 ? "The centre has made this final." : "Not saved. Check the connection and try again."); return null; }
    toast.success("Saved");
    return (await res.json()) as DischargeView;
  };

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/public/link/${token}${date ? `?date=${date}` : ""}`).catch(() => null);
    if (!res || res.status === 404) { setGone(true); return; }
    setDay(await res.json());
  }, [token, date]);
  useEffect(() => { load(); }, [load]);

  const save = async (item: Item, body: Record<string, unknown>, patch: Partial<Item>) => {
    setDay((d) => d && { ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, ...patch } : x)) });
    const res = await fetch(`${API_BASE}/public/link/${token}/appointments/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) { toast.error("Not saved. Check the connection and try again."); load(); }
  };
  const sendIssue = async (kind: string) => {
    const res = await fetch(`${API_BASE}/public/link/${token}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, note: issueNote || undefined, appointment_id: raise?.appointment_id }) }).catch(() => null);
    if (res?.ok) { toast.success(kind === "sos" ? "The centre has been told. Stay where you are." : "Sent to the centre"); setRaise(null); setIssueNote(""); }
    else toast.error("Not sent. Phone the centre.");
  };

  if (gone) return <FullPage><Empty text="This link is no longer valid. Ask the centre for a new one." /></FullPage>;
  if (!day) return <FullPage><Loading rows={3} /></FullPage>;

  const staff = day.who.kind !== "patient";
  const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <FullPage title={day.who.name} note={day.centre}>
      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Btn inline aria-label="Day before" onClick={() => setDate(shift(day.date, -1))}>‹</Btn>
        <div className="text-center"><div className="font-semibold">{label}</div>{day.date === day.today ? <div className="text-sm font-semibold text-primary">Today</div> : <Btn kind="quiet" inline className="min-h-0 py-1 text-sm" onClick={() => setDate(day.today)}>Back to today</Btn>}</div>
        <Btn inline aria-label="Day after" onClick={() => setDate(shift(day.date, 1))}>›</Btn>
      </div>

      <div className="mt-3">
        {day.items.length === 0 ? <ListGroup><Empty text="Nothing booked." /></ListGroup> : <ListGroup>{day.items.map((it) => {
          const end = hm(toMin(it.start_time) + it.duration_minutes);
          const over = day.date < day.today || (day.date === day.today && end <= nowHM());
          return (
            <ItemRow key={it.id} form
              title={<span aria-label={`${it.start_time} ${it.therapy}`}>{it.start_time}–{end} · {it.therapy}</span>}
              facts={[staff ? it.patient : null, it.room, it.with.length ? `with ${it.with.join(" & ")}` : null].filter(Boolean).join(" · ")}>
              {!staff && it.description ? <p className="text-sm">{it.description}</p> : null}
              {staff && (it.products?.length || it.amenities?.length) ? <p className="text-sm">{[...(it.amenities || []), ...(it.products || [])].join(", ")}</p> : null}

              {staff ? (
                <>
                  {it.checklist?.map((c) => (
                    <Tick key={c.text} label={<>{c.text}{c.required ? <span className="ml-2 text-sm text-muted-foreground">required</span> : null}</>} on={c.done}
                      set={(on) => save(it, { checklist: { [c.text]: on } }, { checklist: it.checklist!.map((x) => (x.text === c.text ? { ...x, done: on } : x)) })} />
                  ))}
                  {it.vitals?.length ? (
                    <div className="grid grid-cols-2 gap-x-2">
                      {it.vitals.map((v) => (
                        <Text key={v.field} label={VITAL[v.field] || v.field} inputMode={v.field === "bp" ? "text" : "decimal"} placeholder={v.field === "bp" ? "120/80" : ""} defaultValue={v.value}
                          onBlur={(e) => e.target.value !== v.value && save(it, { vitals: { [v.field]: e.target.value } }, { vitals: it.vitals!.map((x) => (x.field === v.field ? { ...x, value: e.target.value } : x)) })} />
                      ))}
                    </div>
                  ) : null}
                  {day.who.kind === "doctor" ? (
                    <Area label="Consultation note (optional)" defaultValue={it.note || ""} onBlur={(e) => e.target.value !== (it.note || "") && save(it, { note: e.target.value }, { note: e.target.value })} />
                  ) : null}
                  <Tick label="Room ready" on={!!it.room_ready} set={(on) => save(it, { room_ready: on }, { room_ready: on })} />
                  <Btn kind="secondary" onClick={() => setRaise({ appointment_id: it.id })}>Raise an issue</Btn>
                </>
              ) : over ? (
                <>
                  <span className="mt-1 text-sm font-semibold">How was it?</span>
                  <Seg<string> options={[["up", "Good"], ["down", "Not good"]]} value={it.feedback || ""} onChange={(f) => { const next = it.feedback === f ? null : (f as "up" | "down"); save(it, { feedback: next }, { feedback: next }); }} />
                  {it.feedback ? <Text label="A few words, if you like (optional)" defaultValue={it.feedback_note || ""} onBlur={(e) => e.target.value !== (it.feedback_note || "") && save(it, { feedback_note: e.target.value }, { feedback_note: e.target.value })} /> : null}
                </>
              ) : null}
            </ItemRow>
          );
        })}</ListGroup>}
      </div>

      {isDoctor && leaving.length ? (
        <section className="mt-2" aria-label="Discharge summaries">
          <ListGroup title="Discharge summaries" count={leaving.length}>
            {leaving.map((l) => <Row key={l.stay_id} title={l.name} facts={`Leaves ${dayText(l.to)}`} trailing={l.final ? "Final" : l.saved ? "Draft" : "To write"} onClick={() => openDischarge(l.stay_id)} />)}
          </ListGroup>
        </section>
      ) : null}

      <BottomSheet open={!!discharge} onOpenChange={(o) => { if (!o) setDischarge(null); }} title={`Discharge summary · ${discharge?.name ?? ""}`}>
        {discharge ? <DischargeForm view={discharge} admin={false} onSave={saveDischarge} onPdf={() => window.open(`${API_BASE}/public/link/${token}/discharges/${discharge.stay_id}/pdf`, "_blank")} /> : null}
      </BottomSheet>

      <div className="mt-4 grid gap-1">
        {staff ? <Btn kind="destructive" className="border-[1.5px] border-destructive" onClick={() => setRaise({})}>Raise an issue or SOS</Btn> : null}
        {/* A patient's way to the centre (#273 M1): reception on WhatsApp, once the centre has set its own number. */}
        {!staff && reception ? <LinkBtn href={`https://wa.me/${reception}?text=${encodeURIComponent(`${day.who.name}: `)}`}>WhatsApp reception</LinkBtn> : null}
      </div>

      <BottomSheet open={!!raise} onOpenChange={(o) => { if (!o) setRaise(null); }} title="Tell the centre" note="Pick what fits. It goes to the centre at once.">
        <Text label="A few words (optional)" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} />
        <div className="mt-3">
          <ListGroup>
            {ISSUES.filter(([k]) => raise?.appointment_id || !["room", "co_therapist", "patient_absent"].includes(k)).map(([k, t]) => (
              <Row key={k} title={<span className={k === "sos" ? "text-destructive" : ""}>{t}</span>} trailing="Send ›" onClick={() => sendIssue(k)} />
            ))}
          </ListGroup>
        </div>
      </BottomSheet>
      {made && <p className="mt-6 text-center"><QuietLink href="https://jains.es/ruta">{made}</QuietLink></p>}
    </FullPage>
  );
}
