// node scripts/uat-first-therapies.mjs <before|after> — a new centre's first therapies, at 375x812: Get started, the empty
// Therapies screen, Add from library, and a first guest's week. Clears the demo centre first. Throwaway stack only,
// started (#1005). E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const tag = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-20-first-therapies';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (path, body, method) => fetch(`${APP}/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.json());
if ((await api('/therapies')).length) await api('/settings/clear-demo-data', { keep: [] });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const shot = async (name) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${tag}-${name}-375.png` }); };
await p.goto(`${APP}/`); await shot('1-day');
await p.goto(`${APP}/admin/therapies`); await shot('2-therapies-empty');
await (tag === 'before' ? p.getByText('Standard therapies').first() : p.getByRole('button', { name: 'Add the common therapies' })).click(); await shot('3-library-top');
if (tag !== 'before') {
  await p.getByRole('button', { name: 'Change Abhyanga' }).click(); await shot('4-library-change');
  await p.getByText('Agnikarma', { exact: true }).scrollIntoViewIfNeeded(); await shot('5-library-more');
  await p.getByRole('button', { name: /^Add \d+ therap/ }).click(); await shot('6-therapies-added');
}
await b.close();
