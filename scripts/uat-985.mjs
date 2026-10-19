// node scripts/uat-985.mjs — Close the centre for part of a day, with what is booked then, at 375x812 (#985). E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-19-part-day-closure-985';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/timeoff`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /Centre closed days/ }).click(); await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Close another day/ }).click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Part of a day' }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-part-day-375.png` });
await b.close();
