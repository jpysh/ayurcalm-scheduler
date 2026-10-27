// node scripts/uat-1310.mjs — the home-screen offer after the first printed sheet (#1310), 375x812, on a throwaway stack (APP_URL).
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8399';
const OUT = 'docs/design/uat/2026-10-27-home-screen';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: devices['iPhone 13'].userAgent, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(4000);
await p.getByRole('button', { name: 'Menu' }).click(); await p.waitForTimeout(800);
await p.getByText(/Print (the day's|tomorrow's) sheets/).click(); await p.waitForTimeout(800);
await p.getByText('Patient sheet').click(); await p.waitForTimeout(6000);
await p.bringToFront(); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/offer-375.png` });
await b.close();
