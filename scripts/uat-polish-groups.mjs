// node scripts/uat-polish-groups.mjs before|after — the polish batch for Stays, Guest rooms and Groups (#1285): Patients'
// chips, a group, and Guest rooms with a late checkout to make up, at 375x812 and at 200% text, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const when = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-28-polish-stays';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (m, p, b) => fetch(`${APP}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
// A guest leaving today with a late checkout, so "To make up" has one to show.
const out = (await api('GET', `/guest-rooms/free?from=${today}&to=${today}`)).flatMap((r) => r.guests).find((g) => g.end_date === today && !g.to_room);
if (out) await api('PUT', `/patients/${out.patient_id}/stays/${out.stay_id}`, { start_date: out.start_date, end_date: out.end_date, leaving_time: '15:00' });
const b = await chromium.launch();
for (const [zoom, tag] of [[1, '375'], [2, '375-200pct']]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${16 * z}px`; }); }, [token, zoom]);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${when}-patients-${tag}.png` });
  await p.getByRole('button', { name: /^Groups/ }).click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /^Rishikesh Yoga/ }).first().click(); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/${when}-group-${tag}.png` });
  await p.goto(`${APP}/admin/guestrooms`); await p.waitForTimeout(2500);
  const make = p.getByText(/^To make up/).first();
  if (await make.count()) await make.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/${when}-guest-rooms-${tag}.png` });
  await ctx.close();
}
await b.close();
