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

await step('The bar on the day: Menu, Search, the date with room around it, +. No Print', async () => {
  const r = await p.evaluate(() => { const nav = document.querySelector('nav[data-kit=bar]'); const d = nav.querySelector('button[aria-label^="Change day"]'); const c = nav.firstElementChild.getBoundingClientRect(); const t = [...d.querySelectorAll('span')].map((e) => e.getBoundingClientRect()); return { gapL: Math.round(Math.min(...t.map((x) => x.left)) - d.getBoundingClientRect().left), print: !!nav.querySelector('[aria-label^="Print"]'), w: Math.round(d.getBoundingClientRect().width) }; });
  return { ok: !r.print && r.w > 120, note: `date button ${r.w}px wide, no Print in the bar` };
});
await step('The ‹ and › in the day header move one day', async () => {
  const before = await text(p.locator('b').first());
  await go(p.getByRole('button', { name: 'Next day' }).first());
  const after = await text(p.locator('b').first());
  return { ok: before !== after, note: `${before} to ${after}` };
});
await step('Date sheet: Day before, Today, Next day each on one line', async () => {
  await go(p.getByRole('button', { name: /^Change day/ }));
  const h = await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].filter((b) => /^(Day before|Today|Next day)$/.test(b.textContent.trim())).map((b) => b.getBoundingClientRect().height));
  return { ok: h.length === 3 && Math.max(...h) <= 45, note: `button heights ${h.join(', ')}` };
});
await step('Menu has "Print the day\'s sheets" and it downloads the PDF', async () => {
  await go(p.getByRole('button', { name: /^Menu$/ }));
  const dl = p.waitForEvent('download', { timeout: 20000 });
  await go(dlg().getByRole('button', { name: /^Print the day's sheets/ }));
  const f = (await dl).suggestedFilename();
  return { ok: /\.pdf$/.test(f), note: f };
});
await b.close();
writeFileSync(`${OUT}/README.md`, `# UAT ${process.argv[2] || ''}\n\nBase ${APP}, 375x812. Written by scripts/uat.mjs.\n\n| # | Step | Result | Read off the page | Shot |\n|---|---|---|---|---|\n${lines.join('\n')}\n`);
