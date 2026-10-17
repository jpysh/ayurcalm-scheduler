import { Link, useLocation } from "react-router-dom";
import { useDemo, useExample, useTrial } from "@/lib/centreName";

/** Tells a demo visitor why their changes will vanish (#84), and a trial centre how long it has (#247). */
export function DemoBanner() {
  const demo = useDemo();
  const trial = useTrial();
  const example = useExample();
  const { pathname } = useLocation();
  // A private link belongs to a guest, a therapist or a doctor: the trial and plan notes are the admin's, never theirs (#618).
  const onLink = pathname.startsWith("/l/");
  // The trial's days only start once it is the centre's own, so the example note comes first (#728).
  if (example && !onLink && localStorage.getItem("authRole") === "Admin" && !pathname.startsWith("/setup") && pathname !== "/login") {
    return (
      <div role="status" className="bg-notice-bg px-4 py-2 text-center text-sm text-notice">
        This is an example centre. <Link to="/setup/mine" className="-my-3 inline-flex min-h-11 items-center align-middle font-semibold underline">Make it mine</Link>
      </div>
    );
  }
  if (!onLink && (trial?.ends_at || trial?.read_only)) {
    const days = Math.ceil((Date.parse(trial.ends_at) - Date.now()) / 86400000);
    return (
      <div role="status" className="bg-notice-bg px-4 py-2 text-center text-sm text-notice">
        {trial.plan
          ? "Payment is overdue, so the centre is read-only. Nothing is deleted: Settings → Plan to carry on."
          : trial.read_only
          ? "Your free trial has ended. Nothing is deleted: download everything from Settings, or choose a plan to keep going."
          : `Free trial: ${days} ${days === 1 ? "day" : "days"} left, to ${new Date(trial.ends_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}.`}
      </div>
    );
  }
  if (!demo) return null;
  const at = new Date(demo.next_reset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mins = Math.max(1, Math.round((Date.parse(demo.next_reset) - Date.now()) / 60000));
  return (
    <div role="status" className="bg-notice-bg px-4 py-2 text-center text-sm text-notice">
      Demo centre with made-up patients. Anything you change is put back at {at} (in {mins} min).
    </div>
  );
}
