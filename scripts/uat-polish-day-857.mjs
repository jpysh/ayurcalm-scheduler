// node scripts/uat-polish-day-857.mjs before|after — #857 at 375x812: a finished treatment's note line, the cancel toast.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/polish-day-857';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}-${WHEN}.png` }); await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}-${WHEN}-200.png` }); await p.evaluate(() => { document.documentElement.style.fontSize = ''; }); };
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2000);
// The first treatment of the day has finished by the afternoon the walk runs in.
await p.getByRole('button', { name: /Riya Sharma/ }).first().click();
await shot('finished-card');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
const later = p.getByRole('button').filter({ hasText: / · with / }).filter({ hasNotText: /didn't come|not in/ }).last();
await later.click(); await p.waitForTimeout(800);
await dlg().getByRole('button', { name: /^Something wrong/ }).click(); await p.waitForTimeout(600);
await dlg().getByRole('button', { name: /wants to cancel$/ }).click(); await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/cancel-toast-${WHEN}.png` });
console.log(await p.locator('[data-sonner-toast]').allInnerTexts());
await p.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
await b.close();
