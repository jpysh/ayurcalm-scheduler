// node scripts/uat-918.mjs <before|after> — a long first name in a sheet title at 375x812, 200% text (#918).
// Against a throwaway seeded stack (E2E_BASE_URL): renames one resident to the walk's long name first.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8097';
const OUT = 'docs/design/uat/2026-10-18-sheet-title-918';
const tag = process.argv[2] || 'after';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const pt = (await (await fetch(`${APP}/api/patients`, { headers: H })).json()).find((x) => /^Aditya Chatterjee|^Lakshminarayanan/.test(x.name));
const r = await fetch(`${APP}/api/patients/${pt.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'Lakshminarayanan Chatterjee' }) });
console.log(r.status, await r.text().then((t) => t.slice(0, 120)));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }); }, token);
const p = await ctx.newPage();
for (const [name, file] of [[/^Plan next week/, 'next-week'], [/^Package/, 'package']]) {
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: /^Lakshminarayanan/ }).click(); await p.waitForTimeout(1500);
  await p.getByRole('dialog').getByRole('button', { name }).click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${tag}-${file}-200.png` });
}
await b.close();
