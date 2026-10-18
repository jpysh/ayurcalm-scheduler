// node scripts/uat-950.mjs — guest/therapist link pages (#950). SHOT=before against main, after (default) against the branch.
// Needs E2E_BASE_URL and the admin sign-in (admin@example.com / demo1234) of a throwaway stack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-18-link-pages-950';
mkdirSync(OUT, { recursive: true });
const api = (path, init = {}) => fetch(`${APP}/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } }).then((r) => r.json());
const { token } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) });
const auth = { Authorization: `Bearer ${token}` };
let busiest = { n: -1 };
for (const s of (await api('/staff', { headers: auth })).filter((x) => x.role === 'therapist' && x.is_active)) {
  const { token: t } = await api(`/staff/${s.id}/link`, { method: 'POST', headers: auth });
  const d = await api(`/public/link/${t}`);
  if (d.items?.length > busiest.n) busiest = { n: d.items.length, t };
}
const today = (await api(`/public/link/${busiest.t}`)).today;
let guest = null;
for (const p of (await api('/patients?limit=200', { headers: auth })).patients ?? (await api('/patients', { headers: auth }))) {
  const { token: t } = await api(`/patients/${p.id}/link`, { method: 'POST', headers: auth });
  const d = await api(`/public/link/${t}`);
  if (d.items?.length) { guest = t; break; }
}
console.log(SHOT, 'busiest therapist items', busiest.n, 'guest', !!guest);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const shot = (n, full) => p.screenshot({ path: `${OUT}/${SHOT}-${n}.png`, fullPage: !!full });

await p.goto(`${APP}/l/${guest}?date=${today}`); await p.waitForTimeout(2000); await shot('guest-week');
await p.goto(`${APP}/l/${guest}`); await p.waitForTimeout(1500);
await p.getByText('Your details').first().click(); await p.waitForTimeout(800); await shot('guest-details');
await p.goto(`${APP}/l/${busiest.t}`); await p.waitForTimeout(2000); await shot('therapist-top');
// Point 5: does a tap on a row send at once?
const count = () => execSync(`docker compose -p ${process.env.STACK || 'g950'} exec -T db psql -U ayurcalm -tAc 'select count(*) from "LinkIssue"'`).toString().trim();
await p.getByRole('button', { name: /Raise an issue or SOS/ }).click(); await p.waitForTimeout(600);
await shot('raise');
const before = await count();
await p.getByText('A note for the admin').click(); await p.waitForTimeout(800);
const after = await count();
console.log(SHOT, 'issues before/after tapping "A note for the admin" with nothing typed:', before, after);
await shot('raise-after-tap');
await p.goto(`${APP}/l/lapsedlapsedlapsedlapsedlapsed`); await p.waitForTimeout(1500); await shot('dead');
await b.close();
