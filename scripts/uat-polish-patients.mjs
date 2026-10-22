// PHASE=before|after APP_URL=… node scripts/uat-polish-patients.mjs — the patient card (#1077): a guest arriving later, one arriving today, one mid-stay; top and scrolled, 375x812, plus 200% text.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8080';
const PHASE = process.env.PHASE || 'after';
const OUT = 'docs/design/uat/2026-10-22-patient-card';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const big of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  for (const [slug, row] of [['coming', /Arrives (Fri|Sat|Sun)/], ['arriving', /Day 1 of/], ['staying', /Day (9|1[0-2]) of 21/]]) {
    if (big && slug !== 'coming') continue;
    await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
    if (big) await p.addStyleTag({ content: 'html{font-size:200%}' });
    await p.locator('button', { hasText: row }).first().click(); await p.waitForTimeout(1500);
    const name = big ? `${PHASE}-${slug}-200` : `${PHASE}-${slug}`;
    await p.screenshot({ path: `${OUT}/${name}-top.png` });
    if (big) continue;
    await p.locator('[role=dialog] .overflow-y-auto').first().evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await p.locator('[role=dialog] .overflow-y-auto').last().evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${name}-end.png` });
  }
  await ctx.close();
}
await b.close();
