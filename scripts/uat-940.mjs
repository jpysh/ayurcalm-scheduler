// node scripts/uat-940.mjs — Day on a closed holiday at 375x812 (#940). Against a throwaway seeded stack (E2E_BASE_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8093';
const OUT = 'docs/design/uat/2026-10-18-closed-day-940';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
const mk = await fetch(`${APP}/api/timeoff`, { method: 'POST', headers: H, body: JSON.stringify({ entity_type: 'center', date: day, start_date: day, end_date: day, description: 'Dussehra' }) });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/schedule?date=${day}`); await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/after-closed-day.png` });
await b.close();
console.log(mk.status);
