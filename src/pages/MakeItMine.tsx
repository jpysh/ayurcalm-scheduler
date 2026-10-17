import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Area, Btn, FullPage, Group, Seg, Text, Tick, noteText, plural } from "@/components/kit";
import { API_BASE } from "@/lib/apiBase";
import { FromFile, ResidentRows, checkResidents, type Resident } from "@/components/ResidentImport";

type Sex = "" | "female" | "male";
type Named = { name: string; gender: Sex };
type Item = { id: string; name: string; on: boolean };

/** One name per line, as typed or pasted from WhatsApp or a spreadsheet; a gender already chosen survives an edit. */
const names = (text: string, before: Named[]): Named[] =>
  [...new Set(text.split(/\r?\n/).map((l) => l.replace(/^[\s\d.)-]+/, "").trim()).filter(Boolean))]
    .map((name) => ({ name, gender: before.find((b) => b.name === name)?.gender ?? "" }));

const centreDay = (tz: string, plusDays = 0) => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${d}T00:00:00Z`) + plusDays * 86400000).toISOString().slice(0, 10);
};

/** A woman or a man for each name: therapists are matched by it, so it is asked, never guessed. */
function WhoIs({ people, set }: { people: Named[]; set: Dispatch<SetStateAction<Named[]>> }) {
  return (
    <div className="mt-2 grid gap-2">
      {people.map((p, i) => (
        <div key={p.name} className="grid grid-cols-[1fr_auto] items-center gap-3">
          <span className="min-w-0 truncate text-base">{p.name}</span>
          <Seg<Sex> options={[["female", "Woman"], ["male", "Man"]]} value={p.gender} onChange={(g) => set((all) => all.map((x, j) => (j === i ? { ...x, gender: g } : x)))} />
        </div>
      ))}
    </div>
  );
}

/**
 * Make it mine (#729): three steps from the example centre to tomorrow's day.
 * The team, the rooms and therapies they give, and tomorrow's residents, each
 * booked a consultation. Hours, prices and the rest stay as the example has
 * them and are changed in Settings when the centre wants.
 */
export default function MakeItMine() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [centre, setCentre] = useState("");
  const [tz, setTz] = useState("Asia/Kolkata");
  const [whatsapp, setWhatsapp] = useState("");
  const [doctorsText, setDoctorsText] = useState("");
  const [therapistsText, setTherapistsText] = useState("");
  const [doctors, setDoctors] = useState<Named[]>([]);
  const [therapists, setTherapists] = useState<Named[]>([]);
  const [rooms, setRooms] = useState<Item[]>([]);
  const [therapies, setTherapies] = useState<Item[]>([]);
  const [residentsText, setResidentsText] = useState("");
  const [residents, setResidents] = useState<Named[]>([]);
  // Rows pasted from a spreadsheet or read from a CSV carry their own dates (#741); names alone arrive tomorrow.
  const [sheet, setSheet] = useState<Resident[]>([]);
  const readResidents = async (text: string) => {
    setResidentsText(text);
    if (text.includes("\t")) { setResidents([]); setSheet(await checkResidents(text)); } else { setSheet([]); setResidents(names(text, residents)); }
  };

  useEffect(() => {
    fetch(`${API_BASE}/settings`).then((r) => r.json()).then((s) => {
      // The example's own name is not the centre's; a trial's sign-up already gave the real one.
      if (s?.centre_name && s.centre_name !== "Himalaya Ayurveda Retreat") setCentre(s.centre_name);
      if (s?.timezone) setTz(s.timezone);
      setWhatsapp(s?.support_whatsapp || "");
    }).catch(() => {});
    fetch(`${API_BASE}/rooms`).then((r) => r.json()).then((l) => setRooms((Array.isArray(l) ? l : []).filter((r) => r.is_active !== false).map((r) => ({ id: r.id, name: r.name, on: true })))).catch(() => {});
    fetch(`${API_BASE}/therapies`).then((r) => r.json()).then((l) => setTherapies((Array.isArray(l) ? l : []).filter((t) => t.is_active !== false && !t.is_consultation).map((t) => ({ id: t.id, name: t.name, on: true })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
  }, []);

  const team = [...doctors.map((p) => ({ ...p, doctor: true })), ...therapists.map((p) => ({ ...p, doctor: false }))];
  const teamOk = !!centre.trim() && doctors.length > 0 && therapists.length > 0 && team.every((p) => p.gender);
  const kitOk = rooms.some((r) => r.on && r.name.trim()) && therapies.some((t) => t.on);
  const residentsOk = sheet.length ? sheet.every((p) => !p.problems.length) : residents.every((p) => p.gender);
  const arriving = sheet.length ? sheet.length : residents.length;

  const finish = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/settings/make-it-mine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centre_name: centre.trim(), team,
          rooms: rooms.filter((r) => r.on && r.name.trim()).map((r) => ({ id: r.id, name: r.name.trim() })),
          therapy_ids: therapies.filter((t) => t.on).map((t) => t.id),
        }),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => ({})))?.error || "Your centre was not saved. Try again."); return; }
      // Each resident through the same door as one added by hand, so the consultation passes the same checks.
      const tomorrow = centreDay(tz, 1), leaving = centreDay(tz, 14);
      let booked = 0, added = 0;
      const list = sheet.length ? sheet : residents.map((p) => ({ ...p, arriving: tomorrow, leaving, phone: "" }));
      for (const p of list) {
        const { slots = [] } = await fetch(`${API_BASE}/consultations/next?date=${p.arriving}`).then((r) => r.json()).catch(() => ({}));
        const visit = slots.find((s: { date: string }) => s.date === p.arriving);
        const r = await fetch(`${API_BASE}/patients`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, gender: p.gender, phone: p.phone || undefined, on_site: true, stay: { start_date: p.arriving, end_date: p.leaving },
            consultation: visit ? { date: visit.date, start_time: visit.start_time, staff_id: visit.staff_id, room_id: visit.room_id } : undefined }),
        });
        if (r.ok) { added++; if (visit) booked++; }
      }
      toast.success(list.length === 0 ? `Welcome, ${centre.trim()}`
        : added < list.length ? `${added} of ${list.length} patients added. Add the rest from Patients.`
        : booked < added ? `${plural(added, "patient")} added; ${booked} consultations fit tomorrow. Book the rest from each card.`
        : sheet.length ? `${plural(added, "patient")} added, each with a consultation on arrival.`
        : `${plural(added, "patient")} arrive tomorrow, each with a consultation.`);
      navigate(`/admin/schedule?date=${tomorrow}`);
      setTimeout(() => window.location.reload(), 400);
    } finally { setBusy(false); }
  };

  const foot = (ok: boolean, label: string, back?: number) => (
    <div className="mt-5 grid gap-1">
      <Btn kind="primary" type="submit" disabled={!ok || busy}>{label}</Btn>
      {back ? <Btn kind="quiet" disabled={busy} onClick={() => setStep(back)}>Back</Btn> : <Btn kind="quiet" disabled={busy} onClick={() => navigate("/admin/schedule")}>Not now</Btn>}
    </div>
  );
  const TITLES = ["", "Who works here?", "Your rooms and therapies", "Who arrives tomorrow?"];

  return (
    <FullPage title={step === 3 && sheet.length ? "Who is arriving?" : TITLES[step]} note={`Step ${step} of 3. The example goes when you finish; hours and the rest are in Settings.`}>
      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
          {whatsapp ? <p className={`mt-3 ${noteText}`}>Rather we set it up? <a className="font-semibold underline" href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}>Send us your list on WhatsApp</a>, free during the trial.</p> : null}
          <Text label="Centre name" value={centre} onChange={(e) => setCentre(e.target.value)} note="On the app and the printed day sheet." />
          <Area label="Doctors" rows={3} value={doctorsText} placeholder={"One name per line"} note="They see each new patient first."
            onChange={(e) => { setDoctorsText(e.target.value); setDoctors(names(e.target.value, doctors)); }} />
          <WhoIs people={doctors} set={setDoctors} />
          <Area label="Therapists" rows={10} value={therapistsText} placeholder={"One name per line, or paste a list"}
            onChange={(e) => { setTherapistsText(e.target.value); setTherapists(names(e.target.value, therapists)); }} />
          <WhoIs people={therapists} set={setTherapists} />
          {foot(teamOk, "Continue")}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(3); }}>
          <Group label="Treatment rooms" note="Rename them as your centre calls them; untick any you do not have.">
            {rooms.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <Tick label="" on={r.on} set={(on) => setRooms((all) => all.map((x, j) => (j === i ? { ...x, on } : x)))} />
                <input aria-label={`Room ${i + 1}`} className="h-11 rounded-xl border border-input/45 bg-background px-3 text-base" value={r.name} disabled={!r.on}
                  onChange={(e) => { const name = e.target.value; setRooms((all) => all.map((x, j) => (j === i ? { ...x, name } : x))); }} />
              </div>
            ))}
          </Group>
          <Group label="Therapies you give" note={`${therapies.filter((t) => t.on).length} of ${therapies.length}. Untick any you do not give; lengths and prices are in Settings.`}>
            {therapies.map((t, i) => <Tick key={t.id} label={t.name} on={t.on} set={(on) => setTherapies((all) => all.map((x, j) => (j === i ? { ...x, on } : x)))} />)}
          </Group>
          {foot(kitOk, "Continue", 1)}
        </form>
      )}

      {step === 3 && (
        <form onSubmit={(e) => { e.preventDefault(); void finish(); }}>
          <Area label="Patients" rows={8} value={residentsText} placeholder={"One name per line, or paste a list"}
            note="Each gets a consultation tomorrow and a two-week stay; change either on their card. Rows pasted from a spreadsheet keep their own dates."
            onChange={(e) => void readResidents(e.target.value)} />
          <FromFile onText={(t) => void readResidents(t)} />
          {sheet.length ? <ResidentRows rows={sheet} set={setSheet} /> : <WhoIs people={residents} set={setResidents} />}
          {foot(residentsOk && !busy, busy ? "Setting up…" : arriving ? `Plan ${sheet.length ? "arrivals" : "tomorrow"} for ${plural(arriving, "patient")}` : "Finish without patients", 2)}
        </form>
      )}
    </FullPage>
  );
}
