// node scripts/uat-1160.mjs — the day's count line at 200% text, scrolled (#1160), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8090';
const OUT = 'docs/design/uat/2026-10-25-day-count';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await p.waitForTimeout(500);
await p.evaluate(() => window.scrollTo(0, 3000)); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/day-200-375.png` });
await b.close();
