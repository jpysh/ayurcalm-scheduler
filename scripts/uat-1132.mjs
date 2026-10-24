// node scripts/uat-1132.mjs — an 80-letter name wraps in New patient's Name field, at 375x812 on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
const APP = process.env.APP_URL || 'http://localhost:8090';
const OUT = 'docs/design/uat/2026-10-24-name-wrap';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'New patient', exact: true }).click(); await p.waitForTimeout(800);
await p.getByLabel('Name').fill('Shrimati Venkatalakshmi Ramaswamy Subramaniam Chandrasekharan Iyer-Krishnamurthy');
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/name-80-375.png` });
await b.close();
