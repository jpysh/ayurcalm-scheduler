// node scripts/uat-941.mjs — Diet change sheet at 375x812 (#941). E2E_BASE_URL=http://localhost:8241 against a SEED_SIZE=babaji stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8241';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-18-diet-941';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 600));
await p.getByText('Aarav Iyer').first().click();
await p.waitForTimeout(800);
const diet = p.getByText(/^Diet$/).first();
if (await diet.count()) { await diet.click(); await p.waitForTimeout(1000); }
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 1500));
await p.screenshot({ path: `${OUT}/after-diet-sheet.png` });
await b.close();
