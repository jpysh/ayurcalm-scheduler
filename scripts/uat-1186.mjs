// node scripts/uat-1186.mjs — lowering a shared guest room to one bed is refused, naming the night and who (#1186), 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8186';
const OUT = 'docs/design/uat/2026-10-26-beds-below-guests';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/guestrooms`); await p.waitForTimeout(2500);
await p.getByText('Names and beds').click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: /^A1/ }).first().click(); await p.waitForTimeout(800);
await p.getByRole('dialog').last().getByRole('radio', { name: '1', exact: true }).or(p.getByRole('dialog').last().getByRole('button', { name: '1', exact: true })).first().click();
await p.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(1200);
if (!(await p.getByText(/Move one first/).count())) throw new Error('no refusal shown');
await p.screenshot({ path: `${OUT}/beds-refused-375.png` });
await b.close();
