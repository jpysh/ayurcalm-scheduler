// node scripts/uat-polish-links.mjs — a therapist's link with the first treatment done, at 375x812 and 200% text (#640).
// SHOT=before against main, SHOT=after (default) against the branch. Ticks Done on the first treatment, shoots, unticks.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-09-polish-links';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const { timezone } = await (await fetch(`${APP}/api/settings`, { headers: auth })).json();
const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'Asia/Kolkata' });
const count = {};
for (const a of await (await fetch(`${APP}/api/appointments?date=${today}`, { headers: auth })).json()) if (a.staff_id && a.status !== 'cancelled') count[a.staff_id] = (count[a.staff_id] || 0) + 1;
const staffId = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
const link = (await (await fetch(`${APP}/api/staff/${staffId}/link`, { method: 'POST', headers: auth })).json()).token;
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${APP}/l/${link}`); await p.waitForTimeout(2500);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const done = p.getByRole('checkbox', { name: 'Done' }).first();
  if (zoom === 1) { await done.click(); await p.waitForTimeout(1200); }
  await p.getByText(/^Done ·|Room ready/).first().scrollIntoViewIfNeeded();
  if (zoom === 1) console.log(SHOT, 'folded:', await p.getByText(/^Done ·/).count());
  await p.screenshot({ path: `${OUT}/${SHOT}-link${zoom === 2 ? '-200' : ''}.png` });
  if (zoom === 2) {
    if (await p.getByText(/^Done ·/).count()) { await p.getByText(/^Done ·/).first().click(); await p.waitForTimeout(500); }
    await p.getByRole('checkbox', { name: 'Done' }).first().click(); await p.waitForTimeout(1200);
  }
  await ctx.close();
}
await b.close();
