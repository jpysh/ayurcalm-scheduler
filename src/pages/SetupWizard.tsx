import { useEffect, useState } from "react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { useNavigate } from "react-router-dom";
import { Area, Btn, Days, Dropdown, FullPage, Group, Picker, Seg, Text, TimeList, noteText, timesBetween } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useTrial } from "@/lib/centreName";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type Keep = "templates" | "all" | "none";

/**
 * Shown once, when an administrator signs in to an install whose settings have
 * never been completed. Three steps, then a choice about the demo data. A cloud
 * trial's admin arrives by a one-time link with no password (#247), so they set one first.
 */
const SetupWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const trial = useTrial();
  const [pw, setPw] = useState("");
  // Once saved, a reload goes on from the centre name rather than asking again (#711).
  useEffect(() => { if (trial && !localStorage.getItem("passwordChosen")) setStep(0); }, [trial]);
  const savePassword = async () => {
    setBusy(true);
    try {
      const me = await fetch(`${API_BASE}/auth/me`).then((r) => r.json());
      const res = await fetch(`${API_BASE}/users/${me.user.id}/set-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Your password was not saved. Try again."); return; }
      localStorage.setItem("passwordChosen", "1");
      setStep(1);
    } catch { toast.error("Your password was not saved. Check the connection and try again."); } finally { setBusy(false); }
  };
  // A cloud trial (#247) starts with no example centre, so there is nothing to keep or clear.
  const [hasDemo, setHasDemo] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/settings`).then((r) => r.json()).then((s) => {
      setHasDemo(s?.demo_data !== false);
      // A trial's sign-up already asked for the name (#577): the wizard starts with it.
      if (s?.centre_name && s.centre_name !== "Wellness Centre") setForm((f) => (f.centre_name ? f : { ...f, centre_name: s.centre_name }));
    }).catch(() => {});
  }, []);
  // Most often the person setting up is at the centre, so its zone is the phone's when the list has it (#577).
  const phoneZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const [form, setForm] = useState({
    centre_name: "",
    address: "",
    // The centre's timezone, not the browser's: the machine setting it up is
    // often not in the same country as the centre.
    timezone: phoneZone && (TIMEZONES.includes(phoneZone) || allZones().includes(phoneZone)) ? phoneZone : "Asia/Kolkata",
    opening_time: "09:00",
    closing_time: "18:00",
    slot_minutes: 30,
    // Every day, not Monday to Friday: a residential centre treats its residents
    // on the days they are resident, which includes the weekend.
    working_days: [...WEEKDAYS] as string[],
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // What the starter kit holds, counted from the centre itself: therapies and rooms are kept, packages, accommodation and diet plans never go.
  const [kit, setKit] = useState("");
  const [start, setStart] = useState<Keep>("templates");
  useEffect(() => {
    if (step !== 3) return;
    const n = (path: string) => fetch(`${API_BASE}/${path}`).then((r) => r.json()).then((l) => (Array.isArray(l) ? l.length : 0)).catch(() => 0);
    Promise.all(["therapies", "rooms", "packages", "diet-templates"].map(n)).then(([t, r, p, d]) => setKit([`${t} therapies`, `${r} rooms`, `${p} packages`, `${d} diet plans`].join(", ")));
  }, [step]);

  /** all: keep the whole example centre; templates: keep its therapies and rooms only; none: start empty. */
  const finish = async (keep: Keep) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, address: form.address || null, logo: null, setup_complete: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not save your details");
        setStep(2);
        return;
      }
      if (keep !== "all") {
        const clear = await fetch(`${API_BASE}/settings/clear-demo-data`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(keep === "templates" ? { keep: "templates" } : {}) });
        if (!clear.ok) {
          toast.error("Saved your details, but could not clear the demo data");
        }
      }
      toast.success(`Welcome, ${form.centre_name}`);
      navigate("/admin/schedule");
      setTimeout(() => window.location.reload(), 400);
    } finally {
      setBusy(false);
    }
  };

  const of = (hasDemo ? 3 : 2) + (trial ? 1 : 0);
  const TITLES = ["Choose your password", "What is your centre called?", "When are you open?", "How do you want to start?"];
  const next = (to: number, ok: boolean, label = "Continue") => (
    <div className="mt-5 grid gap-1">
      <Btn kind="primary" type="submit" disabled={!ok || busy}>{label}</Btn>
      {to >= 0 ? <Btn kind="quiet" disabled={busy} onClick={() => setStep(to)}>Back</Btn> : null}
    </div>
  );

  return (
    <FullPage title={TITLES[step]} note={`Step ${step + (trial ? 1 : 0)} of ${of}. You can change all of this later in Settings.`}>
      {step === 0 && (
        <form onSubmit={(e) => { e.preventDefault(); savePassword(); }}>
          <input type="email" autoComplete="username" value={localStorage.getItem("authUser") ?? ""} readOnly hidden />
          <Text label="Password" type="password" autoFocus autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} valid={pw.length >= 8}
            note={`At least 8 characters. You sign in with ${localStorage.getItem("authUser")} and this password.`} />
          {next(-1, pw.length >= 8)}
        </form>
      )}

      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
          <Text label="Centre name" autoFocus value={form.centre_name} onChange={(e) => set("centre_name", e.target.value)} placeholder="e.g. Green Valley Ayurveda" note="Appears in the app and on the printed daily schedule." />
          <Area label="Address (optional)" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          {next(trial ? 0 : -1, !!form.centre_name.trim())}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={(e) => { e.preventDefault(); if (hasDemo) setStep(3); else void finish("all"); }}>
          <div className="grid grid-cols-2 gap-3">
            <TimeList label="Opens" value={form.opening_time} onChange={(t) => set("opening_time", t)} times={timesBetween("04:00", "14:00", 30)} />
            <TimeList label="Closes" value={form.closing_time} onChange={(t) => set("closing_time", t)} times={timesBetween("12:00", "23:30", 30)} after={form.opening_time} />
          </div>
          <Group label="Booking slots" note="How far apart treatments can start."><Seg options={[[15, "15 min"], [20, "20 min"], [30, "30 min"], [60, "60 min"]]} value={form.slot_minutes} onChange={(m) => set("slot_minutes", m)} /></Group>
          <Group label="Working days" note="A centre with patients staying treats them every day, weekends included."><Days value={form.working_days} onChange={(v) => set("working_days", v)} /></Group>
          <Dropdown label="Timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} note={form.timezone === phoneZone ? `This phone is in ${phoneZone.replace(/_/g, " ")}. Change it if the centre is elsewhere.` : "The centre's, not this phone's."}>
            <ZoneOptions also={form.timezone} />
          </Dropdown>
          {next(1, form.working_days.length > 0, hasDemo ? "Continue" : "Finish")}
        </form>
      )}

      {step === 3 && (
        <form onSubmit={(e) => { e.preventDefault(); void (async () => { if (start === "none" && !(await confirmSheet("Delete all the example patients, therapists, rooms, therapies and bookings?\n\nThis cannot be undone.", "Delete"))) return; await finish(start); })(); }}>
          <p className={`mt-3 ${noteText}`}>This install came with an example centre: patients, therapists, rooms, therapies and three months of bookings, so you could see how it works.</p>
          {/* The recommended start comes first: a real centre edits the starter therapies and rooms rather than typing them (#60, #288). */}
          <div className="mt-3">
            <Picker<Keep> value={start} onChange={setStart} options={[
              { id: "templates", name: "Residential Ayurveda starter kit", note: "Therapies, rooms, packages, diet plans, rules", fact: "Recommended" },
              { id: "all", name: "Keep the example data for now", note: "Patients and bookings, to look around" },
              { id: "none", name: "Start completely empty", note: "Nothing from the examples" },
            ]} />
          </div>
          <p className={`mt-3 ${noteText}`}>{start === "templates" ? `The kit holds ${kit || "the usual set"}, and sets the rules for what needs you. ` : ""}Review each in Settings, at your own pace; everything works as it is. Nothing here deletes your account.</p>
          {next(2, true, busy ? "Setting up…" : start === "templates" ? "Start with the kit" : start === "all" ? "Keep the example data" : "Start empty")}
        </form>
      )}
    </FullPage>
  );
};

// The zones a wellness centre is likely to be in; any other is set in Settings.
/** Every zone this phone knows: the server accepts any real one, so a centre in Auckland or Paris can set its own clock (#606). */
const allZones = (): string[] => { try { return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone"); } catch { return []; } };

/** The common zones first, then the rest in their own group. */
export function ZoneOptions({ also = "" }: { also?: string }) {
  const first = [...new Set([...TIMEZONES, also].filter(Boolean))];
  const rest = allZones().filter((z) => !first.includes(z));
  const name = (z: string) => z.replace(/_/g, " ");
  return (<>
    {first.map((z) => <option key={z} value={z}>{name(z)}</option>)}
    {rest.length > 0 && <optgroup label="All other zones">{rest.map((z) => <option key={z} value={z}>{name(z)}</option>)}</optgroup>}
  </>);
}

export const TIMEZONES = ["Asia/Kolkata", "Asia/Colombo", "Asia/Kathmandu", "Asia/Dubai", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Europe/Berlin", "Europe/Prague", "Europe/Madrid", "Africa/Johannesburg", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "UTC"];

export default SetupWizard;
