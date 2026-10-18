// node scripts/uat-902.mjs — the "Undo anyway" toast at 375x812, 100% and 200% text (#902).
// Against a throwaway seeded stack (E2E_BASE_URL); every write is answered in the page, nothing is changed.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8097';
const OUT = 'docs/design/uat/2026-10-18-large-text-toast';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const b = await chromium.launch();
for (const z of ['100', '200']) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = z + '%'; }); }, [token, z]);
  const p = await ctx.newPage();
  let n = 0;
  await p.route('**/api/appointments/*', (r) => r.request().method() !== 'PUT' ? r.continue() : ++n === 2
    ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ reason: 'CHANGED_SINCE', message: 'It was changed since, on another phone or link.' }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated_at: '2030-01-01T10:00:00.000Z' }) }));
  await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Menu', exact: true }).click();
  await p.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  await p.getByRole('dialog').locator('input[type=date]').fill(tomorrow); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^\d\d:\d\d/ }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }).click();
  await p.getByRole('dialog').getByRole('button', { name: /didn't come$/ }).click(); await p.waitForTimeout(800);
  await p.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/after-toast-${z}.png` });
  await ctx.close();
}
await b.close();
