// node scripts/uat-polish-team-empty-894.mjs — the menu and Staff on a centre with the example data cleared, 375x812 (#894).
// SHOT=before against main, SHOT=after (default) against the branch; E2E_BASE_URL is a throwaway stack after Settings, Demo data, Clear.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8099';
const SHOT = process.env.SHOT || 'after';
const OUT = 'docs/design/uat/2026-10-18-team-empty';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/${SHOT}-menu.png` });
await p.goto(`${APP}/admin/team`); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/${SHOT}-staff.png` });
await b.close();
