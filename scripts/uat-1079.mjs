// node scripts/uat-1079.mjs — the therapy sheet asking about booked treatments (#1079), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8106';
const OUT = 'docs/design/uat/2026-10-22-therapy-length';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/therapies`); await p.waitForTimeout(2500);
await p.getByText('Shirodhara', { exact: true }).first().click(); await p.waitForTimeout(800);
const len = p.getByRole('dialog').getByLabel(/length|minutes/i).first();
await len.fill('90').catch(async () => { await len.selectOption('90'); });
await p.getByRole('button', { name: 'Save the therapy' }).click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/ask-booked-375.png` });
await b.close();
