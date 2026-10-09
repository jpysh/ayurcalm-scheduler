/**
 * Settings, the front door (#285 session 7, #288): groups of rows that say their
 * own state, and one sheet each. The setup card above them counts what the admin
 * has looked at; everything works on the defaults from minute one, so nothing
 * here blocks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { useTrial } from "@/lib/centreName";
import { ZoneOptions } from "@/pages/SetupWizard";
import { AssistantSection } from "@/components/AssistantSection";
import { AccommodationEditor, PackagesEditor } from "@/components/Catalogues";
import { BackupsSheet, HelpSheet, PrintedSheet, ago, type Backups } from "@/components/SettingsMore";
import { ChangePasswordCard, UsersSection } from "@/components/UsersSection";
import PageHead from "@/components/PageHead";
import type { Attention } from "@/lib/attention";
import {
  Area, BottomSheet, ChecklistBar, Days, Dropdown, Group, ListGroup, Loading, PickPhoto, Row, Seg, SectionHead, SheetFoot, Switch, Text, TimeList, WEEK, noteText, timesBetween, Btn, dayText, setCurrency } from "@/components/kit";

const DAY_TIMES = timesBetween("00:00", "23:30", 30);
const SLOT_OPTIONS = [15, 20, 30, 60];
const MAX_LOGO_BYTES = 500 * 1024;

type Letterhead = { seal_logo: string; name_local: string; registration_line: string; accreditation_line: string; phones: string; email: string; website: string; footer_line: string; discharge_format: string };
type Settings = {
  centre_name: string; address: string | null; currency?: string; timezone: string; opening_time: string; closing_time: string; slot_minutes: number; working_days: string[];
  logo: string | null; demo_data: boolean; support_whatsapp: string | null; patient_support_whatsapp: string | null; setup_complete: boolean;
  enforce_gender_match: boolean; max_treatments_per_day?: number; letterhead: Letterhead | null; plan: string | null; show_footer: boolean; setup_reviewed: string[];
};
type Doc = { id: string; name: string; role: string; qualification: string | null; reg_no: string | null; signature: string | null };

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
const SHORT = (d: string) => d[0].toUpperCase() + d.slice(1, 3);
/** "Mon–Sat", or the days named when they are not one run. */
export const daysText = (days: string[]) => {
  const on = WEEK.filter((d) => days.includes(d));
  const first = WEEK.indexOf(on[0]);
  const run = on.length > 2 && on.every((d, i) => WEEK[first + i] === d);
  return run ? `${SHORT(on[0])}–${SHORT(on[on.length - 1])}` : on.map(SHORT).join(", ") || "Closed";
};

type Sheet = "centre" | "hours" | "catalogues" | "people" | "account" | "backups" | "printed" | "help" | "checklist";
/** Opening a sheet counts as looking at its setup items; one sheet can cover two. */
const REVIEWS: Partial<Record<Sheet, string>> = { centre: "centre", hours: "hours", catalogues: "catalogues", people: "people" };

