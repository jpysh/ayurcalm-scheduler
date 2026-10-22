// node scripts/uat-week-sim.mjs — the week simulation's shots at 375x812 on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8099';
const OUT = 'docs/design/uat/2026-10-22-week-sim';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const page = async (day) => {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(`${day}T08:30:00+05:30`));
  return p;
};
const shot = async (p, name) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${name}-375.png` }); };
const tryStep = async (name, fn) => { try { await fn(); } catch (e) { console.log(`skip ${name}: ${e.message.split('\n')[0]}`); } };

for (const d of ['2026-10-24', '2026-10-26', '2026-10-28']) {
  const p = await page(d);
  await p.goto(`${APP}/`); await p.waitForTimeout(3500);
  await shot(p, `day-${d.slice(5)}`);
  if (d === '2026-10-26') await tryStep('print', async () => {
    await p.getByRole('button', { name: 'Menu', exact: true }).click();
    await p.getByRole('dialog').getByRole('button', { name: /^Print/ }).first().click();
    await shot(p, 'print-sheet-26');
  });
  await p.context().close();
}
const p = await page('2026-10-28');
await tryStep('booking', async () => {
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  await p.getByText('Sim Leela A').first().click(); await p.waitForTimeout(1500);
  await shot(p, 'card-leela');
  await p.getByRole('button', { name: /Book a treatment/ }).first().click();
  await shot(p, 'booking-leela');
});
await tryStep('starters', async () => {
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  await p.getByText('Sim Anya H').first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Plan next week' }).click();
  await shot(p, 'starters-anya-h');
});
await tryStep('toast', async () => {
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: /Add (a )?(patient|guest|resident)/i }).first().click(); await p.waitForTimeout(800);
  await p.getByLabel(/name/i).first().fill('Sim Toast Z');
  await p.getByRole('button', { name: /^(Add|Save)/ }).last().click();
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/toast-added-375.png` });
});
await b.close();
