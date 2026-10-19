// node scripts/uat-963.mjs — Settings, Your centre, with Therapies and Classes and events at 375x812 (#963). Against a throwaway seeded stack (E2E_BASE_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8151';
const OUT = 'docs/design/uat/2026-10-19-settings-catalogues-963';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/settings`); await p.waitForTimeout(3000);
await p.getByText('Your centre', { exact: true }).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/after-settings.png` });
await b.close();
