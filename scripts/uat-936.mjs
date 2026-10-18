// node scripts/uat-936.mjs — Back closes the New patient sheet instead of stranding it (#936).
// Against a throwaway seeded stack (E2E_BASE_URL); opens a sheet, types a name, presses Back, writes nothing.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8236';
const OUT = 'docs/design/uat/2026-10-18-back-closes-sheet';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Menu', exact: true }).click();
await p.getByRole('dialog').getByRole('button', { name: /^Patients/ }).click(); await p.waitForTimeout(1000);
console.log('url', p.url());
await p.getByRole('button', { name: 'New patient', exact: true }).click(); await p.waitForTimeout(800);
console.log('dialogs open', await p.getByRole('dialog').count());
await p.goBack(); await p.waitForTimeout(800);
console.log('after back: dialogs', await p.getByRole('dialog').count(), 'url', p.url());
await p.screenshot({ path: `${OUT}/after-back.png` });
await b.close();
