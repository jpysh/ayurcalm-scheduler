// node scripts/uat-1048.mjs — a closed day where nothing can move (#1048), 375x812, after `node scripts/week-sim.mjs 20261021` on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8099';
const OUT = 'docs/design/uat/2026-10-22-closed-day-move';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-26T08:30:00+05:30'));
await p.goto(`${APP}/`); await p.waitForTimeout(3500);
await p.screenshot({ path: `${OUT}/after-closed-day-375.png` });
await b.close();
