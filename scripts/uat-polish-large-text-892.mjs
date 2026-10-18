// node scripts/uat-polish-large-text-892.mjs — menu, hours and packages sheets at 375x812, 100% and 200% text (#892).
// SHOT=before against main, SHOT=after (default) against the branch; E2E_BASE_URL is a throwaway seeded stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8098';
const SHOT = process.env.SHOT || 'after';
const OUT = 'docs/design/uat/2026-10-18-large-text';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const z of ['100', '200']) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = z + '%'; }); }, [token, z]);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(800);
  await p.getByRole('dialog').evaluate((d) => d.querySelector('.overflow-y-auto').scrollTo(0, 9999)); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${SHOT}-menu-${z}.png` });
  for (const [name, row] of [['hours', /^Opening hours/], ['packages', /^Packages and/]]) {
    await p.goto(`${APP}/admin/settings`); await p.waitForTimeout(2000);
    await p.getByRole('button', { name: row }).click(); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${SHOT}-${name}-${z}.png` });
  }
  await ctx.close();
}
await b.close();
