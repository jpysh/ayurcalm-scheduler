// node scripts/uat-903.mjs — Package and Accommodation choices at 375x812, 100% and 200% text (#903).
// Against a throwaway seeded stack (E2E_BASE_URL); reads only.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8097';
const OUT = 'docs/design/uat/2026-10-18-large-text-picker';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const z of ['100', '200']) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = z + '%'; }); }, [token, z]);
  const p = await ctx.newPage();
  for (const row of ['Package', 'Accommodation']) {
    await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2000);
    await p.getByRole('button', { name: /Day \d+ of \d+/ }).first().click(); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: new RegExp(`^${row}`) }).click(); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/after-${row.toLowerCase()}-${z}.png` });
  }
  await ctx.close();
}
await b.close();
