// E2E_BASE_URL=http://localhost:8097 node scripts/uat-695-status.mjs — #695 part 5: list rows and Search say when a thing is not available. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-availability-status';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const therapy = (await (await fetch(`${APP}/api/therapies`, { headers: auth })).json()).find((t) => /Shirodhara/.test(t.name));
const day = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const off = await (await fetch(`${APP}/api/timeoff`, { method: 'POST', headers: auth, body: JSON.stringify({ entity_type: 'therapy', entity_id: therapy.id, start_date: `${day}T00:00:00.000Z`, end_date: `${day}T00:00:00.000Z`, description: 'Oil ran out', plan: false }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const res = [];
const check = (name, ok) => { res.push([name, ok]); console.log(ok ? 'pass' : 'FAIL', name); };
try {
  await p.goto(`${APP}/admin/therapies`); await p.waitForTimeout(2500);
  await p.getByText(/^Not available /).first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/01-therapies.png` });
  check('the therapy row says when it is not available', (await p.getByText(/^Not available /).count()) >= 1);
  await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Menu' }).click(); await p.waitForTimeout(600); await p.getByRole('dialog').getByText(/^Search/).first().click(); await p.waitForTimeout(600);
  await p.keyboard.type('shiro'); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/02-search.png` });
  check('Search lists it under Not available', /NOT AVAILABLE/i.test(await p.locator('body').innerText()) && /Therapy · Not available/.test(await p.locator('body').innerText()));
} finally {
  await fetch(`${APP}/api/timeoff/${off.id}`, { method: 'DELETE', headers: auth });
}
writeFileSync(`${OUT}/README.md`, `# #695 part 5 UAT, 9 Oct (demo seed)\n\n| Step | Result |\n|---|---|\n${res.map(([n, ok]) => `| ${n} | ${ok ? 'pass' : 'FAIL'} |`).join('\n')}\n\n![](01-therapies.png) ![](02-search.png)\n`);
await b.close();
process.exit(res.every(([, ok]) => ok) ? 0 : 1);
