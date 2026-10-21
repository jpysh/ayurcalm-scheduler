// node scripts/uat-1023.mjs — #1023 after-shots at 375x812 on a throwaway stack (APP, default :8091) with no
// therapists: the "Full from" line goes from the Staff week once a therapist is added from the form.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP || 'http://localhost:8091';
const OUT = 'docs/design/uat/2026-10-21-full-from-why';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (path, body, method) => fetch(`${APP}/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
if ((await (await api('/therapies')).json()).length) await api('/settings/clear-demo-data', { keep: [] });
for (const s of await (await api('/staff')).json()) await api(`/staff/${s.id}`, undefined, 'DELETE');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/`); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /^Add your therapists/ }).first().click(); await p.waitForTimeout(1500);
let d = p.getByRole('dialog').last();
if (!(await d.count())) { await p.getByRole('button', { name: /Add (therapist|someone)/ }).first().click(); d = p.getByRole('dialog').last(); }
await d.getByLabel(/name/i).first().fill('Lakshmi');
await d.getByRole('button', { name: /^(Woman|Female)$/ }).first().click();
await d.getByRole('button', { name: /^Add/ }).last().click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/02-therapist-added-375.png` });
console.log('full-from line now:', await p.getByText(/^Full from/).count());
await b.close();
