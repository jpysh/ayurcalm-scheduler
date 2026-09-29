import { useDemo, useTrial } from "@/lib/centreName";

/** Tells a demo visitor why their changes will vanish (#84), and a trial centre how long it has (#247). */
export function DemoBanner() {
  const demo = useDemo();
  const trial = useTrial();
  if (trial?.ends_at) {
    const days = Math.ceil((Date.parse(trial.ends_at) - Date.now()) / 86400000);
    return (
      <div role="status" className="bg-amber-100 text-amber-950 text-xs text-center px-4 py-1.5">
        {trial.read_only
          ? "Your free trial has ended. Nothing is deleted: download everything from Settings, or choose a plan to keep going."
          : `Free trial: ${days} ${days === 1 ? "day" : "days"} left.`}
      </div>
    );
  }
  if (!demo) return null;
  const at = new Date(demo.next_reset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mins = Math.max(1, Math.round((Date.parse(demo.next_reset) - Date.now()) / 60000));
  return (
    <div role="status" className="bg-amber-100 text-amber-950 text-xs text-center px-4 py-1.5">
      Demo centre with made-up residents. Anything you change is put back at {at} (in {mins} min).
    </div>
  );
}
