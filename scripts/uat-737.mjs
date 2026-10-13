// E2E_BASE_URL=http://localhost:8737 node scripts/uat-737.mjs — #737: a leave still to come shows on the Staff row and sheet. 375x812, before and after.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-13-staff-upcoming-leave';
const SHOT = process.env.SHOT || 'after';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/team`); await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/${SHOT}-1-row.png` });
const row = p.getByRole('button', { name: /Not available (?!today)/ }).first();
const ok = (await row.count()) > 0;
if (ok) { await row.click(); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${SHOT}-2-sheet.png` }); }
console.log(ok ? 'pass' : 'FAIL', 'a row names a leave still to come');
if (SHOT === 'after') writeFileSync(`${OUT}/README.md`, `# #737 UAT, 13 Oct (demo seed)\n\n${ok ? 'pass' : 'FAIL'}: a row names a leave still to come.\n\nBefore: ![](before-1-row.png)\n\nAfter: ![](after-1-row.png) ![](after-2-sheet.png)\n`);
await b.close();
process.exit(ok || SHOT === 'before' ? 0 : 1);
