// node scripts/uat-942.mjs — Attention with 50 guests missing a diet plan: one row, one plan, done (#942). Against a throwaway seeded stack (E2E_BASE_URL); it adds 50 patients unless ADD=0.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8242';
const OUT = 'docs/design/uat/2026-10-18-attention-bulk-942';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const day = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const end = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
if (process.env.ADD !== '0') for (let i = 0; i < 50; i++) {
  const pt = await (await fetch(`${APP}/api/patients`, { method: 'POST', headers: H, body: JSON.stringify({ name: `Bulk Guest ${i}`, gender: i % 2 ? 'female' : 'male' }) })).json();
  await fetch(`${APP}/api/patients/${pt.id}/stays`, { method: 'POST', headers: H, body: JSON.stringify({ start_date: day, end_date: end, duration_days: 8 }) });
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/before-open.png` });
await p.mouse.click(338, 776); await p.waitForTimeout(800);
await p.getByText('Things to fix or decide').click();
await p.waitForTimeout(1500);
await p.getByText(/No diet plan · \d+ guests/).scrollIntoViewIfNeeded();
await p.mouse.wheel(0, 150); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/after-attention.png` });
await p.getByLabel('Diet plan').selectOption({ index: 1 });
await p.getByRole('button', { name: /Set diet for/ }).click(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/after-set.png` });
await b.close();
