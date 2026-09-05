import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { UsersSection, ChangePasswordCard } from "@/components/UsersSection";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const SLOT_OPTIONS = [15, 20, 30, 60];
const MAX_LOGO_BYTES = 500 * 1024;

type Settings = {
  centre_name: string;
  address: string | null;
  timezone: string;
  opening_time: string;
  closing_time: string;
  slot_minutes: number;
  working_days: string[];
  logo: string | null;
  demo_data: boolean;
  support_whatsapp: string | null;
  setup_complete: boolean;
};

const Settings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const isAdmin = typeof window !== "undefined" && localStorage.getItem("authRole") === "Admin";

  useEffect(() => {
    fetch(`${API_BASE}/settings`)
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Could not load settings"));
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const toggleDay = (day: string) => {
    if (!settings) return;
    const next = settings.working_days.includes(day)
      ? settings.working_days.filter((d) => d !== day)
      : [...settings.working_days, day];
    update("working_days", next);
  };

  const onLogoPicked = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centre_name: settings.centre_name,
          address: settings.address,
          timezone: settings.timezone,
          opening_time: settings.opening_time,
          closing_time: settings.closing_time,
          slot_minutes: settings.slot_minutes,
          working_days: settings.working_days,
          logo: settings.logo,
          support_whatsapp: settings.support_whatsapp ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not save settings");
        return;
      }
      setSettings(data);
      toast.success("Settings saved");
      // The schedule grid is built from opening hours, so reload to apply them.
      setTimeout(() => window.location.reload(), 600);
    } finally {
      setSaving(false);
    }
  };

  const clearDemoData = async () => {
    if (!window.confirm(
      "Delete all demo patients, staff, rooms, therapies and appointments?\n\n" +
      "Your account and centre settings are kept. This cannot be undone."
    )) return;
    setClearing(true);
    try {
      const res = await fetch(`${API_BASE}/settings/clear-demo-data`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not clear demo data");
        return;
      }
      const d = data.deleted || {};
      toast.success(`Removed ${d.patients ?? 0} patients and ${d.appointments ?? 0} appointments`);
      setTimeout(() => window.location.reload(), 900);
    } finally {
      setClearing(false);
    }
  };

  if (!settings) {
    return <div className="container mx-auto p-6 text-sm text-muted-foreground">Loading settings…</div>;
  }

  return (
    <div className="container mx-auto px-3 md:px-4 py-3 md:py-6 space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Centre details</CardTitle>
          <p className="text-xs text-muted-foreground">
            Shown in the app header and printed at the top of the daily schedule.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="centre_name">Centre name</Label>
            <Input
              id="centre_name"
              value={settings.centre_name}
              onChange={(e) => update("centre_name", e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              rows={2}
              value={settings.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="logo">Logo</Label>
            <div className="flex items-center gap-3">
              {settings.logo && (
                <img src={settings.logo} alt="Centre logo" className="h-10 w-auto rounded border" />
              )}
              <Input
                id="logo"
                type="file"
                accept="image/*"
                className="max-w-xs"
                onChange={(e) => onLogoPicked(e.target.files?.[0])}
                disabled={!isAdmin}
              />
              {settings.logo && isAdmin && (
                <Button variant="ghost" size="sm" onClick={() => update("logo", null)}>Remove</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG or JPG, under 500KB.</p>
          </div>
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="support_whatsapp">Support WhatsApp</Label>
            <Input
              id="support_whatsapp"
              value={settings.support_whatsapp ?? ""}
              onChange={(e) => update("support_whatsapp", e.target.value)}
              placeholder="420777558262"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              International format, no plus sign or leading zero. Shows a WhatsApp button in
              the corner for your staff. Leave empty to hide it.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Opening hours</CardTitle>
          <p className="text-xs text-muted-foreground">
            These decide which time rows the schedule shows and which days can be booked.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="opening_time">Opens</Label>
              <Input
                id="opening_time"
                type="time"
                value={settings.opening_time}
                onChange={(e) => update("opening_time", e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="closing_time">Closes</Label>
              <Input
                id="closing_time"
                type="time"
                value={settings.closing_time}
                onChange={(e) => update("closing_time", e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1">
              <Label>Slot length</Label>
              <Select
                value={String(settings.slot_minutes)}
                onValueChange={(v) => update("slot_minutes", Number(v))}
                disabled={!isAdmin}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={settings.working_days.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                    disabled={!isAdmin}
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1 max-w-xs">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={settings.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="Asia/Kolkata"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">An IANA name, such as Europe/Prague.</p>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}

      <ChangePasswordCard />

      {isAdmin && <UsersSection />}

      {settings.demo_data && isAdmin && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg">Demo data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This install was seeded with example patients, therapists, rooms, therapies and
              appointments so you could try the app straight away. Clear it when you are ready to
              enter your centre's own details. Your account and the settings above are kept.
            </p>
            <Button variant="destructive" onClick={clearDemoData} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear demo data"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Settings are read-only for staff accounts. Ask an administrator to make changes.
        </p>
      )}
    </div>
  );
};

export default Settings;
