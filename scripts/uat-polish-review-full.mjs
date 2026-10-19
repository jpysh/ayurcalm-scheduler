// node scripts/uat-polish-review-full.mjs — after shots for the review's cosmetics (#1025, #1026, #1027) at 375x812,
// on the two review stacks left by scripts/uat-review-full.mjs (DEMO_URL, NEW_URL).
import { chromium } from '@playwright/test';
const DEMO = process.env.DEMO_URL || 'http://localhost:8411';
const NEW = process.env.NEW_URL || 'http://localhost:8412';
const OUT = 'docs/design/uat/2026-10-21-review-full';
const login = async (APP) => (await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json()).token;
const b = await chromium.launch();
const phone = async (APP, token) => {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  if (token) await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  return ctx.newPage();
};
const dt = await login(DEMO);
const doc = (await (await fetch(`${DEMO}/api/staff`, { headers: { Authorization: `Bearer ${dt}` } })).json()).find((s) => s.role === 'doctor');
const { token: link } = await (await fetch(`${DEMO}/api/staff/${doc.id}/link`, { method: 'POST', headers: { Authorization: `Bearer ${dt}` } })).json();
let p = await phone(DEMO);
await p.goto(`${DEMO}/l/${link}`); await p.waitForTimeout(2500);
await p.getByRole('button').filter({ hasText: /Day \d+/ }).first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-1025-readings-375.png` });
p = await phone(DEMO, dt);
await p.goto(`${DEMO}/`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(700);
await p.getByRole('dialog').getByRole('button', { name: /need you/ }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-1026-sos-375.png` });
p = await phone(NEW, await login(NEW));
await p.goto(`${NEW}/admin/rooms`); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/after-1027-rooms-375.png` });
await b.close();
