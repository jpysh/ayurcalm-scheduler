import { useEffect, useState } from "react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useTrial } from "@/lib/centreName";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

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
  useEffect(() => { if (trial) setStep(0); }, [trial]);
  const savePassword = async () => {
    setBusy(true);
    try {
      const me = await fetch(`${API_BASE}/auth/me`).then((r) => r.json());
      const res = await fetch(`${API_BASE}/users/${me.user.id}/set-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not save your password"); return; }
      setStep(1);
    } catch { toast.error("Could not save your password"); } finally { setBusy(false); }
  };
  // A cloud trial (#247) starts with no example centre, so there is nothing to keep or clear.
  const [hasDemo, setHasDemo] = useState(true);
  useEffect(() => { fetch(`${API_BASE}/settings`).then((r) => r.json()).then((s) => setHasDemo(s?.demo_data !== false)).catch(() => {}); }, []);
  const [form, setForm] = useState({
    centre_name: "",
    address: "",
    // The centre's timezone, not the browser's: the machine setting it up is
    // often not in the same country as the centre.
    timezone: "Asia/Kolkata",
    opening_time: "09:00",
    closing_time: "18:00",
    slot_minutes: 30,
    // Every day, not Monday to Friday: a residential centre treats its residents
    // on the days they are resident, which includes the weekend.
    working_days: [...WEEKDAYS] as string[],
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (day: string) =>
    set("working_days", form.working_days.includes(day)
      ? form.working_days.filter((d) => d !== day)
      : [...form.working_days, day]);

  /** all: keep the whole example centre; templates: keep its therapies and rooms only; none: start empty. */
  const finish = async (keep: "all" | "templates" | "none") => {
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

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4">
      <Card className="w-full max-w-lg mt-8">
        <CardHeader className="pb-2">
          <p className="text-xs text-muted-foreground">Step {step + (trial ? 1 : 0)} of {(hasDemo ? 3 : 2) + (trial ? 1 : 0)}</p>
          <CardTitle className="text-lg">
            {step === 0 && "Choose your password"}
            {step === 1 && "What is your centre called?"}
            {step === 2 && "When are you open?"}
            {step === 3 && "Start with example data?"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 0 && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); savePassword(); }}>
              <input type="email" autoComplete="username" value={localStorage.getItem("authUser") ?? ""} readOnly hidden />
              <div className="space-y-1">
                <Label htmlFor="w_pw">Password</Label>
                <Input id="w_pw" type="password" autoFocus autoComplete="new-password" minLength={8} required
                  value={pw} onChange={(e) => setPw(e.target.value)} />
                <p className="text-xs text-muted-foreground">At least 8 characters. You sign in with {localStorage.getItem("authUser")} and this password.</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={pw.length < 8 || busy}>Continue</Button>
              </div>
            </form>
          )}

          {step === 1 && (
            <>
              <div className="space-y-1">
                <Label htmlFor="w_name">Centre name</Label>
                <Input id="w_name" autoFocus value={form.centre_name}
                  onChange={(e) => set("centre_name", e.target.value)}
                  placeholder="e.g. Green Valley Ayurveda" />
                <p className="text-xs text-muted-foreground">Appears in the app and on the printed daily schedule.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="w_address">Address <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="w_address" rows={2} value={form.address}
                  onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!form.centre_name.trim()}>Continue</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="w_open">Opens</Label>
                  <Input id="w_open" type="time" value={form.opening_time}
                    onChange={(e) => set("opening_time", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="w_close">Closes</Label>
                  <Input id="w_close" type="time" value={form.closing_time}
                    onChange={(e) => set("closing_time", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Booking slots</Label>
                  <Select value={String(form.slot_minutes)} onValueChange={(v) => set("slot_minutes", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[15, 20, 30, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Working days</Label>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm capitalize">
                      <Checkbox checked={form.working_days.includes(d)} onCheckedChange={() => toggleDay(d)} />
                      {d.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1 max-w-xs">
                <Label htmlFor="w_tz">Timezone</Label>
                <select id="w_tz" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {TIMEZONES.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                These decide which time rows the schedule shows. You can change them later in Settings.
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => (hasDemo ? setStep(3) : finish("all"))} disabled={form.working_days.length === 0 || busy}>{hasDemo ? "Continue" : "Finish"}</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                This install came with an example centre: residents, therapists, rooms, therapies
                and three months of bookings, so you could see how it works.
              </p>
              {/* The recommended start comes first: a real centre edits the example therapies and rooms
                  rather than typing them, and only the example people and bookings are in its way (#60). */}
              <div className="grid gap-2">
                <Button className="h-auto min-h-12 whitespace-normal py-2" onClick={() => finish("templates")} disabled={busy}>
                  {busy ? "Setting up…" : "Start my own centre, with the example therapies and rooms"}
                </Button>
                <Button variant="outline" className="h-auto min-h-12 whitespace-normal py-2" onClick={() => finish("all")} disabled={busy}>
                  Keep the example data for now
                </Button>
                <Button variant="ghost" className="h-auto min-h-12 whitespace-normal py-2 text-destructive"
                  onClick={async () => { if (await confirmSheet("Delete all the example residents, therapists, rooms, therapies and bookings?\n\nThis cannot be undone.", "Delete")) finish("none"); }}
                  disabled={busy}>
                  Start completely empty
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You can clear the example data at any time from Settings. Nothing here deletes
                your account.
              </p>
              <div className="flex justify-start">
                <Button variant="ghost" onClick={() => setStep(2)} disabled={busy}>Back</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// The zones a wellness centre is likely to be in; any other is set in Settings.
export const TIMEZONES = ["Asia/Kolkata", "Asia/Colombo", "Asia/Kathmandu", "Asia/Dubai", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Europe/Berlin", "Europe/Prague", "Europe/Madrid", "Africa/Johannesburg", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "UTC"];

export default SetupWizard;
