// node scripts/uat-1242.mjs — a group's days short of therapists (#1242), 375x812, on a throwaway stack (APP_URL). Leaves a group of 30 in 2030.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-group-capacity';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const add = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
for (let i = 0; i < 70; i++) await fetch(`${APP}/api/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: `Big Group ${i + 1}`, gender: 'female', group_name: 'Kerala Teachers', stay: { start_date: add(20), end_date: add(22) } }) });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /^Groups/ }).click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: /^Kerala Teachers/ }).first().click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/group-short-375.png` });
await b.close();
