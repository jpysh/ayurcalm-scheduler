// node scripts/uat-polish-leave.mjs — New leave → Who at 375x812 and 200% text (#636).
// SHOT=before against main, SHOT=after (default) against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-09-polish-leave';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/timeoff`); await p.waitForTimeout(2500);
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await p.getByRole('button', { name: /^(\+|Add)/ }).first().click(); await p.waitForTimeout(800);
  await p.getByRole('dialog').last().getByRole('button', { name: /^Who\b/ }).click(); await p.waitForTimeout(800);
  if (zoom === 1) console.log(SHOT, (await p.getByRole('dialog').last().innerText()).replace(/\s+/g, ' ').slice(0, 200));
  await p.screenshot({ path: `${OUT}/${SHOT}-who${zoom === 2 ? '-200' : ''}.png` });
  await ctx.close();
}
await b.close();
