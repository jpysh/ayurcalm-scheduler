// node scripts/uat-1213.mjs — guest rooms at a glance: rooms down, seven nights across, each guest a bar (#1213), 375x812 and 200% text, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-rooms-week';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/guestrooms`); await p.waitForTimeout(2500);
  await p.getByText('Seven nights').click(); await p.waitForTimeout(2500);
  if (zoom === 2) await p.addStyleTag({ content: 'html{font-size:200%}' });
  await p.getByText('Seven nights').scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide && zoom === 1) throw new Error('the week scrolls sideways at 375px');
  await p.screenshot({ path: `${OUT}/week${zoom === 2 ? '-200' : ''}-375.png` });
  await ctx.close();
}
await b.close();
