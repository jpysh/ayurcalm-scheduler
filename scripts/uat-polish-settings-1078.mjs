// node scripts/uat-polish-settings-1078.mjs — Settings, catalogues and Availability at 375x812 and 200% text (#1078).
// SHOT=before against main, SHOT=after (default) against the branch; E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8120';
const SHOT = process.env.SHOT || 'after';
const OUT = 'docs/design/uat/2026-10-22-polish-settings-1078';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const z = zoom === 2 ? '-200' : '';
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  const go = async (path) => { await p.goto(`${APP}${path}`); await p.waitForTimeout(2500); if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); };
  const shot = (name) => p.screenshot({ path: `${OUT}/${SHOT}-${name}${z}.png` });
  const sheet = async (row, name, then) => { await go('/admin/settings'); await p.getByRole('button', { name: new RegExp(`^${row}`) }).first().click(); await p.waitForTimeout(1200); if (then) await then(); await shot(name); };
  await go('/admin/settings'); await shot('settings');
  await sheet('Backups', 'backups', () => p.getByText(/another/i).first().scrollIntoViewIfNeeded());
  await sheet('Centre and letterhead', 'letterhead', () => p.getByText('Discharge letterhead').first().scrollIntoViewIfNeeded());
  await sheet('Opening hours', 'timezone', () => p.getByLabel('Timezone').scrollIntoViewIfNeeded());
  await sheet('Help and plan', 'help');
  await sheet('Packages and accommodation', 'packages');
  await go('/admin/timeoff'); await shot('availability');
  await go('/admin/rooms'); await shot('rooms');
  await go('/admin/diet'); await shot('diet');
  await go('/admin/therapies'); await p.getByRole('button', { name: /^Abhyanga/ }).first().click(); await p.waitForTimeout(1000);
  await p.getByText('What the room needs').first().scrollIntoViewIfNeeded().catch(() => {}); await shot('room-needs');
  await ctx.close();
}
await b.close();
