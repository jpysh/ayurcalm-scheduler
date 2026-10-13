// node scripts/uat-polish-patients.mjs — a day patient's list row, card and own link, at 375x812 and 200% text (#720).
// SHOT=before against main, SHOT=after (default) against the branch. Finds today's first day patient from the server.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-09-polish-patients';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (path, method = 'GET') => (await fetch(`${APP}/api${path}`, { method, headers: { Authorization: `Bearer ${token}` } })).json();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: (await api('/settings')).timezone }).format(new Date());
const all = await api('/patients');
const visitor = (Array.isArray(all) ? all : all.patients).find((p) => p.Stays.some((s) => !s.on_site && s.start_date.slice(0, 10) === today && s.end_date.slice(0, 10) === today));
const link = await api(`/patients/${visitor.id}/link`, 'POST');
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  const big = async () => { if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(500); };
  const z = zoom === 2 ? '-200' : '';
  await p.goto(APP + '/'); await p.waitForTimeout(2500); await big();
  await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
  await p.getByRole('dialog').last().getByRole('button', { name: /^Patients/ }).click(); await p.waitForTimeout(1500);
  const row = p.getByRole('button', { name: new RegExp(visitor.name) }).first();
  await row.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/${SHOT}-list${z}.png` });
  await row.click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${SHOT}-card${z}.png` });
  await p.goto(`${APP}/l/${link.token ?? link}`); await p.waitForTimeout(2000); await big();
  await p.getByText(/How was your/).scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/${SHOT}-link${z}.png` });
  if (zoom === 1) console.log(SHOT, visitor.name, (await p.getByText(/How was your/).first().innerText()));
  await ctx.close();
}
await b.close();
