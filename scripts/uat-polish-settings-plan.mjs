// node scripts/uat-polish-settings-plan.mjs — an expired trial taps "Choose a plan" on the refusal toast, at 375x812.
//   TRIAL=true APP_PORT=8091 docker compose -p walk-trial up -d --build app
//   docker compose -p walk-trial exec -T db psql -U ayurcalm -d ayurcalm -c "UPDATE \"Settings\" SET trial_started_at = now() - interval '31 days', demo_data = false"
// SHOT=before against main, SHOT=after (default) against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8091';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-17-polish-settings-plan';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(APP); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Book a treatment' }).click();
await p.getByRole('button', { name: 'Choose a plan' }).click();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/${SHOT}-choose-a-plan.png` });
await b.close();
