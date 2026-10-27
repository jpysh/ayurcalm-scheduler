// node scripts/uat-1317.mjs before|after — every screen's header (#1317), 375x812 at normal and 200% text, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8399';
const when = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-27-header-large-text';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [zoom, tag] of [[1, '375'], [2, '375-200pct']]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${16 * z}px`; }); }, [token, zoom]);
  const p = await ctx.newPage();
  // Arrive from the day, so every header has its Back.
  await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
  for (const s of ['patients', 'guestrooms', 'team', 'rooms', 'timeoff', 'diet', 'settings', 'therapies', 'events', 'log']) {
    await p.goto(`${APP}/admin/${s}`); await p.waitForTimeout(1800);
    const h = p.locator('h1').first();
    if (await h.count()) await h.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${when}-${s}-${tag}.png`, clip: { x: 0, y: 0, width: 375, height: 812 } });
  }
  await ctx.close();
}
await b.close();
