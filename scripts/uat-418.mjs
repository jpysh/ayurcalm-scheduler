// node scripts/uat-418.mjs — #418: the inbox groups a therapist's absence into one row, at 375x812. SHOT=00-before on main.
import { chromium } from '@playwright/test';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const OUT = 'docs/design/uat/2026-10-07-inbox-by-cause';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(APP + '/'); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').last().getByRole('button', { name: /need(s)? you/ }).first().click(); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/${SHOT}.png` });
const t = await p.getByRole('dialog').last().innerText();
console.log(SHOT, (t.match(/is not in[^\n]*/g) || []).join(' | '));
if (SHOT === '01') {
  await p.getByRole('button', { name: /^Choose each/ }).first().click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/02.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
  await p.getByRole('dialog').last().getByRole('button', { name: /need(s)? you/ }).first().click(); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: /^Fix all \d+ as shown/ }).first().click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/03.png` });
  console.log('03', (await p.getByRole('dialog').last().innerText().catch(() => 'closed')).split('\n').slice(0, 4).join(' · '));
}
await b.close();
