import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/BottomBar";
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
export default function DayDietDialog({ patient, onClose, onChangePlan }: { patient: { id: string; name: string } | null; onClose: () => void; onChangePlan?: () => void }) {
  const [date, setDate] = useState(localToday);
  const [saved, setSaved] = useState<Texts>(empty);
  const [texts, setTexts] = useState<Texts>(empty);
  const [busy, setBusy] = useState(false);
  // What the plan gives that day, shown in each empty box so the admin sees the meals, not "As plan" (#265 H2).
  const [plan, setPlan] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    if (!patient || !date) return;
    let stale = false;
    setSaved(empty);
    setTexts(empty);
    setPlan({});
    fetch(`${API_BASE}/patients/${patient.id}/day?date=${date}`).then((r) => (r.ok ? r.json() : null))
      .then((d: { meals?: { meal: string; text: string }[] } | null) => { if (!stale && d?.meals) setPlan(Object.fromEntries(d.meals.map((m) => [m.meal, m.text]))); })
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
    <BottomSheet open={!!patient} onOpenChange={(v: boolean) => { if (!v) { setDate(localToday()); onClose(); } }} title={`${patient?.name ?? ''}'s meals`}>
      <div className="max-h-[75dvh] space-y-3 overflow-y-auto">
        <Input id="day-diet-date" aria-label="Day" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        {meals.map((meal) => (
          <div key={meal} className="space-y-1">
            <Label htmlFor={`day-diet-${meal}`} className="text-[13px]">{mealTitle[meal]}</Label>
            <Input id={`day-diet-${meal}`} value={texts[meal]} maxLength={500}
              placeholder={plan[mealTitle[meal]] || "Nothing on the plan"}
              onChange={(e) => setTexts((t) => ({ ...t, [meal]: e.target.value }))} />
          </div>
        ))}
        <p className="text-[13px] text-muted-foreground">Type in a meal to change it for this day only. Leave it empty to follow the plan.</p>
        <Button className="min-h-11 w-full rounded-full" disabled={busy || !date} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        {/* The plan itself is one step further in (#178): the day is the daily job. */}
        {onChangePlan ? <Button variant="outline" className="min-h-11 w-full rounded-full" onClick={onChangePlan}>Change plan…</Button> : null}
      </div>
    </BottomSheet>
  );
}
