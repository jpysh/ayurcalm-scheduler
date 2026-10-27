// node scripts/uat-1203.mjs — a tentative hold for a phone enquiry (#1203), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-tentative-hold';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /^Groups/ }).click(); await p.waitForTimeout(800);
await p.getByText('Hold rooms for a group or enquiry').click(); await p.waitForTimeout(1500);
await p.getByLabel('Group or enquiry').fill('Sharma enquiry');
await p.getByRole('switch', { name: 'Tentative' }).click(); await p.waitForTimeout(300);
await p.locator('input[type=number]').first().fill('1'); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/hold-sheet-375.png` });
await b.close();
