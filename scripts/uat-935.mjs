// node scripts/uat-935.mjs — Add patient stays on the list with the room named (#935), and the 80-letter name counter.
// Against a throwaway seeded stack (E2E_BASE_URL); it adds one patient.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8097';
const OUT = 'docs/design/uat/2026-10-18-add-patient-stays';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'New patient', exact: true }).click();
const d = p.getByRole('dialog');
await d.locator('input[maxlength="80"]').pressSequentially('Kavita Venkataraghavan Subramaniam Iyer Narayanan Pillai Chandrasekharan Menon X');
await d.getByRole('button', { name: 'Female' }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-long-name.png` });
await d.getByRole('button', { name: 'Add patient' }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-add-stays-on-list.png` });
await b.close();
