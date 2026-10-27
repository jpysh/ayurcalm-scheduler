// node scripts/uat-1201.mjs — guest room tags (#1201) on Guest rooms and in the room's sheet, 375x812, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8391';
const OUT = 'docs/design/uat/2026-10-27-room-tags';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (m, p, b) => fetch(`${APP}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const first = (await api('GET', '/guest-rooms'))[0];
await api('PUT', `/guest-rooms/${first.id}`, { tags: ['ground floor', 'quiet'] });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/admin/guestrooms`); await p.waitForTimeout(2500);
await p.getByText('ground floor, quiet').first().scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/guest-rooms-tags-375.png` });
await b.close();
