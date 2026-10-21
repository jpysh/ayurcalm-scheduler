// node scripts/uat-1030.mjs — the Print sheet (#1030) at 375x812 on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8095';
const OUT = 'docs/design/uat/2026-10-21-print-sheet';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/`); await p.waitForTimeout(3000);
await p.getByRole('button', { name: 'Menu', exact: true }).click();
await p.getByRole('dialog').getByRole('button', { name: /^Print (the day's|tomorrow's) sheets/ }).click();
await p.waitForTimeout(1000);
await p.screenshot({ path: `${OUT}/print-sheet-375.png` });
await b.close();
