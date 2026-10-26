// node scripts/uat-1195.mjs — New patient with Companion on: no consultation is booked (#1195), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-companion';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'New patient' }).click(); await p.waitForTimeout(1500);
await p.getByRole('switch', { name: /Companion/ }).click(); await p.waitForTimeout(800);
await p.getByRole('switch', { name: /Companion/ }).scrollIntoViewIfNeeded();
if (await p.getByText('First consultation').count()) throw new Error('a companion is offered a consultation');
await p.screenshot({ path: `${OUT}/new-companion-375.png` });
await b.close();
