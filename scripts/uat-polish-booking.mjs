// node scripts/uat-polish-booking.mjs — Book sheet after today's hours (polish 22 Oct), 375x812 and 200% text, on the local stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-22-book-sheet-polish';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [name, zoom] of [['375', 1], ['375-200pc', 2]]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-10-22T22:30:00+05:30'));
  await p.goto(`${APP}/?date=2026-10-22`); await p.waitForTimeout(3000);

  if (zoom > 1) await p.addStyleTag({ content: 'html{font-size:200%}' });
  await p.getByRole('button', { name: /book a treatment/i }).first().click();
  await p.getByPlaceholder('Search patients').fill('Vivaan'); await p.waitForTimeout(1500);
  await p.getByRole('dialog').getByText('Vivaan Gupta').first().click(); await p.waitForTimeout(1000);
  await p.getByRole('dialog').getByText('Same as last time').first().click();
  await p.waitForTimeout(1500);
  await p.getByRole('dialog').locator('input[type=date]').first().fill('2026-10-22'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/after-${name}.png` });
  await ctx.close();
}
await b.close();
