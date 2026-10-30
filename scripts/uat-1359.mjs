// node scripts/uat-1359.mjs — Opening hours: the seven day buttons are at least 44px high, at 375x812 (#1359).
// E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-30-day-buttons-1359';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/settings`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /Opening hours and holidays/ }).first().click();
await p.waitForTimeout(600);
const sizes = await p.getByRole('button', { name: 'Monday', exact: true }).evaluate((e) => e.getBoundingClientRect().toJSON());
console.log('Monday button', Math.round(sizes.width * 10) / 10, 'x', Math.round(sizes.height * 10) / 10);
await p.screenshot({ path: `${OUT}/after-hours.png` });
await b.close();
