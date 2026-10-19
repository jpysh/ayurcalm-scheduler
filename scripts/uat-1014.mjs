// node scripts/uat-979.mjs — the booking sheet on a full day at 375x812 (#1014).
// Puts every therapist away from 12:00 three days ahead, so that day is full. Run on a throwaway stack (E2E_BASE_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-19-booking-full-1014';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (path, body) => fetch(`${APP}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.json());
const day = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
for (const s of (await api('/staff')).filter((s) => s.role !== 'doctor')) await api('/timeoff', { entity_type: 'staff', entity_id: s.id, date: day, start_time: '12:00', end_time: '23:59', description: 'UAT', plan: false });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/`); await p.waitForTimeout(2500);
const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
await p.getByRole('button', { name: label, exact: true }).click(); await p.waitForTimeout(1500);
await p.locator('nav[data-kit=bar] button').first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/after-booking-375.png` });
await b.close();
