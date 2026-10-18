// node scripts/uat-873.mjs — a treatment given by two: With lists each, one tapped is replaced alone (#873), at 375x812.
// Against a throwaway seeded stack (E2E_BASE_URL); reads only, books nothing.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8098';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-18-one-of-two';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
await p.getByText(/ · with .+ & .+/).last().click(); await p.waitForTimeout(800);
await p.getByRole('dialog').getByRole('button', { name: /^With/ }).click(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/after-therapists.png` });
await p.getByRole('dialog').getByRole('button', { name: /Change ›/ }).last().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-instead-of.png` });
await b.close();
