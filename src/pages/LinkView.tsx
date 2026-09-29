/**
 * A private link's page (#219): a therapist's, doctor's or resident's own day,
 * opened from a URL with no sign-in. Everything recorded here lands on the
 * treatment as a record for the resident's log; nothing here changes the plan.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useMadeWith, useReception } from "@/lib/centreName";
import { BottomSheet } from "@/components/BottomBar";
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
const ISSUES: [string, string][] = [["room", "Room not usable"], ["co_therapist", "Co-therapist not here"], ["patient_absent", "Resident not here"], ["permission", "Need permission"], ["note", "A note for the admin"], ["sos", "SOS: need help now"]];
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
  // A doctor writes the discharge summaries of residents leaving around today (#194).
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

  if (gone) return <main className="mx-auto max-w-md p-6 text-center text-[15px]">This link is no longer valid. Ask the centre for a new one.</main>;
  if (!day) return <main className="mx-auto max-w-md p-6 text-center text-muted-foreground">…</main>;

  const staff = day.who.kind !== "patient";
  const card = "rounded-2xl bg-card p-3";
  const chip = "min-h-11 rounded-full border-[1.5px] px-4 text-[15px] font-semibold";
  const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 pb-10 pt-4">
      <div className="text-[13px] text-muted-foreground">{day.centre}</div>
      <h1 className="text-xl font-bold">{day.who.name}</h1>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" aria-label="Day before" className="min-h-11 min-w-11 text-xl" onClick={() => setDate(shift(day.date, -1))}>‹</button>
        <div className="text-center"><div className="font-semibold">{label}</div>{day.date === day.today ? <div className="text-[13px] text-primary">Today</div> : <button type="button" className="text-[13px] text-primary underline" onClick={() => setDate(day.today)}>Back to today</button>}</div>
        <button type="button" aria-label="Day after" className="min-h-11 min-w-11 text-xl" onClick={() => setDate(shift(day.date, 1))}>›</button>
      </div>

      <div className="mt-3 grid gap-3">
        {day.items.length === 0 ? <div className={`${card} text-center text-muted-foreground`}>Nothing booked.</div> : day.items.map((it) => {
          const end = hm(toMin(it.start_time) + it.duration_minutes);
          const over = day.date < day.today || (day.date === day.today && end <= nowHM());
          return (
            <section key={it.id} className={card} aria-label={`${it.start_time} ${it.therapy}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[17px] font-semibold">{it.therapy}</div>
                <div className="tabular-nums text-muted-foreground">{it.start_time}–{end}</div>
              </div>
              <div className="text-[14px] text-muted-foreground">
                {[staff ? it.patient : null, it.room, it.with.length ? `with ${it.with.join(" & ")}` : null].filter(Boolean).join(" · ")}
              </div>
              {!staff && it.description ? <p className="mt-1 text-[14px]">{it.description}</p> : null}
              {staff && (it.products?.length || it.amenities?.length) ? (
                <div className="mt-1 text-[13px]">{[...(it.amenities || []), ...(it.products || [])].join(", ")}</div>
              ) : null}

              {staff ? (
                <div className="mt-3 grid gap-2">
                  {it.checklist?.map((c) => (
                    <label key={c.text} className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" className="h-5 w-5 min-h-0 min-w-0 flex-none" checked={c.done}
                        onChange={(e) => save(it, { checklist: { [c.text]: e.target.checked } }, { checklist: it.checklist!.map((x) => (x.text === c.text ? { ...x, done: e.target.checked } : x)) })} />
                      <span className="flex-1">{c.text}</span>
                      {c.required ? <span className="text-[12px] text-muted-foreground">required</span> : null}
                    </label>
                  ))}
                  {it.vitals?.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {it.vitals.map((v) => (
                        <label key={v.field} className="grid gap-1 text-[13px] text-muted-foreground">{VITAL[v.field] || v.field}
                          <input className="min-h-11 rounded-xl border px-3 text-base text-foreground" inputMode={v.field === "bp" ? "text" : "decimal"} placeholder={v.field === "bp" ? "120/80" : ""} defaultValue={v.value}
                            onBlur={(e) => e.target.value !== v.value && save(it, { vitals: { [v.field]: e.target.value } }, { vitals: it.vitals!.map((x) => (x.field === v.field ? { ...x, value: e.target.value } : x)) })} />
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {day.who.kind === "doctor" ? (
                    <label className="grid gap-1 text-[13px] text-muted-foreground">Consultation note
                      <textarea rows={3} className="rounded-xl border p-2 text-base text-foreground" defaultValue={it.note || ""}
                        onBlur={(e) => e.target.value !== (it.note || "") && save(it, { note: e.target.value }, { note: e.target.value })} />
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" aria-pressed={!!it.room_ready} className={`${chip} flex-1 ${it.room_ready ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                      onClick={() => save(it, { room_ready: !it.room_ready }, { room_ready: !it.room_ready })}>{it.room_ready ? "Room ready ✓" : "Room ready"}</button>
                    <button type="button" className={`${chip} border-border`} onClick={() => setRaise({ appointment_id: it.id })}>Raise an issue</button>
                  </div>
                </div>
              ) : over ? (
                <div className="mt-3 grid gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-[14px]">How was it?</span>
                    {(["up", "down"] as const).map((f) => (
                      <button key={f} type="button" aria-label={f === "up" ? "Good" : "Not good"} aria-pressed={it.feedback === f}
                        className={`${chip} ${it.feedback === f ? "border-primary bg-primary/10" : "border-border"}`}
                        onClick={() => save(it, { feedback: it.feedback === f ? null : f }, { feedback: it.feedback === f ? null : f })}>{f === "up" ? "👍" : "👎"}</button>
                    ))}
                  </div>
                  {it.feedback ? (
                    <input className="min-h-11 rounded-xl border px-3 text-base" placeholder="A few words, if you like" defaultValue={it.feedback_note || ""}
                      onBlur={(e) => e.target.value !== (it.feedback_note || "") && save(it, { feedback_note: e.target.value }, { feedback_note: e.target.value })} />
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {isDoctor && leaving.length ? (
        <section className="mt-4" aria-label="Discharge summaries">
          <h2 className="mb-1.5 px-1 text-[13px] font-bold">Discharge summaries</h2>
          <div className="overflow-hidden rounded-2xl bg-card">
            {leaving.map((l) => (
              <button key={l.stay_id} type="button" className="flex min-h-12 w-full items-center gap-3 border-b border-border px-3 text-left last:border-b-0" onClick={() => openDischarge(l.stay_id)}>
                <span className="flex-1"><b className="block">{l.name}</b><span className="text-[13px] text-muted-foreground">Leaves {new Date(`${l.to}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span></span>
                <span className="text-[13px] text-muted-foreground">{l.final ? "Final" : l.saved ? "Draft" : "To write"}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <BottomSheet open={!!discharge} onOpenChange={(o) => { if (!o) setDischarge(null); }} title={`Discharge summary · ${discharge?.name ?? ""}`}>
        {discharge ? <div className="-mt-2 max-h-[75dvh] overflow-y-auto"><DischargeForm view={discharge} admin={false} onSave={saveDischarge} onPdf={() => window.open(`${API_BASE}/public/link/${token}/discharges/${discharge.stay_id}/pdf`, "_blank")} /></div> : null}
      </BottomSheet>

      {staff ? <button type="button" className={`${chip} mt-4 w-full border-destructive text-destructive`} onClick={() => setRaise({})}>Raise an issue or SOS</button> : null}
      {/* A resident's way to the centre (#273 M1): reception on WhatsApp, once the centre has set its own number. */}
      {!staff && reception ? <a className={`${chip} mt-4 flex w-full items-center justify-center border-border`} href={`https://wa.me/${reception}?text=${encodeURIComponent(`${day.who.name}: `)}`} target="_blank" rel="noopener noreferrer">WhatsApp reception</a> : null}

      <BottomSheet open={!!raise} onOpenChange={(o) => { if (!o) setRaise(null); }} title="Tell the centre">
        <div className="grid gap-2">
          <input className="min-h-11 rounded-xl border px-3 text-base" placeholder="A few words (optional)" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} />
          {ISSUES.filter(([k]) => raise?.appointment_id || !["room", "co_therapist", "patient_absent"].includes(k)).map(([k, t]) => (
            <button key={k} type="button" className={`${chip} w-full ${k === "sos" ? "border-destructive bg-destructive text-destructive-foreground" : "border-border"}`} onClick={() => sendIssue(k)}>{t}</button>
          ))}
        </div>
      </BottomSheet>
      {made && <p className="mt-8 text-center text-xs text-muted-foreground"><a href="https://jains.es/ruta" className="underline-offset-2 hover:underline">{made}</a></p>}
    </main>
  );
}
