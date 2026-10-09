// node scripts/uat-570.mjs — Team follows a part-day change at once (#570), at 375x812.
// Marks Ravi Gupta leaving early at 15:00 today and reads his row without reopening the screen.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-570-team-fresh';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const go = async (l) => { await l.click({ timeout: 6000 }); await p.waitForTimeout(900); };
await p.goto(APP + '/'); await p.waitForTimeout(2000);
await go(p.getByRole('button', { name: 'Menu', exact: true }));
await go(p.getByRole('dialog').last().getByRole('button', { name: /^Team/ }));
const ravi = p.getByRole('button', { name: /Ravi Gupta/ }).first();
console.log('before:', (await ravi.innerText()).replace(/\s+/g, ' '));
await go(ravi);
await go(p.getByRole('button', { name: /Leaving early/ }));
await p.getByRole('dialog').last().locator('select').first().selectOption('15:00');
await go(p.getByRole('button', { name: 'Move what they miss' }));
await p.waitForTimeout(1500);
const row = p.getByRole('button', { name: /Ravi Gupta/ }).first();
await row.scrollIntoViewIfNeeded();
console.log('after: ', (await row.innerText()).replace(/\s+/g, ' '));
await p.screenshot({ path: `${OUT}/01-after-leaving-early.png` });
await b.close();
