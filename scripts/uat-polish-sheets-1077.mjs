// node scripts/uat-polish-sheets-1077.mjs — card sheets left from #1077 at 375x812 and 200% text.
// SHOT=before against main, SHOT=after (default) against the branch; E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8120';
const SHOT = process.env.SHOT || 'after';
const OUT = 'docs/design/uat/2026-10-22-polish-sheets-1077';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const get = async (path) => (await fetch(`${APP}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
let staying = null, coming = null;
for (const p of (await get('/patients')).slice(0, 60)) {
  const d = await get(`/patients/${p.id}/day?date=${today}`);
  if (!staying && d.stay && d.stay.day >= 5 && !d.preferred_staff_id && (SHOT === 'before' || d.suggested_staff_id)) staying = p;
  if (!coming && d.coming) coming = p;
  if (staying && coming) break;
}
console.log(SHOT, 'staying:', staying?.name, 'coming:', coming?.name);
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const z = zoom === 2 ? '-200' : '';
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  const big = () => zoom === 2 && p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const card = async (who) => { await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500); await big(); await p.getByRole('button', { name: new RegExp(`^${who.name}`) }).first().click(); await p.waitForTimeout(1500); };
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500); await big();
  await p.getByRole('button', { name: 'New patient', exact: true }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${SHOT}-new-patient${z}.png` });
  await p.goto(`${APP}/admin/diet`); await p.waitForTimeout(2000); await big();
  await p.screenshot({ path: `${OUT}/${SHOT}-diet${z}.png` });
  if (staying) {
    await card(staying);
    const pref = p.getByRole('dialog').last().getByText('Preferred therapist').first();
    await pref.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${SHOT}-preferred${z}.png` });
    await p.getByRole('dialog').last().getByRole('button', { name: 'Plan next week' }).click(); await p.waitForTimeout(2000);
    await p.screenshot({ path: `${OUT}/${SHOT}-next-week${z}.png` });
  }
  if (coming) {
    await card(coming);
    await p.getByRole('dialog').last().getByRole('button', { name: /^Dates/ }).click(); await p.waitForTimeout(1000);
    await p.screenshot({ path: `${OUT}/${SHOT}-stay${z}.png` });
  }
  await ctx.close();
}
await b.close();
