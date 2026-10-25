// node scripts/uat-1147.mjs — Get started's rooms step with its own OPD room (#1147), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8091';
const OUT = 'docs/design/uat/2026-10-25-opd-room';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/setup/mine`); await p.waitForTimeout(2500);
const name = p.getByLabel(/centre/i).first();
if (await name.inputValue() === '') await name.fill('Night Centre');
await p.getByLabel('Doctors').fill('Dr Asha');
await p.getByLabel('Therapists').fill('Ravi');
for (const btn of await p.getByRole('button', { name: /^(Woman|Man)$/ }).all()) { await btn.click(); }
await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(800);
await p.getByRole('textbox', { name: 'Consultation room' }).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/rooms-step-375.png` });
await b.close();
