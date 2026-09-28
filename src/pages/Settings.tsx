import { useEffect, useState, type ReactNode } from "react";
import { confirmSheet } from "@/components/ConfirmSheet";
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
import { AssistantSection } from "@/components/AssistantSection";
import { BottomSheet } from "@/components/BottomBar";
import PageHead from "@/components/PageHead";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const SLOT_OPTIONS = [15, 20, 30, 60];
const MAX_LOGO_BYTES = 500 * 1024;
const KEEPS: [string, string][] = [["therapies", "Therapies"], ["rooms", "Rooms"], ["team", "Therapists, doctors and their leave"], ["events", "Classes, events and holidays"]];

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
  patient_support_whatsapp: string | null;
  setup_complete: boolean;
  enforce_gender_match: boolean;
  letterhead: Letterhead | null;
};
type Letterhead = { seal_logo: string; name_local: string; registration_line: string; accreditation_line: string; phones: string; email: string; website: string; footer_line: string; discharge_format: string };
const LETTERHEAD: [keyof Letterhead, string, string][] = [
  ["name_local", "Name in a second language", "हिमालय आयुर्वेद रिट्रीट"],
  ["registration_line", "Registration line", "Registered under the Societies Registration Act…"],
  ["accreditation_line", "Accreditation line", "NABH Accreditation No. …"],
  ["phones", "Phones", "+91 5966 000000, +91 90000 00000"],
  ["email", "Email", "care@yourcentre.in"],
  ["website", "Website", "yourcentre.in"],
  ["footer_line", "Footer line", "Corporate office: …"],
  ["discharge_format", "Discharge number", "DS/{YYYY}/{N}"],
];

