// node scripts/walk.mjs — the phone walk at 375x812: one screenshot per screen and sheet into docs/design/walk/.
// E2E_BASE_URL (default :8091, a throwaway stack). Signs in through the API, never the form.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8091';
const OUT = 'docs/design/walk';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const btn = (n) => p.getByRole('button', { name: n }).first();
const tap = async (l) => { await l.click({ timeout: 4000 }); await p.waitForTimeout(500); };
const menuTo = async (n) => { await tap(btn(/^Menu$/)); await tap(dlg().getByRole('button', { name: n })); };
const home = async () => { await p.goto(APP + '/'); await p.waitForTimeout(1200); };
const report = [];
let n = 0;
const shot = async (name, act) => {
  const id = String(++n).padStart(2, '0') + '-' + name;
  try {
    await home(); await act(); await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const root = document.querySelector('[role=dialog]:last-of-type') || document.body;
      const small = [...document.querySelectorAll('button,a,[role=button],select,input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 44) && getComputedStyle(e).visibility !== 'hidden'; }).length;
      const clipped = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => e.textContent.trim().slice(0, 40));
      return { overflowX: document.documentElement.scrollWidth - innerWidth, small, clipped: clipped.slice(0, 8) };
    });
    report.push({ id, ...m });
    await p.screenshot({ path: `${OUT}/${id}.png` });
  } catch (e) { report.push({ id, error: String(e).split('\n')[0] }); }
};
const first = (re) => p.getByRole('button', { name: re }).first();

await shot('day', async () => {});
await shot('pill-sheet', () => menuTo(/to know|to fix|need you/));
await shot('treatment-card', () => tap(p.getByRole('button', { name: /^\d\d:\d\d/ }).nth(2)));
await shot('menu', () => tap(btn(/^Menu$/)));
await shot('day-by-therapist', async () => { await tap(btn(/^By time/)); await tap(dlg().getByRole('button', { name: /^Therapist/ })); });
await shot('patients', () => menuTo(/^Patients/));
await shot('needs-attention', async () => { await menuTo(/^Patients/); await tap(btn(/^Needs attention/)); });
const card = async () => { await menuTo(/^Patients/); await tap(p.getByRole('button', { name: /^[A-Z][a-z]+ [A-Z][a-z]+\s*Day \d/ }).first()); };
await shot('patient-card', card);
await shot('patient-package', async () => { await card(); await tap(dlg().getByRole('button', { name: /^Package/ })); });
await shot('patient-accommodation', async () => { await card(); await tap(dlg().getByRole('button', { name: /^Accommodation/ })); });
await shot('patient-diet', async () => { await card(); await tap(dlg().getByRole('button', { name: /^Diet/ })); });
await shot('patient-stay', async () => { await card(); await tap(dlg().getByRole('button', { name: /^Stay/ })); });
await shot('patient-details', async () => { await card(); await tap(dlg().getByRole('button', { name: /^Details/ })); });
await shot('patient-discharge', async () => { await card(); await tap(dlg().getByRole('button', { name: /Discharge summary/ })); });
await shot('patient-links', async () => { await card(); await tap(dlg().getByRole('button', { name: /link|Link/ })); });
await shot('new-patient', async () => { await menuTo(/^Patients/); await tap(btn(/^Add|New patient|^\+/)); });
await shot('team', () => menuTo(/^Team/));
await shot('leave', () => menuTo(/^Leave/));
await shot('leave-new', async () => { await menuTo(/^Leave/); await tap(btn(/^Add|^New|^\+/)); await p.waitForTimeout(1500); });
await shot('diet-plans', () => menuTo(/^Diet/));
await shot('settings', () => menuTo(/^Settings/));
for (const [k, re] of [['centre', /^Centre and letterhead/], ['hours', /^Opening hours/], ['catalogues', /^Packages and accommodation/], ['people', /^People with access/], ['printed', /^Printed sheets/], ['rules', /^What needs you/], ['backups', /^Backups/], ['log', /^Log/], ['account', /^Your account/], ['help', /^Help and plan/]])
  await shot('settings-' + k, async () => { await menuTo(/^Settings/); await tap(btn(re)); });
await shot('search', async () => { await menuTo(/^Search/); await p.keyboard.type('Ananya'); await p.waitForTimeout(700); });
await shot('book', () => tap(btn(/^Book|^Add/)));
await shot('print', () => menuTo(/^Print/));
await shot('not-found', async () => { await p.goto(APP + '/nope'); });
await b.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
for (const r of report) console.log(JSON.stringify(r));
