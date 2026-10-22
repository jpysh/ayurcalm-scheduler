// node scripts/uat-polish-day-1076.mjs — Day, What needs you and the lists at 375x812 and 200% text (#1076).
// SHOT=before against main, SHOT=after (default) against the branch; E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8120';
const SHOT = process.env.SHOT || 'after';
const OUT = 'docs/design/uat/2026-10-22-polish-day-1076';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const menuTo = async (p, name) => { await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.getByRole('dialog').getByRole('button', { name }).click(); await p.waitForTimeout(1500); };
for (const zoom of [1, 2]) {
  const z = zoom === 2 ? '-200' : '';
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.goto(APP + '/'); await p.waitForTimeout(3000);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await p.screenshot({ path: `${OUT}/${SHOT}-day-top${z}.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${SHOT}-day-bottom${z}.png` });
  // Tomorrow, so the treatment is not finished and can be moved.
  await p.evaluate(() => { window.scrollTo(0, 0); document.documentElement.style.fontSize = ''; }); await p.waitForTimeout(300);
  await p.locator('button[aria-pressed="true"] + button').first().click(); await p.waitForTimeout(1500);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await p.locator('[data-appt]').first().click(); await p.waitForTimeout(800);
  await p.getByRole('dialog').getByRole('button', { name: /Something wrong/ }).click(); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${SHOT}-something-wrong${z}.png` });
  await p.getByRole('dialog').getByRole('button', { name: /running late/ }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${SHOT}-move${z}.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await menuTo(p, /^Patients/);
  await p.screenshot({ path: `${OUT}/${SHOT}-patients${z}.png` });
  await menuTo(p, /^Staff/);
  await p.screenshot({ path: `${OUT}/${SHOT}-staff${z}.png` });
  await ctx.close();
}
await b.close();
