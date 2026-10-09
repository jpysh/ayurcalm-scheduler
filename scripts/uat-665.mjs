// node scripts/uat-665.mjs — the day and the team at 375x812 and 200% text (#665): room names wrap, week days do not touch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-text-200';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; window.scrollTo(0, 0); }); await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/after-day-200.png` });
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(500);
await p.getByRole('dialog').last().getByRole('button', { name: /^Team/ }).click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/after-team-200.png` });
await b.close();
