// node scripts/uat-polish-settings-861.mjs before|after — #861 at 375x812 and 200%: Therapies' header, your own row in People with access,
// and the trial banner. TRIAL_URL, TRIAL_EMAIL and TRIAL_PASSWORD point at a trial centre for the banner; without them it is skipped.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/polish-settings-861';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const page = async (app, email, password) => {
  const { token } = await (await fetch(`${app}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, e]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', e); }, [token, email]);
  return ctx.newPage();
};
const p = await page(APP, 'admin@example.com', 'demo1234');
const shot = async (pg, name) => { await pg.waitForTimeout(700); await pg.screenshot({ path: `${OUT}/${name}-${WHEN}.png` }); await pg.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await pg.waitForTimeout(400); await pg.screenshot({ path: `${OUT}/${name}-${WHEN}-200.png` }); await pg.evaluate(() => { document.documentElement.style.fontSize = ''; }); };
await p.goto(`${APP}/admin/therapies`); await p.waitForTimeout(1500); await shot(p, 'therapies');
await p.goto(`${APP}/admin/settings`); await p.waitForTimeout(1500);
await p.getByRole('button', { name: /^People with access/ }).click(); await p.waitForTimeout(800);
await p.getByRole('dialog').last().getByRole('button', { name: /^Demo Admin/ }).click(); await shot(p, 'people-you');
if (process.env.TRIAL_URL) {
  const t = await page(process.env.TRIAL_URL, process.env.TRIAL_EMAIL, process.env.TRIAL_PASSWORD);
  await t.goto(`${process.env.TRIAL_URL}/admin/schedule`); await t.waitForTimeout(2000); await t.evaluate(() => scrollTo(0, 0)); await shot(t, 'trial-banner');
}
await b.close();
