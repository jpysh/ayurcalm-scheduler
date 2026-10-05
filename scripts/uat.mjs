// node scripts/uat.mjs <folder> — the session's "check it yourself" steps, done by Claude at 375x812.
// Each step: screenshot + a pass/fail line with what was read off the page. Writes docs/design/uat/<folder>/
// (shots and README.md). Edit STEPS for each session. E2E_BASE_URL defaults to :8080. Never opens the login form.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || new Date().toISOString().slice(0, 10)}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const dlg = () => p.getByRole('dialog').last();
const go = async (l) => { await l.click({ timeout: 5000 }); await p.waitForTimeout(600); };
const menuTo = async (n) => { await go(p.getByRole('button', { name: /^Menu$/ })); await go(dlg().getByRole('button', { name: n })); };
const lines = [];
let n = 0;
const step = async (title, run) => {
  const id = String(++n).padStart(2, '0');
  let ok = false, note = '';
  try { await p.goto(APP + '/'); await p.waitForTimeout(1200); const r = await run(); ok = r.ok; note = r.note; } catch (e) { note = String(e).split('\n')[0]; }
  await p.screenshot({ path: `${OUT}/${id}.png` });
  lines.push(`| ${id} | ${title} | ${ok ? 'pass' : 'FAIL'} | ${note} | ![${id}](${id}.png) |`);
  console.log(id, ok ? 'pass' : 'FAIL', note);
};
const text = (l) => l.innerText();

await step('Team and rooms: the This week line wraps instead of ending in "…"', async () => {
  await menuTo(/^Team/);
  const clipped = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => !e.children.length && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === 'ellipsis').length);
  return { ok: clipped === 0, note: `${clipped} clipped texts` };
});
await step('Settings, Packages and accommodation: "Example price: change it to yours" reads in full', async () => {
  await menuTo(/^Settings/); await go(p.getByRole('button', { name: /^Packages and accommodation/ }));
  const t = await text(dlg());
  return { ok: /Example price: change it to yours/.test(t), note: 'full sentence found' };
});
await step('Leave, +, Who or what opens a searchable sheet', async () => {
  await menuTo(/^Leave/); await go(p.getByRole('button', { name: /^Add|^New|^\+/ }).first()); await go(p.getByRole('button', { name: /^Who or what/ }));
  return { ok: await p.getByPlaceholder('Type a name').isVisible(), note: 'search box shown' };
});
await step('Typing "priya" and picking Priya Das shows the consequence line', async () => {
  await menuTo(/^Leave/); await go(p.getByRole('button', { name: /^Add|^New|^\+/ }).first()); await go(p.getByRole('button', { name: /^Who or what/ }));
  await p.getByPlaceholder('Type a name').fill('priya'); await go(dlg().getByRole('button', { name: /Priya Das/ })); await p.waitForTimeout(1500);
  const t = await text(dlg());
  return { ok: /treatments? that day will need a new therapist/.test(t), note: (t.match(/\d+ treatments? that day[^.]*\./) || [''])[0] };
});
await step('Booking: busy-room reasons say "massage table", never "massage_table"', async () => {
  await go(p.getByRole('button', { name: /^Book|^Add/ }).first());
  await go(dlg().getByRole('button', { name: /Day \d+ of \d+/ }).first()); await p.waitForTimeout(1200);
  await dlg().getByLabel('Therapy').selectOption({ label: 'Jalaukavacharana' }); await p.waitForTimeout(1500);
  const t = await p.evaluate(() => [...document.querySelectorAll('select option')].map((o) => o.textContent).join('\n'));
  return { ok: !/massage_table/.test(t) && /massage table/.test(t), note: /massage table/.test(t) ? 'reason reads "massage table"' : 'no amenity reason on screen' };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
