// node scripts/uat-polish-rooms-573.mjs — Room rows say today's use in one line (#573), at 375x812 and 200% text.
// SHOT=before against main, SHOT=after (default) against the branch. ACT=1 also takes Annexe back into use and out for three days.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-09-polish-room-rows';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const flat = (t) => t.replace(/\s+/g, ' ').trim();
for (const zoom of [1, 2]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  const go = async (l) => { await l.click({ timeout: 6000 }); await p.waitForTimeout(900); };
  await p.goto(APP + '/'); await p.waitForTimeout(2000);
  await go(p.getByRole('button', { name: 'Menu', exact: true }));
  await go(p.getByRole('dialog').last().getByRole('button', { name: /^Rooms/ }));
  if (zoom === 2) await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${SHOT}-rooms${zoom === 2 ? '-200' : ''}.png` });
  const annexe = p.getByRole('button', { name: /^Annexe/ }).first();
  if (zoom === 1) {
    console.log(SHOT, 'Annexe row:', flat(await annexe.innerText()));
    await go(annexe);
    await p.screenshot({ path: `${OUT}/${SHOT}-annexe-sheet.png` });
    if (process.env.ACT) {
      await go(p.getByRole('dialog').last().getByRole('button', { name: /^Back in use/ }));
      console.log('after Back in use:', flat(await annexe.innerText()));
      await go(annexe);
      await go(p.getByRole('dialog').last().getByRole('button', { name: /^Out of use for days/ }));
      const to = p.getByRole('dialog').last().locator('input[type="date"]').nth(1);
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await to.fill(d);
      await p.screenshot({ path: `${OUT}/${SHOT}-out-for-days.png` });
      await go(p.getByRole('button', { name: 'Mark out of use, move what is booked' }));
      await p.waitForTimeout(1200);
      console.log('after three days out:', flat(await annexe.innerText()));
      await p.screenshot({ path: `${OUT}/${SHOT}-out-three-days.png` });
    }
  }
  await ctx.close();
}
await b.close();
