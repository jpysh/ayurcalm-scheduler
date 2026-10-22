// node scripts/week-sim.mjs [seed] — one centre week through the API on a throwaway stack (APP), with its own audit.
const APP = process.env.APP || 'http://localhost:8099';
const SEED = Number(process.argv[2] || 20261021);
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const log = [];
const note = (...a) => { const l = a.join(' '); log.push(l); console.log(l); };

const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, p, b) => { const r = await fetch(`${APP}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: b ? JSON.stringify(b) : undefined }); let j; try { j = await r.json(); } catch { j = null; } return { status: r.status, j }; };

const settings = (await api('GET', '/settings')).j;
const tz = settings?.timezone || 'Asia/Kolkata';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
const DOW = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
note(`seed=${SEED} tz=${tz} today=${today} days=${days[0]}..${days[6]}`);

const staff = ((await api('GET', '/staff')).j || []).filter((x) => x.is_active !== false);
const therapies = ((await api('GET', '/therapies')).j || []).filter((t) => !t.is_consultation && t.is_active !== false);
note(`staff=${staff.length} therapies=${therapies.length}`);

// Leave first: two therapists, random days; closure mid-week (day 4) moved to next open day.
const leave = [];
for (const st of [pick(staff), pick(staff)]) {
  const d0 = pick(days.slice(0, 5)); const d1 = addDays(d0, Math.floor(rnd() * 2));
  const r = await api('POST', '/timeoff', { entity_type: 'staff', entity_id: st.id, start_date: d0, end_date: d1, description: 'weeksim leave' });
  leave.push({ staff_id: st.id, name: st.name, from: d0, to: d1 }); note(`leave ${st.name} ${d0}..${d1} -> ${r.status}`);
}

const patients = [];
for (let i = 0; i < 12; i++) {
  const arrive = days[Math.floor(rnd() * 5)];
  const stayLen = 3 + Math.floor(rnd() * 8);
  const gender = pick(['male', 'female']);
  const name = `Sim ${pick(['Asha','Ravi','Meera','Karan','Leela','Arjun','Tara','Vikram','Anya','Dev'])} ${String.fromCharCode(65 + i)}`;
  const body = { name, gender, stay: { start_date: arrive, end_date: addDays(arrive, stayLen) }, on_site: true };
  if (i % 6 === 0) { const st = pick(staff); body.preferred_staff_id = st.id; body.requires_preferred_staff = true; }
  const r = await api('POST', '/patients', body);
  if (r.status >= 300) { note(`patient ${name} -> ${r.status} ${JSON.stringify(r.j).slice(0, 200)}`); continue; }
  const p = { id: r.j.id, name, arrive, leave: body.stay.end_date, only: body.preferred_staff_id };
  patients.push(p); note(`patient ${name} ${arrive}..${p.leave}${p.only ? ' only-one-therapist' : ''}`);
  for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
    const t = pick(therapies);
    const startH = 7 + Math.floor(rnd() * 8);
    const a = await api('POST', '/appointments', { patient_id: p.id, therapy_id: t.id, total_sessions: 1 + Math.floor(rnd() * 5), preferred_days: [], preferred_time_range: { start: `${String(startH).padStart(2, '0')}:00`, end: `${String(startH + 4).padStart(2, '0')}:00` }, start_date: arrive, end_date: p.leave });
    note(`  course ${t.name} -> ${a.status} ${a.status >= 300 ? (a.j?.conflicts?.message || a.j?.error || JSON.stringify(a.j).slice(0, 160)) : (a.j?.appointments?.length ?? '') + ' booked'}`);
  }
}

const closure = days[3];
const c = await api('POST', '/holidays', { entity_type: 'center', date: closure, description: 'weeksim closure', move: true });
note(`closure ${closure} move -> ${c.status} ${JSON.stringify(c.j).slice(0, 200)}`);

// Two leave early.
for (const p of [pick(patients), pick(patients)]) {
  const stays = (await api('GET', `/patients/${p.id}/stays`)).j || [];
  const st = stays[0]; if (!st) continue;
  const newEnd = addDays(p.arrive, 1);
  const r = await api('PUT', `/patients/${p.id}/stays/${st.id}`, { start_date: p.arrive, end_date: newEnd });
  note(`leaves early ${p.name} ${p.leave}->${newEnd} -> ${r.status} ${r.status >= 300 ? JSON.stringify(r.j).slice(0, 160) : ''}`); p.leave = newEnd;
}

// Move and cancel a few.
const all = (await api('GET', `/appointments?from=${days[0]}&to=${days[6]}`)).j || [];
for (let i = 0; i < 3 && all.length; i++) { const a = pick(all); const r = await api('PUT', `/appointments/${a.id}`, { status: 'cancelled' }); note(`cancel ${a.id.slice(0, 8)} ${a.scheduled_date?.slice(0, 10)} ${a.start_time} -> ${r.status}`); }
for (let i = 0; i < 3 && all.length; i++) { const a = pick(all); const t = `${String(8 + Math.floor(rnd() * 9)).padStart(2, '0')}:${pick(['00', '30'])}`; const r = await api('PUT', `/appointments/${a.id}`, { start_time: t }); note(`move ${a.id.slice(0, 8)} ${a.start_time}->${t} -> ${r.status} ${r.status >= 300 ? (r.j?.message || JSON.stringify(r.j).slice(0, 160)) : ''}`); }

// Audit.
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const problems = [];
for (const d of days) {
  const appts = ((await api('GET', `/appointments?date=${d}`)).j || []).filter((a) => !['cancelled', 'rescheduled'].includes(a.status));
  const res = (k) => (a) => k === 'staff' ? [a.staff_id, ...(a.co_staff_ids || [])].filter(Boolean) : [a[k]].filter(Boolean);
  for (const k of ['staff', 'room_id', 'patient_id']) {
    for (let i = 0; i < appts.length; i++) for (let j = i + 1; j < appts.length; j++) {
      const A = appts[i], B = appts[j];
      if (!res(k)(A).some((x) => res(k)(B).includes(x))) continue;
      const a0 = mins(A.start_time), b0 = mins(B.start_time);
      if (a0 < b0 + B.duration_minutes && b0 < a0 + A.duration_minutes) problems.push(`${d} double ${k}: ${A.start_time} & ${B.start_time}`);
    }
  }
  for (const L of leave) if (d >= L.from && d <= L.to) for (const a of appts) if (res('staff')(a).includes(L.staff_id)) problems.push(`${d} ${L.name} on leave but has ${a.start_time}`);
  for (const p of patients) {
    for (const a of appts.filter((a) => a.patient_id === p.id)) {
      if (p.only && a.staff_id !== p.only) problems.push(`${d} ${p.name} one-therapist rule broken at ${a.start_time}`);
      if (d > p.leave || d < p.arrive) problems.push(`${d} ${p.name} treated outside stay at ${a.start_time}`);
    }
  }
  if (d === closure && appts.length) problems.push(`${d} closed but ${appts.length} treatments`);
  const dc = (await api('POST', '/day-check', { date: d })).j;
  const pr = dc?.problems ?? dc?.issues ?? [];
  note(`${d} ${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]}: ${appts.length} treatments, day-check problems=${Array.isArray(pr) ? pr.length : JSON.stringify(dc).slice(0, 120)}`);
}
note(`AUDIT ${problems.length} problems`); problems.forEach((p) => note('  ' + p));
await (await import('node:fs/promises')).writeFile((await import('node:os')).tmpdir() + '/week-sim-log.txt', log.join('\n') + '\n');
await (await import('node:fs/promises')).writeFile((await import('node:os')).tmpdir() + '/week-sim-state.json', JSON.stringify({ SEED, today, days, closure, leave, patients }, null, 1));
