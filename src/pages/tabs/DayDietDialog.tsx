import { useEffect, useState } from "react";
import { BottomSheet, Btn, DateRow, SheetFoot, Text, dayText } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type Meal = "breakfast" | "lunch" | "dinner" | "snacks";
const meals: Meal[] = ["breakfast", "lunch", "dinner", "snacks"];
const mealTitle: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
type Row = { meal_time: Meal; description: string; instructions?: string | null };
type Texts = Record<Meal, string>;
const empty: Texts = { breakfast: "", lunch: "", dinner: "", snacks: "" };

/**
 * What the physician said for one patient on one day. Each filled meal beats the
 * patient's plan on the printed sheet; emptying it hands the meal back to the plan.
 */
export default function DayDietDialog({ patient, day, onClose, onChangePlan }: { patient: { id: string; name: string } | null; day: string; onClose: () => void; onChangePlan?: () => void }) {
  const [date, setDate] = useState(day);
  // The centre's day, not the phone's: today, or tomorrow after closing (#586).
  useEffect(() => { if (patient && day) { setDate(day); setUntil(day); } }, [patient?.id, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState<Texts>(empty);
  const [texts, setTexts] = useState<Texts>(empty);
  const [busy, setBusy] = useState(false);
  // What the plan gives that day, shown in each empty box so the admin sees the meals, not "As plan" (#265 H2).
  const [plan, setPlan] = useState<Partial<Record<string, string>>>({});
  const [away, setAway] = useState<string | null>(null);
  // The same change on the days after too, up to leaving (#982).
  const [until, setUntil] = useState(day);
  const [leaves, setLeaves] = useState<string | null>(null);
  useEffect(() => { setUntil((u) => (u < date ? date : u)); }, [date]);

  useEffect(() => {
    if (!patient || !date) return;
    let stale = false;
    setSaved(empty);
    setTexts(empty);
    setPlan({});
    setAway(null);
    fetch(`${API_BASE}/patients/${patient.id}/day?date=${date}`).then((r) => (r.ok ? r.json() : null))
      
      .then((d: { away?: string | null; meals?: { meal: string; text: string }[]; stay?: { end_date: string } | null } | null) => { if (!stale) { setAway(d?.away ?? null); setLeaves(d?.stay?.end_date ?? null); } if (!stale && d?.meals) setPlan(Object.fromEntries(d.meals.map((m) => [m.meal, m.text]))); })
      .catch(() => {});
    fetch(`${API_BASE}/dietplans?patient_id=${patient.id}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: Row[]) => {
        if (stale) return;
        const next = { ...empty };
        // Instructions are shown in the same box because the sheet prints them
        // joined; an edit then replaces both rather than leaving a hidden half.
        for (const r of rows) next[r.meal_time] = [r.description, r.instructions].filter(Boolean).join(" — ");
        setSaved(next);
        setTexts(next);
      })
      .catch(() => { if (!stale) toast.error("Could not load this day's diet"); });
    return () => { stale = true; };
  }, [patient, date]);

  const save = async () => {
    if (!patient) return;
    setBusy(true);
    const undo: { meal: Meal; previous: { date: string; description: string; instructions: string | null }[] }[] = [];
    const post = (body: object) => fetch(`${API_BASE}/dietplans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_id: patient.id, ...body }) });
    try {
      for (const meal of meals) {
        if (texts[meal].trim() === saved[meal].trim() && until === date) continue;
        const res = await post({ date, until, meal_time: meal, description: texts[meal] });
        if (!res.ok) throw new Error(String(res.status));
        undo.push({ meal, previous: (await res.json()).previous });
      }
      // Undo empties the days changed, then writes back what each had (#982).
      toast(until === date ? "Meals saved" : `Meals saved until ${dayText(until)}`, { action: { label: "Undo", onClick: async () => {
        for (const u of undo) {
          await post({ date, until, meal_time: u.meal, description: "" });
          for (const p of u.previous) await post({ date: p.date, meal_time: u.meal, description: p.description, instructions: p.instructions ?? undefined });
        }
        toast("Meals put back");
      } } });
      onClose();
    } catch {
      toast.error("Could not save — nothing after the failed meal was saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={!!patient} onOpenChange={(v: boolean) => { if (!v) { setDate(day); setUntil(day); onClose(); } }} title={`${patient?.name ?? ''}'s meals`}
      note="Type in a meal to change it on these days only. Leave it empty to follow the plan."
      foot={<SheetFoot busy={busy} ok={!!date} save={save} label="Save the meals" />}>
      <DateRow label="From" value={date} onChange={setDate} />
      <DateRow label="Until" value={until} min={date} max={leaves ?? undefined} onChange={setUntil} />
      {leaves && until !== leaves ? <Btn kind="quiet" inline className="-ml-2" onClick={() => setUntil(leaves)}>Until leaving</Btn> : null}
      {/* Away is said, never a dropped meal: the kitchen keeps it aside (#695). */}
      {away ? <p className="mt-2 text-sm font-semibold">{away}</p> : null}
      {meals.map((meal) => (
        <Text key={meal} label={mealTitle[meal]} value={texts[meal]} maxLength={500} placeholder={plan[mealTitle[meal]] || "Nothing on the plan"}
          onChange={(e) => setTexts((t) => ({ ...t, [meal]: e.target.value }))} />
      ))}
      {/* The plan itself is one step further in (#178): the day is the daily job. */}
      {onChangePlan ? <div className="mt-3"><Btn onClick={onChangePlan}>Change plan…</Btn></div> : null}
    </BottomSheet>
  );
}
