import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
export default function DayDietDialog({ patient, onClose }: { patient: { id: string; name: string } | null; onClose: () => void }) {
  const [date, setDate] = useState(localToday);
  const [saved, setSaved] = useState<Texts>(empty);
  const [texts, setTexts] = useState<Texts>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!patient || !date) return;
    let stale = false;
    setSaved(empty);
    setTexts(empty);
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
      toast.success(`Diet for ${date} saved`);
      onClose();
    } catch {
      toast.error("Could not save — nothing after the failed meal was saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!patient} onOpenChange={(v: boolean) => { if (!v) { setDate(localToday()); onClose(); } }}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="text-sm pr-6">Diet for one day — {patient?.name}</DialogTitle>
          <DialogDescription className="text-xs">
            A filled meal replaces the plan on the day sheet for this date only. Leave a meal empty to follow the plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="day-diet-date" className="text-xs">Date</Label>
            <Input id="day-diet-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
          </div>
          {meals.map((meal) => (
            <div key={meal} className="space-y-1">
              <Label htmlFor={`day-diet-${meal}`} className="text-xs">{mealTitle[meal]}</Label>
              <Input
                id={`day-diet-${meal}`}
                value={texts[meal]}
                maxLength={500}
                placeholder="As plan"
                onChange={(e) => setTexts((t) => ({ ...t, [meal]: e.target.value }))}
                className="h-8"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !date} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
