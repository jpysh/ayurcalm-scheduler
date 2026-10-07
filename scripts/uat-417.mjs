// node scripts/uat-417.mjs — #417: eleven wrong passwords on the sign-in page, and no CSP errors on open, at 375x812.
import { chromium } from '@playwright/test';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-07-signin-limit';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(APP + '/login'); await p.waitForTimeout(1500);
let last = 0;
p.on('response', (r) => { if (r.url().endsWith('/auth/login')) last = r.status(); });
for (let i = 0; i < 11; i++) {
  await p.getByLabel(/email/i).fill('nobody@example.com');
  await p.getByLabel(/password/i).fill(`wrong${i}`);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
}
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const csp = errors.filter((e) => /Content Security Policy/i.test(e));
console.log(`${SHOT}: 11th try ${last}; CSP errors ${csp.length}${csp.length ? `: ${csp[0]}` : ''}`);
await b.close();
