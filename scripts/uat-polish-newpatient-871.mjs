// node scripts/uat-polish-newpatient-871.mjs before|after — #871 at 375x812 and 200%: New patient with a name and no gender.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/polish-newpatient-871';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(1800);
await p.getByRole('navigation', { name: 'Main' }).getByRole('button').first().click(); await p.waitForTimeout(800);
await p.getByRole('dialog').last().getByLabel(/^Name/).first().fill('Saoirse Ní Bhriain'); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/no-gender-${WHEN}.png` });
await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/no-gender-${WHEN}-200.png` });
await b.close();
