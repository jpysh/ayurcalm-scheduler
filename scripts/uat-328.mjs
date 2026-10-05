// node scripts/uat-328.mjs <folder> — Team and Rooms as two screens (#328), at 375x812 on E2E_BASE_URL (default :8080).
// Seeds one room out of use, so Rooms shows its "out" count, then screenshots Menu, both screens and both + forms.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || 'team-rooms'}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const run = Date.now().toString(36).slice(-3);
const store = await api('POST', '/rooms', { name: `Uat Store ${run}`, amenities: [] });
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
await api('POST', '/timeoff', { entity_type: 'room', entity_id: store.id, date: today, start_date: today, end_date: today, description: 'Uat: out of use' });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const go = async (l) => { await l.click({ timeout: 6000 }); await p.waitForTimeout(900); };
const menu = async () => { await p.evaluate(() => window.scrollTo(0, 0)); await go(p.getByRole('button', { name: 'Menu', exact: true })); };
const panel = () => p.locator('[role="tabpanel"][data-state="active"]');
const flat = (s) => s.replace(/\s+/g, ' ').slice(0, 160);
const lines = [];
let n = 0;
const step = async (title, fn) => {
  const id = String(++n).padStart(2, '0');
  let ok = false, note = '';
  try { const r = await fn(); ok = r.ok; note = r.note; } catch (e) { note = String(e).split('\n').slice(0, 3).join(' '); }
  await p.screenshot({ path: `${OUT}/${id}.png` });
  lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`);
  console.log(id, ok ? 'pass' : 'FAIL', note);
};

await p.goto(`${APP}/admin/schedule`); await p.waitForTimeout(2000);
await step('Menu: Team and Rooms are separate tiles, and the whole menu fits without scrolling', async () => {
  await menu(); await p.waitForTimeout(800);
  const t = await dlg().innerText();
  const fits = await dlg().evaluate((d) => d.scrollHeight <= window.innerHeight);
  return { ok: /\bTeam\b/.test(t) && /\bRooms\b/.test(t) && !/Team and rooms/.test(t) && fits, note: flat(t) };
});
await step('Team: its own header and count, the week, therapists and doctors, the centre\'s lists; no rooms', async () => {
  await go(dlg().getByRole('button', { name: /^Team/ }));
  const t = await panel().innerText();
  const miss = [[/‹ Day\s*Team/, 'header'], [/This week/, 'week'], [/Therapists and doctors/i, 'team'], [/Therapies/, 'lists']].filter(([r]) => !r.test(t)).map(([, w]) => w);
  if (/Has |Nothing special/.test(t)) miss.push('rooms shown');
  return { ok: !miss.length, note: miss.length ? `missing: ${miss.join(', ')}` : flat(t) };
});
await step('Team +: opens the therapist or doctor form straight away', async () => {
  await go(p.getByRole('button', { name: 'Add a therapist or doctor', exact: true }));
  const t = await dlg().innerText();
  return { ok: !/What are you adding/.test(t) && /Name/.test(t), note: flat(t) };
});
await step('Rooms: its own header with the count and what is out today; no therapists', async () => {
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await menu(); await go(dlg().getByRole('button', { name: /^Rooms/ }));
  const t = await panel().innerText();
  return { ok: /Rooms/.test(t) && /\d+ out/.test(t) && /Out of use today/.test(t) && !/Therapists and doctors/.test(t), note: flat(t) };
});
await step('Rooms +: opens the room form straight away (add a room: Menu, Rooms, +)', async () => {
  await go(p.getByRole('button', { name: 'Add a room', exact: true }));
  const t = await dlg().innerText();
  return { ok: !/What are you adding/.test(t) && /Name/.test(t), note: flat(t) };
});
await step('Search on Rooms searches rooms only', async () => {
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await menu(); await go(dlg().getByRole('button', { name: /^Search rooms/ }));
  await p.keyboard.type('Uat Store'); await p.waitForTimeout(600);
  const t = await panel().innerText();
  return { ok: new RegExp(`Uat Store ${run}`).test(t) && !/Agni/.test(t), note: flat(t) };
});

writeFileSync(`${OUT}/README.md`, `# UAT Team and Rooms (#328)\n\nBase ${APP}, 375x812. Written by scripts/uat-328.mjs; it seeds one "Uat Store" room out of use.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
await b.close();
