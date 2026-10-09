// E2E_BASE_URL=http://localhost:8097 node scripts/uat-695-shortcuts.mjs — #695 part 4: each thing opens the one form. 375x812.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-09-availability-shortcuts';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const res = [];
const check = (name, ok) => { res.push([name, ok]); console.log(ok ? 'pass' : 'FAIL', name); };

await p.goto(`${APP}/admin/rooms`); await p.waitForTimeout(2500);
const rooms = await (await fetch(`${APP}/api/rooms`, { headers: { Authorization: `Bearer ${token}` } })).json();
await p.getByText(rooms.filter((r) => r.is_active !== false)[0].name, { exact: true }).first().click(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/01-room-sheet.png` });
const room = await dlg().innerText();
check('room sheet: Not available… and Details, no duplicate out-of-use rows', /Not available…/.test(room) && /Details/.test(room) && !/Out of use for days|Out of use from now/.test(room));
await dlg().getByText('Not available…').click(); await p.waitForTimeout(1200);
check('opens the one form', /not available/i.test(await dlg().innerText()) && /Save and fix/.test(await dlg().innerText()));
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

await p.goto(`${APP}/admin/team`); await p.waitForTimeout(2500);
const staff = await (await fetch(`${APP}/api/staff`, { headers: { Authorization: `Bearer ${token}` } })).json();
await p.getByText(staff.find((x) => x.is_active && x.role !== 'doctor').name, { exact: true }).first().click(); await p.waitForTimeout(800);
await dlg().getByText('In late').click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/02-in-late-form.png` });
check('In late opens the form on Part of a day', /Part of a day/.test(await dlg().innerText()));

writeFileSync(`${OUT}/README.md`, `# #695 part 4 UAT, 9 Oct (demo seed)\n\n| Step | Result |\n|---|---|\n${res.map(([n, ok]) => `| ${n} | ${ok ? 'pass' : 'FAIL'} |`).join('\n')}\n\n![](01-room-sheet.png) ![](02-in-late-form.png)\n`);
await b.close();
process.exit(res.every(([, ok]) => ok) ? 0 : 1);
