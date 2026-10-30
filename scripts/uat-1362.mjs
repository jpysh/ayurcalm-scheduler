// node scripts/uat-1362.mjs — Remove on the patient card, and its confirm, at 375x812 (#1362). Nothing is removed.
// E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-30-remove-patient-1362';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const [who] = await (await fetch(`${APP}/api/patients?resident_on=${today}`, { headers: { Authorization: `Bearer ${token}` } })).json();
await p.getByText(who.name, { exact: true }).first().click(); await p.waitForTimeout(1500);
const remove = p.getByRole('button', { name: /^Remove / });
await remove.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/after-card-foot.png` });
await remove.click(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/after-confirm.png` });
await b.close();