const Settings = ({ signOut, openLog }: { signOut?: () => void; openLog?: () => void }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [openSheet, setOpenSheet] = useState<string | null>(null);
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

  // The doctors' own lines under their signature: kept on each staff record.
  type Doc = { id: string; name: string; role: string; qualification: string | null; reg_no: string | null; signature: string | null };
  const [doctors, setDoctors] = useState<Doc[]>([]);
  useEffect(() => {
    if (openSheet !== "letterhead") return;
    fetch(`${API_BASE}/staff`).then((r) => r.json()).then((all: Doc[]) => setDoctors(all.filter((x) => x.role === "doctor"))).catch(() => setDoctors([]));
  }, [openSheet]);
  const saveDoctor = async (d: Doc, patch: Partial<Doc>) => {
    setDoctors((all) => all.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    const res = await fetch(`${API_BASE}/staff/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) toast.error(`${d.name} was not saved`);
  };
  const onSignaturePicked = (d: Doc, file: File | undefined) => {
    if (!file) return;
    if (file.size > 250 * 1024) { toast.error("Signature must be under 250KB"); return; }
    const reader = new FileReader();
    reader.onload = () => saveDoctor(d, { signature: String(reader.result) });
    reader.readAsDataURL(file);
  };
  // Printed sheets (#145): what was on the notice board, day by day.
  const [printed, setPrinted] = useState<{ date: string; kind: string; printed_at: string }[] | null>(null);
  useEffect(() => {
    if (openSheet === "printed") fetch(`${API_BASE}/printed-sheets`).then((r) => r.json()).then(setPrinted).catch(() => setPrinted([]));
  }, [openSheet]);
  const openPrinted = async (date: string, kind: string) => {
    const tab = window.open("", "_blank");
    const res = await fetch(`${API_BASE}/printed-sheets/${date}/${kind}`);
    if (!res.ok) { tab?.close(); toast.error("That copy could not be opened"); return; }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.href = url;
  };
  // Backups (#236): when the last one ran, and a copy to keep off the machine.
  const [backups, setBackups] = useState<{ count: number; latest: { name: string; size: number; at: string } | null } | null>(null);
  useEffect(() => {
    if (isAdmin) fetch(`${API_BASE}/settings/backups`).then((r) => (r.ok ? r.json() : null)).then(setBackups).catch(() => setBackups(null));
  }, [isAdmin]);
  const downloadBackup = async () => {
    const res = await fetch(`${API_BASE}/settings/backups/latest`);
    if (!res.ok) { toast.error("No backup to download yet"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = backups?.latest?.name || "ayurcalm-backup.sql.gz";
    a.click();
  };
  const since = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: settings?.timezone || "Asia/Kolkata" });
  const lh = (settings?.letterhead || {}) as Partial<Letterhead>;
  const setLh = (k: keyof Letterhead, v: string) => update("letterhead", { ...lh, [k]: v } as Letterhead);
  const onSealPicked = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) { toast.error("Seal must be under 500KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setLh("seal_logo", String(reader.result));
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
          patient_support_whatsapp: settings.patient_support_whatsapp ?? "",
          enforce_gender_match: settings.enforce_gender_match !== false,
          ...(settings.letterhead ? { letterhead: settings.letterhead } : {}),
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

  // What to keep when the demo goes (#108): its therapies and rooms, by default, to edit rather than retype.
  const [keep, setKeep] = useState<string[]>(["therapies", "rooms"]);
  const clearDemoData = async () => {
    const going = KEEPS.filter(([k]) => !keep.includes(k)).map(([, t]) => t.toLowerCase());
    if (!(await confirmSheet(
      `Delete the demo residents and bookings${going.length ? `, and ${going.join(", ")}` : ""}?\n\n` +
      "Your account and centre settings are kept. This cannot be undone.", "Delete"
    ))) return;
    setClearing(true);
    try {
      const res = await fetch(`${API_BASE}/settings/clear-demo-data`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep }) });
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

  const resetDemoData = async () => {
    if (!(await confirmSheet(
      "Replace the demo data with a fresh four months starting today?\n\n" +
      "Any changes made to demo patients and bookings are lost. Your account and centre settings are kept.", "Replace"
    ))) return;
    setClearing(true);
    try {
      const res = await fetch(`${API_BASE}/settings/reset-demo-data`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not reset demo data");
        return;
      }
      toast.success("Demo data rebuilt from today");
      setTimeout(() => window.location.reload(), 900);
    } finally {
      setClearing(false);
    }
  };

  // The design's pattern (#178): a plain list of rows; each opens its form in a bottom sheet.
  const rowClass = "flex min-h-14 w-full items-center border-b border-border px-4 py-2 text-left last:border-b-0";
  const row = (key: string, title: string, hint: string) => (
    <button key={key} type="button" className={rowClass} onClick={() => setOpenSheet(key)}>
      <span className="flex-1"><b className="block text-[16px]">{title}</b><span className="block text-[13px] text-muted-foreground">{hint}</span></span>
      <span className="text-muted-foreground">›</span>
    </button>
  );
  // The section's own card loses its frame and heading inside the sheet, which names it already.
  const sheet = (key: string, title: string, content: ReactNode) => (
    <BottomSheet open={openSheet === key} onOpenChange={(o) => setOpenSheet(o ? key : null)} title={title}>
      <div className="max-h-[75dvh] space-y-3 overflow-y-auto [&_.rounded-lg.border]:border-0 [&_.rounded-lg.border]:shadow-none [&_h3]:hidden [&_.p-6]:px-0">{content}</div>
    </BottomSheet>
  );

  if (!settings) {
    return <div className="container mx-auto p-6 text-sm text-muted-foreground">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <PageHead title="Settings" />
      {/* Here rather than on the menu, as the design has it (#67). */}
      {openLog ? (
        <button type="button" className="flex min-h-12 w-full items-center rounded-2xl bg-card px-4 text-left" onClick={openLog}>
          <span className="flex-1"><b className="block text-[16px]">Log</b><span className="block text-[13px] text-muted-foreground">Everything that changed, and who changed it</span></span>
          <span className="text-muted-foreground">›</span>
        </button>
      ) : null}
      <div className="overflow-hidden rounded-2xl bg-card">
      {row("centre", "Centre details", settings.centre_name || "Name, address and logo")}
      {row("letterhead", "Discharge letterhead", lh.discharge_format ? `Numbers like ${lh.discharge_format}` : "Seal, phones, registration, footer")}
      {row("hours", "Opening hours", `${settings.opening_time}–${settings.closing_time}`)}
      {row("support", "Support contacts", settings.support_whatsapp ? "WhatsApp button shown" : "No WhatsApp button")}
      {isAdmin ? row("backups", "Backups", backups?.latest ? `Last ${since(backups.latest.at)}` : "No backup yet") : null}
      {row("printed", "Printed sheets", "Each day's sheets as last printed, 90 days")}
      {settings.support_whatsapp ? (
        <a className={rowClass} href={`https://wa.me/${settings.support_whatsapp}?text=${encodeURIComponent("AyurCalm: a problem or an idea from " + settings.centre_name + ": ")}`} target="_blank" rel="noopener noreferrer">
          <span className="flex-1"><b className="block text-[16px]">Report a problem or an idea</b><span className="block text-[13px] text-muted-foreground">On WhatsApp, straight to whoever looks after this app</span></span>
          <span className="text-muted-foreground">›</span>
        </a>
      ) : null}
      {row("password", "Your password", "Change it")}
      {isAdmin ? row("assistant", "Your AI assistant", "Optional: connect Claude") : null}
      {isAdmin ? row("people", "People with access", "Who can sign in") : null}
      {settings.demo_data && isAdmin ? row("demo", "Demo data", "Clear it, or reset it from today") : null}
      </div>
      {signOut ? <Button variant="outline" className="min-h-11 w-full rounded-full" onClick={signOut}>Sign out</Button> : null}

      {sheet("centre", "Centre details", <>
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
                accept="image/png,image/jpeg"
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
        </CardContent>
      </Card>
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
      </>)}
      {sheet("backups", "Backups", <>
      <p className="text-sm text-muted-foreground">Everything in the app is backed up when it starts and every night at 02:30, and the newest 14 are kept on the computer that runs it. Keep a copy somewhere else too: download the newest now and then, and save it to your phone or email it to yourself.</p>
      <div className="rounded-xl border p-3 text-[15px]">
        {backups?.latest ? <>Newest: <b>{since(backups.latest.at)}</b> · {(backups.latest.size / 1024 / 1024).toFixed(1)} MB · {backups.count} kept</> : "No backup yet. Ask whoever set up the app to check the backup service is running."}
      </div>
      {backups?.latest ? <Button className="min-h-11 w-full rounded-full" onClick={downloadBackup}>Download the newest backup</Button> : null}
      </>)}
      {sheet("printed", "Printed sheets", <>
      <p className="text-xs text-muted-foreground">The last copy printed for each day. Printing a day again replaces its copy; copies older than 90 days are removed.</p>
      {printed === null ? <div className="py-4 text-center text-muted-foreground">…</div> : printed.length === 0 ? <div className="py-4 text-center text-muted-foreground">Nothing printed yet.</div> : (
        <div className="overflow-hidden rounded-xl border">
          {[...new Set(printed.map((p) => p.date))].map((date) => (
            <div key={date} className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="flex-1 font-semibold">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
              {printed.filter((p) => p.date === date).map((p) => (
                <Button key={p.kind} variant="outline" className="min-h-11 rounded-full" onClick={() => openPrinted(date, p.kind)}>{{ residents: "Residents", therapist: "Therapists", doctor: "Doctors" }[p.kind] ?? p.kind}</Button>
              ))}
            </div>
          ))}
        </div>
      )}
      </>)}
      {sheet("letterhead", "Discharge letterhead", <>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Printed at the top of every discharge summary, under the centre name, address and logo from Centre details. {"{YYYY}"} in the number is the year, {"{N}"} counts summaries.</p>
        <div className="space-y-1">
          <Label htmlFor="seal_logo">Right-hand logo or seal (optional)</Label>
          <div className="flex items-center gap-3">
            {lh.seal_logo ? <img src={lh.seal_logo} alt="Seal" className="h-10 w-auto rounded border" /> : null}
            <Input id="seal_logo" type="file" accept="image/png,image/jpeg" className="max-w-xs" onChange={(e) => onSealPicked(e.target.files?.[0])} disabled={!isAdmin} />
            {lh.seal_logo && isAdmin ? <Button variant="ghost" size="sm" onClick={() => setLh("seal_logo", "")}>Remove</Button> : null}
          </div>
        </div>
        {LETTERHEAD.map(([k, label, hint]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`lh_${k}`}>{label}</Label>
            <Input id={`lh_${k}`} placeholder={hint} value={lh[k] ?? ""} onChange={(e) => setLh(k, e.target.value)} disabled={!isAdmin} />
          </div>
        ))}
        {isAdmin ? <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save letterhead"}</Button></div> : null}
        {doctors.map((d) => (
          <div key={d.id} className="space-y-2 rounded-xl border p-3" aria-label={`Doctor ${d.name}`}>
            <div className="font-semibold">{d.name}</div>
            <p className="text-xs text-muted-foreground">Printed under their signature. Saved as you leave each box.</p>
            <div className="space-y-1"><Label htmlFor={`q_${d.id}`}>Qualification</Label>
              <Input id={`q_${d.id}`} placeholder="BAMS, MD (Panchakarma)" defaultValue={d.qualification ?? ""} disabled={!isAdmin} onBlur={(e) => e.target.value !== (d.qualification ?? "") && saveDoctor(d, { qualification: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`r_${d.id}`}>Registration no.</Label>
              <Input id={`r_${d.id}`} defaultValue={d.reg_no ?? ""} disabled={!isAdmin} onBlur={(e) => e.target.value !== (d.reg_no ?? "") && saveDoctor(d, { reg_no: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`s_${d.id}`}>Signature (photo, optional)</Label>
              <div className="flex items-center gap-3">
                {d.signature ? <img src={d.signature} alt={`${d.name}'s signature`} className="h-10 w-auto rounded border bg-white" /> : null}
                <Input id={`s_${d.id}`} type="file" accept="image/png,image/jpeg" className="max-w-xs" disabled={!isAdmin} onChange={(e) => onSignaturePicked(d, e.target.files?.[0])} />
                {d.signature && isAdmin ? <Button variant="ghost" size="sm" onClick={() => saveDoctor(d, { signature: null })}>Remove</Button> : null}
              </div></div>
          </div>
        ))}
      </div>
      </>)}
      {sheet("hours", "Opening hours", <>
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
            <Label>Gender matching</Label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={settings.enforce_gender_match !== false}
                onCheckedChange={(v) => update("enforce_gender_match", !!v)}
                disabled={!isAdmin}
              />
              <span>
                Only book a therapy that requires a gender match with a matching therapist.
                <span className="block text-muted-foreground text-xs">Turn this off only if your centre asks the resident and works to their answer.</span>
              </span>
            </label>
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
            <p className="text-xs text-muted-foreground">An IANA name, such as Asia/Kolkata.</p>
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
      </>)}
      {sheet("support", "Support contacts", <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Support contacts</CardTitle>
          <p className="text-xs text-muted-foreground">
            Two WhatsApp numbers, shown as a button in the corner to different people.
            International format, no plus sign or leading zero. Leave one empty to hide
            its button.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="support_whatsapp">Help with this app — for you and your staff</Label>
            <Input
              id="support_whatsapp"
              className="max-w-xs"
              value={settings.support_whatsapp ?? ""}
              onChange={(e) => update("support_whatsapp", e.target.value)}
              placeholder="420777558262"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Whoever supports the software itself — bugs, questions, how something works.
              Shown to signed-in administrators and staff. Set to the project maintainer by
              default; change it if your organisation has its own IT support.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="patient_support_whatsapp">Contact for patients — your reception</Label>
            <Input
              id="patient_support_whatsapp"
              className="max-w-xs"
              value={settings.patient_support_whatsapp ?? ""}
              onChange={(e) => update("patient_support_whatsapp", e.target.value)}
              placeholder="420777558262"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Kept for the patient schedule link, which is not built yet, so this number
              is not shown anywhere today.
              <strong className="font-medium"> Set it to your own centre's number</strong> —
              patients asking about their appointment should reach you, not the software
              maintainer.
            </p>
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
      </>)}
      {sheet("password", "Your password", <ChangePasswordCard />)}
      {sheet("assistant", "Your AI assistant", <AssistantSection />)}
      {sheet("people", "People with access", <UsersSection />)}
      {sheet("demo", "Demo data", <>
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg">Demo data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This install was seeded with example patients, therapists, rooms, therapies and
              appointments so you could try the app straight away. Clear it when you are ready to
              enter your centre's own details, or reset it to get four fresh months of bookings from today.
              Your account and the settings above are kept.
            </p>
            <fieldset className="space-y-1">
              <legend className="text-sm font-semibold">Keep when clearing</legend>
              <p className="text-xs text-muted-foreground">Residents and bookings always go. Standard therapies can be brought back later from the therapy library.</p>
              {KEEPS.map(([k, t]) => (
                <label key={k} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 min-h-0 min-w-0 flex-none" checked={keep.includes(k)} onChange={(e) => setKeep(e.target.checked ? [...keep, k] : keep.filter((x) => x !== k))} />
                  <span>{t}</span>
                </label>
              ))}
            </fieldset>
            <Button variant="destructive" onClick={clearDemoData} disabled={clearing}>
              {clearing ? "Working… (up to two minutes)" : "Clear demo data"}
            </Button>
            <Button variant="outline" className="ml-2" onClick={resetDemoData} disabled={clearing}>
              Reset demo data from today
            </Button>
          </CardContent>
        </Card>
      </>)}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Settings are read-only for staff accounts. Ask an administrator to make changes.
        </p>
      )}
    </div>
  );
};

export default Settings;
