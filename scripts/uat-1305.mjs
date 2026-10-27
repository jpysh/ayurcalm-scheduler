// node scripts/uat-1305.mjs — the morning streak (#1305) under Print in the menu, 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8399';
const OUT = 'docs/design/uat/2026-10-27-print-streak';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const auth = { Authorization: `Bearer ${token}` };
// Three mornings printed, ending on the centre's today.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
for (const n of [2, 1, 0]) {
  const d = new Date(Date.parse(`${today}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  await fetch(`${APP}/api/daily-schedule-pdf?date=${d}`, { headers: auth });
}
console.log(await (await fetch(`${APP}/api/printed-sheets/streak`, { headers: auth })).json());
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(4000);
await p.getByRole('button', { name: 'Menu' }).click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/menu-streak-375.png` });
await b.close();
