// node scripts/uat-986.mjs — a new purification guest's Diet sheet offering the course's diets at 375x812 (#986). E2E_BASE_URL picks the stack.
// Adds Lalita Rao, 14 nights, with Snehapana in two days and Virechana in five.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-19-course-diet-986';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (path, body) => fetch(`${APP}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.json());
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
let guest = (await api('/patients')).find((x) => x.name === 'Lalita Rao');
if (!guest) {
  guest = await api('/patients', { name: 'Lalita Rao', gender: 'female', stay: { start_date: day(0), end_date: day(14) } });
  const therapies = await api('/therapies');
  for (const [name, n] of [['Snehapana', 2], ['Virechana', 5]]) {
    const t = therapies.find((x) => x.name === name);
    const { suggestions } = await api(`/appointments/suggest?date=${day(n)}&patient_id=${guest.id}&therapy_id=${t.id}`);
    const s = suggestions[0];
    await api('/appointments/one', { patient_id: guest.id, therapy_id: t.id, date: day(n), start_time: s.start_time, staff_id: s.staff_id, co_staff_ids: s.co_staff_ids ?? [], room_id: s.room_id, confirm: true });
  }
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByText('Lalita Rao').first().click(); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /diet|meals/i }).first().click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/after-diet-offer-375.png` });
await b.close();
