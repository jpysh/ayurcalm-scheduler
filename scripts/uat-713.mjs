// E2E_BASE_URL=http://localhost:8212 node scripts/uat-713.mjs — #713: an arrival with nothing booked, and the setup's timezone on an Indian phone. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-11-new-centre-polish';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (m, path, body) => fetch(`${APP}/api${path}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const res = [];
const check = (name, ok) => { res.push([name, ok]); console.log(ok ? 'pass' : 'FAIL', name); };
await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
await p.getByRole('navigation', { name: 'Main' }).getByRole('button').first().click(); await p.waitForTimeout(800);
const dlg = () => p.getByRole('dialog').last();
await dlg().getByLabel('Name').fill('Uat Newcomer'); await dlg().getByRole('button', { name: /^Female$/ }).click();
await dlg().getByRole('button', { name: /^Add Uat/ }).click(); await p.waitForTimeout(2000);
const all = await api('GET', '/patients'); const me = (all.patients ?? all.data ?? all).find((x) => x.name === 'Uat Newcomer');
// The demo books a new arrival's consultation itself; this shot is of a first day with nothing on it.
for (const a of await api('GET', `/appointments?patient_id=${me.id}`).then((r) => r.data ?? r)) await api('DELETE', `/appointments/${a.id}`);
await p.reload(); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /^Uat Newcomer/ }).first().click(); await p.waitForTimeout(1500);
await dlg().getByText(/^Arrives today/).scrollIntoViewIfNeeded().catch(() => {});
await p.screenshot({ path: `${OUT}/01-card-arrival.png` });
check('an arrival with nothing booked reads "Arrives today", not "Rest day"', (await dlg().getByText('Arrives today: nothing booked yet.').count()) === 1);
const s = await api('GET', '/settings');
const put = (setup_complete) => api('PUT', '/settings', { centre_name: s.centre_name, setup_complete });
await put(false);
try {
  await p.goto(`${APP}/setup`); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(800);
  await p.getByLabel('Timezone').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/02-setup-timezone.png` });
  const opts = await p.getByLabel('Timezone').locator('option').allTextContents();
  check('the note names Asia/Kolkata and Calcutta is not listed twice', (await p.getByText('This phone is in Asia/Kolkata.', { exact: false }).count()) === 1 && !opts.includes('Asia/Calcutta'));
} finally { await put(true); }
await fetch(`${APP}/api/patients/${me.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
writeFileSync(`${OUT}/README.md`, `# #713 UAT, 11 Oct (demo seed)\n\n| Step | Result |\n|---|---|\n${res.map(([n, ok]) => `| ${n} | ${ok ? 'pass' : 'FAIL'} |`).join('\n')}\n\nBefore (the walk's trial centre): ![](00-before-card.png)\n\nAfter: ![](01-card-arrival.png) ![](02-setup-timezone.png)\n`);
await b.close();
process.exit(res.every(([, ok]) => ok) ? 0 : 1);
