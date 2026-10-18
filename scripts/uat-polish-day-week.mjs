// node scripts/uat-polish-day-week.mjs — the Day's scrolled header at 375x812, 100% and 200% text.
// SHOT=before against main, SHOT=after (default) against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-18-polish-day-week';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  // Wednesday, not today: the Today button shares the line, the longest it gets.
  await p.goto(`${APP}/admin/schedule?date=2026-10-21`); await p.waitForTimeout(2500);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${SHOT}-header${zoom === 2 ? '-200' : ''}.png`, clip: { x: 0, y: 0, width: 375, height: 260 } });
  await ctx.close();
}
await b.close();
