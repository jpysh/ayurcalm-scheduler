// node scripts/uat-982.mjs — a guest's meals sheet with From, Until and "Until leaving" at 375x812 (#982). E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-19-meals-range-982';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /in house/i }).first().click().catch(() => {});
await p.locator('main button, [role=tabpanel] button').filter({ hasText: /Day \d+ of/ }).first().click(); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /diet|meals/i }).first().click(); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Change meals for some days' }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-meals-375.png` });
await b.close();
