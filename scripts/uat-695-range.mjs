// E2E_BASE_URL=http://localhost:8097 node scripts/uat-695-range.mjs — #695 part 3: Save and fix plans every day in the range at once. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-availability-range-plan';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const res = [];
const check = (name, ok) => { res.push([name, ok]); console.log(ok ? 'pass' : 'FAIL', name); };

await p.goto(`${APP}/admin/timeoff`); await p.waitForTimeout(2500);
await p.getByRole('navigation', { name: 'Main' }).getByRole('button').first().click(); await p.waitForTimeout(800);
await dlg().getByText('Show treatment rooms').click(); await p.waitForTimeout(500);
await dlg().getByRole('checkbox').first().click();
await dlg().getByRole('button', { name: /^Next/ }).click(); await p.waitForTimeout(800);
await dlg().getByRole('button', { name: 'Some days' }).click(); await p.waitForTimeout(300);
const dates = dlg().locator('input[type="date"]');
const ymd = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await dates.nth(0).fill(ymd(1)); await dates.nth(1).fill(ymd(3)); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/01-form.png` });
await dlg().getByRole('button', { name: 'Save and fix those days' }).click(); await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/02-plan.png` });
const text = await dlg().innerText().catch(() => '');
check('one plan lists more than one day', /The plan/.test(text) && (text.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi) || []).length >= 2);
await dlg().getByRole('button', { name: 'Accept the plan' }).click(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/03-accepted.png` });
check('accepted, said with an Undo', (await p.getByText(/treatments fixed/).count()) === 1 && (await p.getByRole('button', { name: 'Undo' }).count()) >= 1);

writeFileSync(`${OUT}/README.md`, `# #695 part 3 UAT, 9 Oct (demo seed)\n\n| Step | Result |\n|---|---|\n${res.map(([n, ok]) => `| ${n} | ${ok ? 'pass' : 'FAIL'} |`).join('\n')}\n\n![](01-form.png) ![](02-plan.png) ![](03-accepted.png)\n`);
await b.close();
process.exit(res.every(([, ok]) => ok) ? 0 : 1);
