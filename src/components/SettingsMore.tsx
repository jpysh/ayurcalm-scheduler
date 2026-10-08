/**
 * The Settings sheets that read and act rather than edit the centre's own
 * fields (#285 session 7): Backups, Printed sheets, and Help and plan with its
 * Plan and Demo data sheets. Each is one sheet, built from the kit.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PRODUCT, PLANS, SALES_WHATSAPP } from "../../server/src/product";
import { API_BASE } from "@/lib/apiBase";
import { confirmSheet } from "@/components/ConfirmSheet";
import { BottomSheet, ChangeLine, Empty, LineSelect, ListGroup, Row, SheetFoot, Switch, Tick, dayText, noteText, say, wide, Btn } from "@/components/kit";

export type Backups = { count: number; latest: { name: string; size: number; at: string } | null };
export type Trial = { ends_at: string | null; read_only: boolean; plan: string | null; paid_until: string | null };

export const planHint = (t: Trial) => {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (t.plan) return `${PLANS.find((p) => p.id === t.plan)?.name ?? t.plan}${t.paid_until ? `, paid until ${day(t.paid_until)}` : ""}${t.read_only ? " (overdue)" : ""}`;
  if (!t.ends_at) return "Free trial: 30 days start with your first patient or printed sheet";
  if (t.read_only) return "Free trial ended: read-only, nothing deleted";
  const d = Math.ceil((Date.parse(t.ends_at) - Date.now()) / 86400000);
  return `Free trial: ${d} ${d === 1 ? "day" : "days"} left`;
};

/** "2 hours ago", "yesterday", or the day: how long since, the way a person says it. */
export const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600000);
  if (h < 1) return "less than an hour ago";
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export function BackupsSheet({ open, onOpenChange, backups }: { open: boolean; onOpenChange: (o: boolean) => void; backups: Backups | null }) {
  const [moving, setMoving] = useState(false);
  const download = async () => {
    const res = await fetch(`${API_BASE}/settings/backups/latest`);
    if (!res.ok) { toast.error("No backup to download yet"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = backups?.latest?.name || "ayurcalm-backup.sql.gz";
    a.click();
  };
  // Moving to or from another install (#231): one file with the whole centre.
  const exportCentre = async () => {
    setMoving(true);
    try {
      const res = await fetch(`${API_BASE}/settings/export`);
      if (!res.ok) { toast.error("The export could not be made"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = `ayurcalm-export-${new Date().toISOString().slice(0, 10)}.json.gz`;
      a.click();
    } finally { setMoving(false); }
  };
  const importCentre = async (file: File | undefined) => {
    if (!file) return;
    if (!(await confirmSheet("Replace everything in this app with the centre in this file?\n\nEveryone signs in again afterwards, with the passwords from the other install.", "Replace"))) return;
    setMoving(true);
    try {
      const res = await fetch(`${API_BASE}/settings/import`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "That file could not be loaded", { duration: 10000 }); return; }
      toast.success("Loaded. Sign in again.");
      setTimeout(() => window.location.reload(), 1200);
    } finally { setMoving(false); }
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Backups" note="Backed up ten minutes after the app starts and every night at 02:30; the newest 14 stay on the computer that runs it."
      foot={backups?.latest ? <Btn kind="primary" onClick={download}>Download the newest backup</Btn> : undefined}>
      <ListGroup>
        <Row title={backups?.latest ? `Newest ${ago(backups.latest.at)}` : "No backup yet"}
          facts={backups?.latest ? `${(backups.latest.size / 1024 / 1024).toFixed(1)} MB · ${backups.count} kept` : "Ask whoever set up the app to check the backup service is running."} />
      </ListGroup>
      <p className={`mt-2 ${noteText}`}>Keep a copy somewhere else too: download the newest now and then, and save it to your phone or email it to yourself.</p>
      <ListGroup title={`Move to another ${PRODUCT}`}>
        <div className="grid gap-2 p-3">
          <p className={noteText}>From the cloud to your own computer, or back: download everything as one file, then load it into the other one. Loading replaces whatever that install holds, so do it on a new one.</p>
          <Btn kind="secondary" disabled={moving} onClick={exportCentre}>{moving ? "Working…" : "Download everything"}</Btn>
          <label className={`${wide} flex cursor-pointer items-center justify-center border`}>
            Load a centre from a file
            <input type="file" accept=".gz,application/gzip" className="sr-only" disabled={moving} onChange={(e) => { void importCentre(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </ListGroup>
    </BottomSheet>
  );
}

type Printed = { date: string; kind: string; printed_at: string };
const KIND: Record<string, string> = { residents: "Patients", therapist: "Therapists", doctor: "Doctors", kitchen: "Kitchen", rooms: "Guest rooms" };

export function PrintedSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [printed, setPrinted] = useState<Printed[] | null>(null);
  useEffect(() => { if (open) fetch(`${API_BASE}/printed-sheets`).then((r) => r.json()).then(setPrinted).catch(() => setPrinted([])); }, [open]);
  const openOne = async (date: string, kind: string) => {
    const tab = window.open("", "_blank");
    const res = await fetch(`${API_BASE}/printed-sheets/${date}/${kind}`);
    if (!res.ok) { tab?.close(); toast.error("That copy could not be opened"); return; }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.href = url;
  };
  const days = [...new Set((printed ?? []).map((p) => p.date))];
  // Records for a month (#488): the last twelve, this month first.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, name: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) }; });
  const records = async (month: string) => {
    const tab = window.open("", "_blank");
    const res = await fetch(`${API_BASE}/records-pdf?month=${month}`);
    if (!res.ok) { tab?.close(); toast.error("The records could not be made"); return; }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.href = url;
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Printed sheets" note="The last copy printed for each day, as it was on the notice board. Printing a day again replaces its copy; copies older than 90 days go.">
      <div className="mb-3"><ChangeLine label="Records for a month" value="Choose a month" select={<LineSelect label="Records for a month" value="" onChange={(m) => { if (m) records(m); }} free={[{ id: "", name: "Choose a month" }, ...months]} />} /></div>
      {printed === null ? null : days.length === 0 ? <Empty text="Nothing printed yet. Print the day from the day screen." /> : (
        <ListGroup>
          {days.map((date) => (
            <div key={date} className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 text-base font-semibold">{dayText(date)}</span>
              {printed!.filter((p) => p.date === date).map((p) => (
                <button key={p.kind} type="button" className="min-h-11 rounded-full border px-4 text-sm font-semibold" onClick={() => openOne(date, p.kind)}>{KIND[p.kind] ?? p.kind}</button>
              ))}
            </div>
          ))}
        </ListGroup>
      )}
    </BottomSheet>
  );
}

const KEEPS: [string, string][] = [["therapies", "Therapies"], ["rooms", "Rooms"], ["team", "Therapists, doctors and their leave"], ["events", "Classes, events and holidays"]];

/** Help and plan: report a problem, invite a centre, the plan, and the demo data only while it exists. */
export function HelpSheet({ open, onOpenChange, centre, supportWhatsapp, trial, demo, admin, showFooter, setShowFooter, saveFooter }: {
  open: boolean; onOpenChange: (o: boolean) => void; centre: string; supportWhatsapp: string | null; trial: Trial | null; demo: boolean; admin: boolean;
  showFooter: boolean; setShowFooter: (v: boolean) => void; saveFooter: () => void;
}) {
  const [plan, setPlan] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [keep, setKeep] = useState<string[]>(["therapies", "rooms"]);
  const [working, setWorking] = useState(false);
  const wa = (n: string, text: string) => window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");

  const clear = async () => {
    const going = KEEPS.filter(([k]) => !keep.includes(k)).map(([, t]) => t.toLowerCase());
    if (!(await confirmSheet(`Delete the demo patients and bookings${going.length ? `, and ${going.join(", ")}` : ""}?\n\nYour account and centre settings are kept. This cannot be undone.`, "Delete"))) return;
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/settings/clear-demo-data`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not clear demo data"); return; }
      toast.success(`Removed ${data.deleted?.patients ?? 0} patients and ${data.deleted?.appointments ?? 0} appointments`);
      setTimeout(() => window.location.reload(), 900);
    } finally { setWorking(false); }
  };
  const reset = async () => {
    if (!(await confirmSheet("Replace the demo data with a fresh four months starting today?\n\nAny changes made to demo patients and bookings are lost. Your account and centre settings are kept.", "Replace"))) return;
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/settings/reset-demo-data`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not reset demo data"); return; }
      toast.success("Demo data rebuilt from today");
      setTimeout(() => window.location.reload(), 900);
    } finally { setWorking(false); }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Help and plan">
      <ListGroup>
        {supportWhatsapp ? <Row title="Report a problem or an idea" facts="On WhatsApp, to whoever looks after the app" trailing="›" onClick={() => wa(supportWhatsapp, `${PRODUCT}: a problem or an idea from ${centre}: `)} /> : null}
        {admin ? <Row title="Invite a centre" facts="On WhatsApp · you both get 3 months free" trailing="›"
          onClick={() => wa("", `We run ${centre} on ${PRODUCT}: patients, therapists and the day sheet on one phone. Free for 30 days: https://jains.es/ruta?ref=${encodeURIComponent(window.location.host.split(".")[0])}`)} /> : null}
        {admin && trial ? <Row title="Plan" facts={planHint(trial)} trailing="›" onClick={() => setPlan(true)} /> : null}
        {admin && demo ? <Row title="Demo data" facts="Clear it, or reset it from today" trailing="›" onClick={() => setDemoOpen(true)} /> : null}
      </ListGroup>

      <BottomSheet open={plan} onOpenChange={setPlan} title="Plan" note={trial ? `${planHint(trial)}.` : undefined}>
        <ListGroup>
          {PLANS.map((p) => <Row key={p.id} title={`Choose ${p.name}`} facts={p.price} trailing="›" onClick={() => wa(SALES_WHATSAPP, `${centre} (${window.location.host}) would like ${p.name}, ${p.price}.`)} />)}
        </ListGroup>
        <p className={`mt-2 ${noteText}`}>Opens WhatsApp. We reply the same working day with a UPI link. Or run it yourself for free: Download everything from Backups, then install it on your own computer.</p>
        {trial?.plan ? <><Switch label={`"Made with ${PRODUCT}" at the foot of sheets and links`} on={showFooter} set={setShowFooter} />
          <Btn kind="primary" className="mt-3" onClick={saveFooter}>Save</Btn></> : null}
      </BottomSheet>

      <BottomSheet open={demoOpen} onOpenChange={setDemoOpen} title="Demo data" note="Example patients, therapists, rooms and bookings so you could try the app. Clear it when you are ready to enter your centre's own; reset it to get four fresh months from today. Your account and settings are kept."
        foot={<SheetFoot busy={working} save={clear} label="Clear the demo data" tone="destructive" remove={reset} removeLabel="Reset it from today instead" />}>
        <p className={`${noteText} mb-1`}>Keep when clearing. Patients and bookings always go; standard therapies can be brought back from the library.</p>
        {KEEPS.map(([k, t]) => <Tick key={k} label={say(t)} on={keep.includes(k)} set={(v) => setKeep(v ? [...keep, k] : keep.filter((x) => x !== k))} />)}
      </BottomSheet>
    </BottomSheet>
  );
}
