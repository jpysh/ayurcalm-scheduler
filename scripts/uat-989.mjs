// node scripts/uat-989.mjs <before|after> — Back headers on five screens at three phone sizes (#989). E2E_BASE_URL picks the stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const tag = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-19-back-headers-989';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [w, h] of [[360, 650], [393, 700], [412, 760]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  for (const name of ['patients', 'rooms', 'team', 'diet', 'guestrooms']) {
    await p.goto(`${APP}/admin/${name}`); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${tag}-${name}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 170 } });
  }
  await ctx.close();
}
await b.close();
