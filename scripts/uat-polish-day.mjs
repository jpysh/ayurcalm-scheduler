// node scripts/uat-polish-day.mjs — Day at 375x812 and 200% text (#633).
// SHOT=before against main, SHOT=after (default) against the branch. Gives one therapist a part-day leave
// that starts during a treatment (left unplanned), shoots the row and the arrivals line, then removes it.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-09-polish-day';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const { timezone } = await (await fetch(`${APP}/api/settings`, { headers: auth })).json();
const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'Asia/Kolkata' });
const away = new Set((await (await fetch(`${APP}/api/staff-day?date=${today}`, { headers: auth })).json()).filter((x) => x.off).map((x) => x.staff_id));
const appts = (await (await fetch(`${APP}/api/appointments?date=${today}`, { headers: auth })).json())
  .filter((a) => a.staff_id && a.status === 'pending' && a.start_time >= '15:00' && a.start_time.endsWith(':00') && !away.has(a.staff_id)).sort((a, b) => b.start_time.localeCompare(a.start_time));
const a = appts[0];
const from = `${a.start_time.slice(0, 2)}:30`;
const off = await (await fetch(`${APP}/api/timeoff`, { method: 'POST', headers: auth, body: JSON.stringify({ entity_type: 'staff', entity_id: a.staff_id, date: today, start_date: today, end_date: today, start_time: from, end_time: '23:00', description: 'Leave', plan: false }) })).json();
const b = await chromium.launch();
const flat = (t) => t.replace(/\s+/g, ' ').trim();
try {
  for (const zoom of [1, 2]) {
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
    const p = await ctx.newPage();
    await p.goto(APP + '/'); await p.waitForTimeout(3000);
    if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const arriving = p.getByText(/^(Arriving|Arrived) ·/).first();
    if (await arriving.count()) { console.log(SHOT, flat(await arriving.innerText())); await arriving.scrollIntoViewIfNeeded(); }
    await p.screenshot({ path: `${OUT}/${SHOT}-arriving${zoom === 2 ? '-200' : ''}.png` });
    const flag = p.getByText(SHOT === 'before' ? /Therapist not in/ : /leaves at/).first();
    await flag.scrollIntoViewIfNeeded();
    console.log(SHOT, 'flag:', flat(await flag.innerText()));
    await p.screenshot({ path: `${OUT}/${SHOT}-part-day${zoom === 2 ? '-200' : ''}.png` });
    await ctx.close();
  }
} finally {
  await fetch(`${APP}/api/timeoff/${off.id}`, { method: 'DELETE', headers: auth });
  await b.close();
}
