// node scripts/uat-569.mjs — Add a therapist says none ticked means every therapy (#569), at 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-569-gives-every';
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
await go(p.getByRole('button', { name: 'Add a therapist or doctor', exact: true }));
await p.getByLabel(/^Name/).first().fill('Uat Kiran');

await p.getByRole('button', { name: 'Female', exact: true }).click(); console.log('note shown =', await p.getByText('None ticked means they can give every therapy.').isVisible());
await p.screenshot({ path: `${OUT}/01-gives-every.png` });
await b.close();
