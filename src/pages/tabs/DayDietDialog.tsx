import { useEffect, useState } from "react";
import { BottomSheet, Btn, DateRow, SheetFoot, Text } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type Meal = "breakfast" | "lunch" | "dinner" | "snacks";
const meals: Meal[] = ["breakfast", "lunch", "dinner", "snacks"];
const mealTitle: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
type Row = { meal_time: Meal; description: string; instructions?: string | null };
type Texts = Record<Meal, string>;
const empty: Texts = { breakfast: "", lunch: "", dinner: "", snacks: "" };

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * What the physician said for one patient on one day. Each filled meal beats the
 * patient's plan on the printed sheet; emptying it hands the meal back to the plan.
 */
export default function DayDietDialog({ patient, day, onClose, onChangePlan }: { patient: { id: string; name: string } | null; day?: string; onClose: () => void; onChangePlan?: () => void }) {
  const [date, setDate] = useState(day ?? localToday());
  // The centre's day, not the phone's: today, or tomorrow after closing (#586).
  useEffect(() => { if (patient && day) setDate(day); }, [patient?.id, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState<Texts>(empty);
  const [texts, setTexts] = useState<Texts>(empty);
  const [busy, setBusy] = useState(false);
  // What the plan gives that day, shown in each empty box so the admin sees the meals, not "As plan" (#265 H2).
  const [plan, setPlan] = useState<Partial<Record<string, string>>>({});
  const [away, setAway] = useState<string | null>(null);

  useEffect(() => {
    if (!patient || !date) return;
    let stale = false;
    setSaved(empty);
    setTexts(empty);
    setPlan({});
    setAway(null);
    fetch(`${API_BASE}/patients/${patient.id}/day?date=${date}`).then((r) => (r.ok ? r.json() : null))
      
      .then((d: { away?: string | null; meals?: { meal: string; text: string }[] } | null) => { if (!stale) setAway(d?.away ?? null); if (!stale && d?.meals) setPlan(Object.fromEntries(d.meals.map((m) => [m.meal, m.text]))); })
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
    try {
      for (const meal of meals) {
        if (texts[meal].trim() === saved[meal].trim()) continue;
        const res = await fetch(`${API_BASE}/dietplans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: patient.id, date, meal_time: meal, description: texts[meal] }),
        });
        if (!res.ok) throw new Error(String(res.status));
      }
      toast.success("Meals saved");
      onClose();
    } catch {
      toast.error("Could not save — nothing after the failed meal was saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={!!patient} onOpenChange={(v: boolean) => { if (!v) { setDate(day ?? localToday()); onClose(); } }} title={`${patient?.name ?? ''}'s meals`}
      note="Type in a meal to change it for this day only. Leave it empty to follow the plan."
      foot={<SheetFoot busy={busy} ok={!!date} save={save} label="Save the meals" />}>
      <DateRow label="Day" value={date} onChange={setDate} />
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