const Settings = ({ signOut, openLog, initialSheet, sheetOpened, attention, openRules, openHolidays }: {
  signOut?: () => void; openLog?: () => void;
  /** A sheet to open at once, from a link on another screen ("Edit the list"). */
  initialSheet?: string | null; sheetOpened?: () => void;
  attention: Attention; openRules: () => void; openHolidays: () => void;
}) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(initialSheet === "packages" || initialSheet === "accommodation" ? "catalogues" : null);
  useEffect(() => { if (initialSheet) sheetOpened?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const trial = useTrial();
  const isAdmin = typeof window !== "undefined" && localStorage.getItem("authRole") === "Admin";

  useEffect(() => {
    fetch(`${API_BASE}/settings`).then((r) => r.json()).then(setSettings).catch(() => toast.error("Could not load settings"));
  }, []);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s));

  const [backups, setBackups] = useState<Backups | null>(null);
  const [people, setPeople] = useState<number | null>(null);
  const [lastPrint, setLastPrint] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/log`).then((r) => (r.ok ? r.json() : { entries: [] })).then((d: { entries?: { at: string }[] }) => setLastChange(d.entries?.[0]?.at ?? null)).catch(() => setLastChange(null));
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API_BASE}/settings/backups`).then((r) => (r.ok ? r.json() : null)).then(setBackups).catch(() => setBackups(null));
    fetch(`${API_BASE}/printed-sheets`).then((r) => (r.ok ? r.json() : [])).then((l: { date: string }[]) => setLastPrint(l[0]?.date ?? null)).catch(() => setLastPrint(null));
  }, [isAdmin]);

  // Told to the server once per item: each PUT is a logged write, and opening a sheet again changes nothing (#550).
  const told = useRef<string[]>([]);
  const reviewed = useCallback((item: string) => {
    if (!isAdmin || told.current.includes(item)) return;
    told.current.push(item);
    setSettings((s) => (s && !s.setup_reviewed.includes(item) ? { ...s, setup_reviewed: [...s.setup_reviewed, item] } : s));
    fetch(`${API_BASE}/settings/setup-reviewed`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) }).catch(() => { told.current = told.current.filter((x) => x !== item); /* counted again next time */ });
  }, [isAdmin]);
  useEffect(() => { if (settings) told.current = [...new Set([...told.current, ...settings.setup_reviewed])]; }, [settings]);
  const show = (s: Sheet) => { setSheet(s); const item = REVIEWS[s]; if (item) reviewed(item); };
  const showRules = () => { reviewed("rules"); openRules(); };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centre_name: settings.centre_name, address: settings.address, currency: settings.currency || "Rs", timezone: settings.timezone, opening_time: settings.opening_time, closing_time: settings.closing_time,
          slot_minutes: settings.slot_minutes, working_days: settings.working_days, logo: settings.logo,
          support_whatsapp: settings.support_whatsapp ?? "", patient_support_whatsapp: settings.patient_support_whatsapp ?? "",
          enforce_gender_match: settings.enforce_gender_match !== false, max_treatments_per_day: settings.max_treatments_per_day ?? 4, show_footer: settings.show_footer !== false,
          ...(settings.letterhead ? { letterhead: settings.letterhead } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not save settings"); return; }
      setSettings(data);
      toast.success("Settings saved");
      // The schedule grid is built from opening hours, so reload to apply them.
      setTimeout(() => window.location.reload(), 600);
    } finally { setSaving(false); }
  };

  const pick = (max: number, what: string, then: (data: string) => void) => (file: File | undefined) => {
    if (!file) return;
    if (file.size > max) { toast.error(`${what} must be under ${Math.round(max / 1024)}KB`); return; }
    const reader = new FileReader();
    reader.onload = () => then(String(reader.result));
    reader.readAsDataURL(file);
  };
  const lh = (settings?.letterhead || {}) as Partial<Letterhead>;
  const setLh = (k: keyof Letterhead, v: string) => update("letterhead", { ...lh, [k]: v } as Letterhead);

  // The doctors' own lines under their signature: kept on each staff record, saved as each box is left.
  const [doctors, setDoctors] = useState<Doc[]>([]);
  useEffect(() => {
    if (sheet !== "centre") return;
    fetch(`${API_BASE}/staff`).then((r) => r.json()).then((all: Doc[]) => setDoctors(all.filter((x) => x.role === "doctor"))).catch(() => setDoctors([]));
  }, [sheet]);
  const saveDoctor = async (d: Doc, patch: Partial<Doc>) => {
    setDoctors((all) => all.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    const res = await fetch(`${API_BASE}/staff/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) toast.error(`${d.name} was not saved`);
  };

  if (!settings) return <Loading rows={6} />;

  const rules = attention.rules;
  // What the Menu says: one row a patient (#370), so five patients with three things each are five, not fifteen (#526).
  const raised = new Set(attention.items.filter((i) => i.kind === "action").map((i) => i.patient_id ?? i.id)).size + (rules.find((r) => r.id === "day")?.count ?? 0);
  const rulesFact = rules.length ? `${rules.filter((r) => r.on).length} of ${rules.length} on · ${raised ? `the pill shows ${raised} today` : "nothing on the pill today"}` : "What shows on the pill";
  const hoursFact = `${daysText(settings.working_days)} · ${settings.opening_time}–${settings.closing_time}`;
  const SETUP: { key: string; sheet: () => void; title: string; now: string }[] = [
    { key: "hours", title: "Opening hours", now: hoursFact, sheet: () => show("hours") },
    { key: "rules", title: "What needs you", now: rulesFact, sheet: showRules },
    { key: "centre", title: "Centre and letterhead", now: settings.centre_name, sheet: () => show("centre") },
    { key: "catalogues", title: "Packages and accommodation", now: "The lists a patient's card picks from", sheet: () => show("catalogues") },
    { key: "people", title: "People with access", now: "Who can sign in", sheet: () => show("people") },
  ];
  const done = SETUP.filter((x) => settings.setup_reviewed.includes(x.key)).length;

  return (
    <div>
      <PageHead title="Settings" />
      {isAdmin && done < SETUP.length ? <div className="mb-1"><ChecklistBar label="Set up your centre" unit="reviewed" done={done} total={SETUP.length} onClick={() => setSheet("checklist")} /></div> : null}

      {isAdmin ? (
        <ListGroup title="Every day">
          <Row title="What needs you" facts={rulesFact} trailing="›" onClick={showRules} />
          <Row title="Printed sheets" facts={lastPrint ? `Last printed for ${dayText(lastPrint)}` : "Nothing printed yet"} trailing="›" onClick={() => setSheet("printed")} />
          <Row title="People with access" facts={people === null ? "Who can sign in" : `${people} ${people === 1 ? "person" : "people"} can sign in`} trailing="›" onClick={() => show("people")} />
        </ListGroup>
      ) : null}

      <ListGroup title="Your centre">
        <Row title="Centre and letterhead" facts={settings.centre_name} trailing="›" onClick={() => show("centre")} />
        <Row title="Opening hours and holidays" facts={hoursFact} trailing="›" onClick={() => show("hours")} />
        {isAdmin ? <Row title="Packages and accommodation" facts="The lists a patient's card picks from" trailing="›" onClick={() => show("catalogues")} /> : null}
      </ListGroup>

      <ListGroup title="Safety">
        {isAdmin ? <Row title="Backups" facts={backups?.latest ? `Last backup ${ago(backups.latest.at)}` : "No backup yet"} trailing="›" onClick={() => setSheet("backups")} /> : null}
        {openLog ? <Row title="Log" facts={lastChange ? `Last change ${ago(lastChange)}` : "Everything that changed, and who changed it"} trailing="›" onClick={openLog} /> : null}
      </ListGroup>

      <ListGroup title="You and the app">
        <Row title="Your account" facts={isAdmin ? "Password and your AI assistant" : "Password"} trailing="›" onClick={() => setSheet("account")} />
        <Row title="Help and plan" facts={trial && isAdmin ? "Report a problem, invite a centre, plan" : "Report a problem"} trailing="›" onClick={() => setSheet("help")} />
      </ListGroup>
      {signOut ? <Btn kind="secondary" className="mt-4" onClick={signOut}>Sign out</Btn> : null}
      {!isAdmin ? <p className={`mt-3 ${noteText}`}>Settings are read-only for staff accounts. Ask an administrator to make changes.</p> : null}

      <BottomSheet open={sheet === "checklist"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="Set up your centre" note={`${done} of ${SETUP.length} reviewed. Everything works on the defaults below; review each at your own pace.`}>
        <ListGroup>
          {SETUP.map((x) => (
            <Row key={x.key} title={x.title} facts={`Now: ${x.now}`} trailing={settings.setup_reviewed.includes(x.key) ? "✓ Reviewed" : "Review ›"} onClick={() => { setSheet(null); x.sheet(); }} />
          ))}
        </ListGroup>
      </BottomSheet>

      {/* Centre, letterhead and the support numbers: one scroll, headed parts, one Save. */}
      <BottomSheet open={sheet === "centre"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="Centre and letterhead" note="Printed at the top of every sheet, and on each discharge summary."
        foot={isAdmin ? <SheetFoot busy={saving} save={save} label="Save" /> : undefined}>
        <fieldset disabled={!isAdmin} className="m-0 min-w-0 border-0 p-0">
          <Text label="Centre name" id="centre_name" value={settings.centre_name} onChange={(e) => update("centre_name", e.target.value)} />
          <Text label="Currency symbol" id="currency" maxLength={4} note="Shown before the prices of packages and rooms, for reference. For example Rs, $, €." value={settings.currency ?? "Rs"} onChange={(e) => { update("currency", e.target.value); setCurrency(e.target.value); }} />
          <Area label="Address (optional)" id="address" rows={2} value={settings.address ?? ""} onChange={(e) => update("address", e.target.value)} />
          <Group label="Logo (optional)" note="PNG or JPG, under 500KB.">
            <div className="flex items-center gap-3">
              {settings.logo ? <img src={settings.logo} alt="Centre logo" className="h-10 w-auto rounded border" /> : null}
              <PickPhoto id="logo" has={!!settings.logo} disabled={!isAdmin} onPick={pick(MAX_LOGO_BYTES, "The logo", (d) => update("logo", d))} />
              {settings.logo && isAdmin ? <Btn kind="destructive" inline onClick={() => update("logo", null)}>Remove</Btn> : null}
            </div>
          </Group>

          <SectionHead>Discharge letterhead</SectionHead>
          <p className={`mb-1 ${noteText}`}>Printed under the name and logo. {"{YYYY}"} in the number is the year, {"{N}"} counts summaries. All optional.</p>
          <Group label="Right-hand logo or seal (optional)">
            <div className="flex items-center gap-3">
              {lh.seal_logo ? <img src={lh.seal_logo} alt="Seal" className="h-10 w-auto rounded border" /> : null}
              <PickPhoto id="seal_logo" has={!!lh.seal_logo} disabled={!isAdmin} onPick={pick(MAX_LOGO_BYTES, "The seal", (d) => setLh("seal_logo", d))} />
              {lh.seal_logo && isAdmin ? <Btn kind="destructive" inline onClick={() => setLh("seal_logo", "")}>Remove</Btn> : null}
            </div>
          </Group>
          {LETTERHEAD.map(([k, label, hint]) => <Text key={k} label={`${label} (optional)`} id={`lh_${k}`} placeholder={hint} value={lh[k] ?? ""} onChange={(e) => setLh(k, e.target.value)} />)}

          {doctors.length ? <SectionHead>Doctors under their signature</SectionHead> : null}
          {doctors.map((d) => (
            <div key={d.id} role="group" aria-label={`Doctor ${d.name}`} className="mb-2 rounded-xl border px-3 pb-3 pt-2">
              <div className="text-base font-semibold">{d.name}</div>
              <Text label="Qualification (optional)" id={`q_${d.id}`} placeholder="BAMS, MD (Panchakarma)" defaultValue={d.qualification ?? ""} onBlur={(e) => e.target.value !== (d.qualification ?? "") && saveDoctor(d, { qualification: e.target.value })} />
              <Text label="Registration number (optional)" id={`r_${d.id}`} defaultValue={d.reg_no ?? ""} onBlur={(e) => e.target.value !== (d.reg_no ?? "") && saveDoctor(d, { reg_no: e.target.value })} />
              <Group label="Signature, a photo (optional)">
                <div className="flex items-center gap-3">
                  {d.signature ? <img src={d.signature} alt={`${d.name}'s signature`} className="h-10 w-auto rounded border bg-white" /> : null}
                  <PickPhoto id={`s_${d.id}`} has={!!d.signature} disabled={!isAdmin} onPick={pick(250 * 1024, "The signature", (s) => saveDoctor(d, { signature: s }))} />
                  {d.signature && isAdmin ? <Btn kind="destructive" inline onClick={() => saveDoctor(d, { signature: null })}>Remove</Btn> : null}
                </div>
              </Group>
              <p className={`mt-1 ${noteText}`}>Saved as you leave each box.</p>
            </div>
          ))}

          <SectionHead>Support contacts</SectionHead>
          <p className={`mb-1 ${noteText}`}>WhatsApp numbers shown as a button in the corner. International format, no plus sign or leading zero; empty hides the button.</p>
          <Text label="Help with this app, for you and your staff (optional)" id="support_whatsapp" inputMode="tel" placeholder="420777558262" note="Whoever supports the software itself. Set to the project maintainer by default." value={settings.support_whatsapp ?? ""} onChange={(e) => update("support_whatsapp", e.target.value)} />
          <Text label="Contact for patients, your reception (optional)" id="patient_support_whatsapp" inputMode="tel" placeholder="420777558262" note="Shown on each patient's own link as WhatsApp reception. Hidden while it is the same as the number above." value={settings.patient_support_whatsapp ?? ""} onChange={(e) => update("patient_support_whatsapp", e.target.value)} />
        </fieldset>
      </BottomSheet>

      <BottomSheet open={sheet === "hours"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="Opening hours and holidays" note="The times the day shows, and the days that can be booked."
        foot={isAdmin ? <SheetFoot busy={saving} save={save} /> : undefined}>
        <fieldset disabled={!isAdmin} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-2 gap-3">
            <TimeList label="Opens" times={DAY_TIMES} value={settings.opening_time} onChange={(t) => update("opening_time", t)} />
            <TimeList label="Closes" times={DAY_TIMES} after={settings.opening_time} value={settings.closing_time} onChange={(t) => update("closing_time", t)} />
          </div>
          <Group label="Open on"><Days value={settings.working_days} onChange={(d) => update("working_days", d)} /></Group>
          <Group label="Each time slot is">
            <Seg options={[...new Set([...SLOT_OPTIONS, settings.slot_minutes])].sort((a, b) => a - b).map((m) => [m, `${m} min`] as [number, string])} value={settings.slot_minutes} onChange={(m) => update("slot_minutes", m)} />
          </Group>
          <Dropdown label="Timezone" id="timezone" value={settings.timezone} onChange={(e) => update("timezone", e.target.value)}>
            <ZoneOptions also={settings.timezone} />
          </Dropdown>
          <Group label="Most treatments for one patient in a day">
            <Seg options={[2, 3, 4, 5, 6, 8].map((n) => [n, String(n)] as [number, string])} value={settings.max_treatments_per_day ?? 4} onChange={(n) => update("max_treatments_per_day", n)} />
          </Group>
          <Switch label="Match the therapist's gender" note="Only for therapies that ask for it." on={settings.enforce_gender_match !== false} set={(v) => update("enforce_gender_match", v)} />
        </fieldset>
        {isAdmin ? <div className="mt-3"><ListGroup><Row title="Public holidays" facts="Close the centre on India's gazetted days" trailing="›" onClick={() => { setSheet(null); openHolidays(); }} /></ListGroup></div> : null}
      </BottomSheet>

      <BottomSheet open={sheet === "catalogues"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="Packages and accommodation" note="The lists a patient's card picks from. Reference only: nothing here bills.">
        <SectionHead>Packages</SectionHead>
        <PackagesEditor />
        <SectionHead>Accommodation</SectionHead>
        <AccommodationEditor />
      </BottomSheet>

      <BottomSheet open={sheet === "people"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="People with access">
        {isAdmin ? <UsersSection onCount={setPeople} /> : null}
      </BottomSheet>

      <BottomSheet open={sheet === "account"} onOpenChange={(o) => { if (!o) setSheet(null); }} title="Your account">
        <SectionHead>Password</SectionHead>
        <ChangePasswordCard />
        {isAdmin ? <><SectionHead>Your AI assistant</SectionHead><AssistantSection /></> : null}
      </BottomSheet>

      <BackupsSheet open={sheet === "backups"} onOpenChange={(o) => { if (!o) setSheet(null); }} backups={backups} />
      <PrintedSheet open={sheet === "printed"} onOpenChange={(o) => { if (!o) setSheet(null); }} />
      <HelpSheet open={sheet === "help"} onOpenChange={(o) => { if (!o) setSheet(null); }} centre={settings.centre_name} supportWhatsapp={settings.support_whatsapp} trial={trial} demo={settings.demo_data} admin={isAdmin}
        showFooter={settings.show_footer !== false} setShowFooter={(v) => update("show_footer", v)} saveFooter={save} />
    </div>
  );
};

export default Settings;
