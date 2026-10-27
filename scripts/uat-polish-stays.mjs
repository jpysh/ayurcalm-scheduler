// node scripts/uat-polish-stays.mjs before|after — the stay and guest room screens of polish batch #1212, 375x812 and 200% text, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-27-polish-stays';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const add = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  const shot = async (name) => { if (zoom === 2) await p.addStyleTag({ content: 'html{font-size:200%}' }); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${WHEN}-${name}${zoom === 2 ? '-200' : ''}.png` }); };
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500); await shot('patients');
  await p.getByText(/^Day \d+ of/).first().click().catch(() => {}); await p.waitForTimeout(1500); await shot('card');
  if (zoom === 1) {
    await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2000);
    await p.getByRole('button', { name: 'New patient' }).click().catch(() => {}); await p.waitForTimeout(2000); await shot('new-patient');
  }
  await p.goto(`${APP}/admin/guestrooms`); await p.waitForTimeout(2500); await shot('guest-rooms');
  if (zoom === 1) {
    await p.getByLabel('Arriving').fill(add(20)); await p.waitForTimeout(500);
    await p.getByLabel('Leaving').fill(add(34)); await p.waitForTimeout(2500); await shot('room-free');
  }
  await ctx.close();
}
await b.close();
