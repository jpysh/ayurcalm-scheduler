// node scripts/uat-1331.mjs <before|after> — cut text at 200% (#1331–#1334): Change day, a therapist link, Settings > Therapies,
// Settings > What needs you, at 375px and 100% / 200% text, on APP_URL. Shots in docs/design/uat/2026-10-28-bigtext.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { cutText } from './cutText.mjs';
const APP = process.env.APP_URL || 'http://localhost:8403';
const OUT = 'docs/design/uat/2026-10-28-bigtext';
const WHEN = process.argv[2] || 'after';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path) => (await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}` } })).json();
const therapist = (await api('GET', '/staff')).find((s) => s.role === 'therapist' && s.is_active);
const link = (await api('POST', `/staff/${therapist.id}/link`)).token;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const screens = {
  'change-day': async () => { await p.goto(`${APP}/admin/schedule`); await p.getByRole('button', { name: 'Menu', exact: true }).click(); await dlg().getByRole('button', { name: /^Change day/ }).click(); },
  'therapist-link': async () => { await p.goto(`${APP}/l/${link}`); },
  'settings-therapies': async () => { await p.goto(`${APP}/admin/settings`); await p.getByRole('button', { name: /^Therapies/ }).first().click(); },
  'settings-rules': async () => { await p.goto(`${APP}/admin/settings`); await p.getByRole('button', { name: /^What needs you/ }).first().click(); },
};
for (const [name, open] of Object.entries(screens)) for (const size of ['100', '200']) {
  await open();
  await p.evaluate((s) => { document.documentElement.style.fontSize = `${s}%`; }, size);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${name}-${size}-${WHEN}.png` });
  console.log(name, size, JSON.stringify(await p.evaluate(cutText)));
}
await b.close();
