// node scripts/uat-1028.mjs — a therapy already booked that day sits last, marked 'Booked 10:00', at 375x812 (#1028). Against a throwaway seeded stack (E2E_BASE_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8093';
const OUT = 'docs/design/uat/2026-10-21-booked-today-1028';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/`); await p.waitForTimeout(2500);
await p.locator('nav[data-kit=bar] button').first().click(); await p.waitForTimeout(1500);
// The first resident under 'Recently booked' has a therapy on today already.
await p.getByText(/Recently booked/i).locator('xpath=following::button[1]').click(); await p.waitForTimeout(1500);
const booked = p.getByText(/Booked \d\d:\d\d/).first();
await booked.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/after-booked-last-375.png` });
await b.close();
