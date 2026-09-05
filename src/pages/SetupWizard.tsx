import { useState } from "react";
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

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * Shown once, when an administrator signs in to an install whose settings have
 * never been completed. Three steps, then a choice about the demo data.
 */
const SetupWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    centre_name: "",
    address: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    opening_time: "09:00",
    closing_time: "18:00",
    slot_minutes: 30,
    working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"] as string[],
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (day: string) =>
    set("working_days", form.working_days.includes(day)
      ? form.working_days.filter((d) => d !== day)
      : [...form.working_days, day]);

  const finish = async (keepDemoData: boolean) => {
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
      if (!keepDemoData) {
        const clear = await fetch(`${API_BASE}/settings/clear-demo-data`, { method: "POST" });
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
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
          <CardTitle className="text-lg">
            {step === 1 && "What is your centre called?"}
            {step === 2 && "When are you open?"}
            {step === 3 && "Start with example data?"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-1">
                <Label htmlFor="w_name">Centre name</Label>
                <Input id="w_name" autoFocus value={form.centre_name}
                  onChange={(e) => set("centre_name", e.target.value)}
                  placeholder="Green Valley Ayurveda" />
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
              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-1">
                  <Label>Slot</Label>
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
                <Input id="w_tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                These decide which time rows the schedule shows. You can change them later in Settings.
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={form.working_days.length === 0}>Continue</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                This install came with an example centre — patients, therapists, rooms, therapies
                and a week of appointments — so you could see how it works.
              </p>
              <div className="grid gap-2">
                <Button onClick={() => finish(false)} disabled={busy}>
                  {busy ? "Setting up…" : "Clear it and start with my own centre"}
                </Button>
                <Button
                  variant="secondary"
                  className="border border-border bg-background hover:bg-muted text-foreground"
                  onClick={() => finish(true)}
                  disabled={busy}
                >
                  Keep the example data for now
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

export default SetupWizard;
