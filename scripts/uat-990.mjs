// node scripts/uat-990.mjs — the doctor link's Round at 375x812 (#990): reviews due first, other doctors' guests muted.
// Adds one guest with no consultation, eight days in, so a review is due. Run on a throwaway stack (E2E_BASE_URL).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/uat/2026-10-19-doctor-round-990';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = (path, body) => fetch(`${APP}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }).then((r) => r.json());
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
if (!(await api('/patients')).some((x) => x.name === 'Shobha Mehta')) await api('/patients', { name: 'Shobha Mehta', gender: 'female', on_site: false, stay: { start_date: day(-7), end_date: day(3) } });
const doctor = (await api('/staff')).find((s) => s.role === 'doctor');
const link = await api(`/staff/${doctor.id}/link`, {});
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
await p.goto(`${APP}/l/${link.token}`); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/after-round-375.png` });
await b.close();
