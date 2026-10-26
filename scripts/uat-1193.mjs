// node scripts/uat-1193.mjs — a guest arriving days later: cancel the missed days or push the stay later (#1193), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-late-arrival';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const add = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const api = (m, p, b) => fetch(`${APP}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const who = process.env.UAT_GUEST || 'Sai Mishra'; // a seeded arrival with treatments booked on the first days
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Search patients' }).click();
await p.keyboard.type(who); await p.waitForTimeout(1200);
await p.getByText(/arrives/).first().click(); await p.waitForTimeout(1500);
await p.getByText('Dates', { exact: true }).first().click(); await p.waitForTimeout(1500);
await p.getByLabel('Arriving').fill(add(4)); await p.waitForTimeout(2500);
if (!(await p.getByText('Cancel missed days').count())) throw new Error('no late-arrival choice');
await p.screenshot({ path: `${OUT}/late-arrival-choice-375.png` });
await b.close();
