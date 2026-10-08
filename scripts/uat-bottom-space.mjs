// node scripts/uat-bottom-space.mjs — the day list ends just above the floating buttons, at 375x812.
// SHOT=00-before against main (:8201), SHOT=01 against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-08-bottom-space';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(500);
const end = p.getByText('End of the day');
if (!(await end.count())) { console.log('no booked day on this seed'); process.exit(1); }
const gap = await p.evaluate(() => {
  const e = [...document.querySelectorAll('div')].find((d) => d.textContent === 'End of the day');
  const n = document.querySelector('nav[data-kit="bar"]');
  return Math.round(n.getBoundingClientRect().top - e.getBoundingClientRect().bottom);
});
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
console.log(SHOT, `gap between "End of the day" and the buttons: ${gap}px`);
await b.close();
