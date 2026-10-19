// node scripts/uat-989-card.mjs — patient card "Last seen" at 351x640 and 360x650 (#989).
import { chromium } from '@playwright/test';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8189';
const OUT = 'docs/design/uat/2026-10-19-back-headers-989';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [w, h] of [[351, 640], [360, 650]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  const n = await p.getByRole('button', { name: /Day \d+ of \d+/ }).count();
  let found = false; const OK = ['Arjun'];
  for (let i = 0; i < n && !found; i++) {
    await p.getByRole('button', { name: /Day \d+ of \d+/ }).nth(i).click(); await p.waitForTimeout(800);
    found = await p.getByText(/Last seen ·/).first().isVisible().catch(() => false);
    if (i === 0) await p.screenshot({ path: `${OUT}/dbg-${w}.png` });
    if (found) { await p.getByText(/Last seen ·/).first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/card-${w}.png` }); }
    else { await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
  }
  console.log(w, 'found', found, 'of', n);
  await ctx.close();
}
await b.close();
