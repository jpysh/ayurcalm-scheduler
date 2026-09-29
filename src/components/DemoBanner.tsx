import { useDemo } from "@/lib/centreName";

/** Tells a demo visitor why their changes will vanish (#84). */
export function DemoBanner() {
  const demo = useDemo();
  if (!demo) return null;
  const at = new Date(demo.next_reset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div role="status" className="bg-amber-100 text-amber-950 text-xs text-center px-4 py-1.5">
      Demo centre with made-up residents. Anything you change is put back at {at}.
    </div>
  );
}
