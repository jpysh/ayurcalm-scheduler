// node scripts/uat-1314.mjs before|after — Patients search in the header (#1314), 375x812 at normal and 200% text, on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8399';
const when = process.argv[2] || 'after';
const OUT = 'docs/design/uat/2026-10-27-patients-search';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
for (const [zoom, tag] of [[1, '375'], [2, '375-200pct']]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(([t, z]) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${16 * z}px`; }); }, [token, zoom]);
  const p = await ctx.newPage();
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${when}-patients-${tag}.png` });
  await ctx.close();
}
await b.close();
