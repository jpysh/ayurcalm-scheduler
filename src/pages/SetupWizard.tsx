import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pair, Area, Btn, Days, Dropdown, FullPage, Group, Seg, Text, TimeList, timesBetween } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useTrial } from "@/lib/centreName";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * Shown once, when an administrator signs in to an empty install whose settings
 * have never been completed: its name, then its hours. A centre showing its
 * example uses Make it mine instead (#729). A cloud trial's admin arrives by a
 * one-time link with no password (#247), so they set one first.
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
      // An example centre opens on its day first; Make it mine brings them back (#728).
      if (hasDemo) { navigate("/admin/schedule"); return; }
      setStep(1);
    } catch { toast.error("Your password was not saved. Check the connection and try again."); } finally { setBusy(false); }
  };
  // A centre showing its example goes on to its day after the password, and to Make it mine from there (#728, #729).
  const [hasDemo, setHasDemo] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/settings`).then((r) => r.json()).then((s) => {
      setHasDemo(s?.demo_data !== false);
      // A trial's sign-up already asked for the name (#577): the wizard starts with it.
      if (s?.centre_name && s.centre_name !== "Wellness Centre") setForm((f) => (f.centre_name ? f : { ...f, centre_name: s.centre_name }));
    }).catch(() => {});
  }, []);
  // Most often the person setting up is at the centre, so its zone is the phone's when the list has it (#577).
  const phoneZone = (() => { try { return current(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return ""; } })();
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

  const finish = async () => {
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
      toast.success(`Welcome, ${form.centre_name}`);
      navigate("/admin/schedule");
      setTimeout(() => window.location.reload(), 400);
    } finally {
      setBusy(false);
    }
  };

  const of = 2 + (trial ? 1 : 0);
  const TITLES = ["Choose your password", "What is your centre called?", "When are you open?"];
  const next = (to: number, ok: boolean, label = "Continue") => (
    <div className="mt-5 grid gap-1">
      <Btn kind="primary" type="submit" disabled={!ok || busy}>{label}</Btn>
      {to >= 0 ? <Btn kind="quiet" disabled={busy} onClick={() => setStep(to)}>Back</Btn> : null}
    </div>
  );

  return (
    <FullPage title={TITLES[step]} note={step === 0 && hasDemo ? "Then your centre opens, with an example day to look around." : `Step ${step + (trial ? 1 : 0)} of ${of}. You can change all of this later in Settings.`}>
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
        <form onSubmit={(e) => { e.preventDefault(); void finish(); }}>
          <div className={pair}>
            <TimeList label="Opens" value={form.opening_time} onChange={(t) => set("opening_time", t)} times={timesBetween("04:00", "14:00", 30)} />
            <TimeList label="Closes" value={form.closing_time} onChange={(t) => set("closing_time", t)} times={timesBetween("12:00", "23:30", 30)} after={form.opening_time} />
          </div>
          <Group label="Booking slots" note="How far apart treatments can start."><Seg options={[[15, "15 min"], [20, "20 min"], [30, "30 min"], [60, "60 min"]]} value={form.slot_minutes} onChange={(m) => set("slot_minutes", m)} /></Group>
          <Group label="Working days" note="A centre with patients staying treats them every day, weekends included."><Days value={form.working_days} onChange={(v) => set("working_days", v)} /></Group>
          <Dropdown label="Timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} note={form.timezone === phoneZone ? `This phone is in ${phoneZone.replace(/_/g, " ")}. Change it if the centre is elsewhere.` : "The centre's, not this phone's."}>
            <ZoneOptions also={form.timezone} />
          </Dropdown>
          {next(1, form.working_days.length > 0, "Finish")}
        </form>
      )}

    </FullPage>
  );
};

// The zones a wellness centre is likely to be in; any other is set in Settings.
/** Every zone this phone knows: the server accepts any real one, so a centre in Auckland or Paris can set its own clock (#606). */
const allZones = (): string[] => { try { return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone").map(current); } catch { return []; } };
// Chrome still reports some zones by their old names, so India read "Asia/Calcutta" and was listed twice (#713).
const RENAMED: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Rangoon": "Asia/Yangon" };
const current = (z: string) => RENAMED[z] ?? z;

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
