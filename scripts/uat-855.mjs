// node scripts/uat-855.mjs — after-shots for #855 at 375x812 and 200% text: Events, a treatment card, Search.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/855';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const big = async (name) => { await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}.png` }); };
await p.goto(`${APP}/admin/events`); await p.waitForTimeout(1500); await big('events-200');
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Menu', exact: true }).click();
await p.getByRole('dialog').getByRole('button', { name: /^Search/ }).click();
await p.getByRole('textbox').last().fill('anj'); await big('search-200');
await b.close();
