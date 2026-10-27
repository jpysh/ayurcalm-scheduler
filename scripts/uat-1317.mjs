// node scripts/uat-1317.mjs before|after (before turns the #1317 rule off on the same build) — every screen with a page header at 375x812, 100% and 200% text (#1317), on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8402';
const when = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-27-header-icons';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [zoom, tag] of [[1, '100'], [2, '200']]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(([t, z, w]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${16 * z}px`; if (w === 'before') document.head.insertAdjacentHTML('beforeend', '<style>.pagehead-wrap{container-type:normal}</style>'); }); }, [token, zoom, when]);
  const p = await ctx.newPage();
  for (const s of ['patients', 'guestrooms', 'team', 'rooms', 'timeoff', 'diet', 'settings', 'therapies', 'events', 'log']) {
    await p.goto(`${APP}/admin/${s}`); await p.waitForTimeout(2000);
    await p.screenshot({ path: `${OUT}/${when}-${s}-${tag}.png`, clip: { x: 0, y: 0, width: 375, height: 700 } });
  }
  await ctx.close();
}
await b.close();
