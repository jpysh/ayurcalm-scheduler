// node scripts/keys.mjs <folder> — the keyboard and focus pass (#311): Tab through every screen and sheet at 375x812.
// Per screen or sheet: the focus order runs top to bottom, every stop shows a visible ring, an open sheet keeps focus inside,
// Escape closes the top sheet only, and focus lands somewhere sensible afterwards. Writes docs/design/uat/<folder>/README.md.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = `docs/design/uat/${process.argv[2] || 'keys'}`;
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.UAT_EMAIL || 'admin@example.com', password: process.env.UAT_PASSWORD || 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const rows = [];
const dlg = () => p.getByRole('dialog').last();

/** What has focus now: its name, where it is, and whether anything shows that it has it. */
const stop = () => p.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const r = e.getBoundingClientRect();
  // A ring is whatever changes on the control, or on a wrapper up to three levels out (a date row rings its box), when it takes focus.
  const sig = () => { const out = []; let n = e; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const c = getComputedStyle(n); out.push([c.outlineStyle, c.outlineWidth, c.boxShadow, c.borderColor, c.backgroundColor].join('|')); } return out.join('~'); };
  const on = sig(); e.blur(); const off = sig(); e.focus();
  const ring = on !== off;
  const inDialog = !!e.closest('[role=dialog]');
  return { name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), y: Math.round(r.top + window.scrollY), x: Math.round(r.left), ring: !!ring, inDialog, tag: e.tagName };
});

/** Tabs through up to n stops; returns what it saw. */
async function tabThrough(n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await p.keyboard.press('Tab');
    const s = await stop();
    if (!s) break; // focus left the page for the browser's own bar: the end of the page
    if (seen.length && seen[0].name === s.name && seen[0].y === s.y && seen.length > 2) break; // wrapped round
    seen.push(s);
  }
  return seen;
}
const row = (what, ok, note) => { rows.push(`| ${what} | ${ok ? 'pass' : 'FAIL'} | ${note} |`); console.log(ok ? 'pass' : 'FAIL', what, note); };

/** A screen: order top to bottom (a stop may sit level with or below the last; a small step up is allowed for a row's own controls), a ring on each stop. */
async function screen(name, path, prep) {
  await p.goto(APP + path); await p.waitForTimeout(1500);
  if (prep) await prep();
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const seen = await tabThrough(30);
  const noRing = seen.filter((s) => !s.ring).map((s) => s.name);
  const back = seen.filter((s, i) => i > 0 && !s.inDialog && s.y < seen[i - 1].y - 8 && !seen[i - 1].inDialog).map((s) => s.name);
  row(`${name}: Tab order`, back.length === 0 && seen.length > 0, `${seen.length} stops; out of order: ${back.slice(0, 4).join(', ') || 'none'}`);
  row(`${name}: focus ring on every stop`, noRing.length === 0, noRing.length ? `no ring on: ${[...new Set(noRing)].slice(0, 5).join(', ')}` : 'all show one');
}

/** A sheet: opened by `open`, focus stays inside while Tab runs, Escape closes it, focus returns to the page (not lost on body). */
async function sheet(name, path, open, { nested } = {}) {
  await p.goto(APP + path); await p.waitForTimeout(1500);
  await open(); await p.waitForTimeout(700);
  const sheets = () => p.locator('[role=dialog]').count(); // CSS, so a sheet hidden under another still counts
  const before = await sheets();
  const seen = await tabThrough(25);
  const out = seen.filter((s) => !s.inDialog).map((s) => s.name);
  const noRing = seen.filter((s) => !s.ring).map((s) => s.name);
  // The sheet's own Close is read out and reachable but sits at the top while last in the tab order: by design (kit sheet).
  const back = seen.filter((s, i) => i > 0 && s.name !== 'Close' && s.y < seen[i - 1].y - 8).map((s) => s.name);
  row(`${name}: focus stays inside`, out.length === 0 && seen.length > 0, `${seen.length} stops; outside: ${[...new Set(out)].slice(0, 4).join(', ') || 'none'}`);
  row(`${name}: Tab order top to bottom`, back.length === 0, back.length ? `steps back at: ${back.slice(0, 4).join(', ')}` : 'ok');
  row(`${name}: focus ring on every stop`, noRing.length === 0, noRing.length ? `no ring on: ${[...new Set(noRing)].slice(0, 5).join(', ')}` : 'all show one');
  if (nested) {
    await nested(); await p.waitForTimeout(600);
    const inner = await sheets();
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    const after = await sheets();
    row(`${name}: Escape closes the top sheet only`, inner > before && after === before, `sheets ${before} → ${inner} → ${after}`);
  }
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  const gone = (await p.getByRole('dialog').count()) === 0;
  const f = await stop();
  row(`${name}: Escape closes it and focus is not lost`, gone && !!f, gone ? `focus on "${f ? f.name : 'nothing (body)'}"` : 'still open');
  await p.screenshot({ path: `${OUT}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
}

const menu = () => p.getByRole('button', { name: 'Menu', exact: true }).click();
const tomorrowIso = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

await screen('The day', '/admin/schedule');
await screen('Patients', '/admin/patients');
await screen('Team', '/admin/team');
await screen('Rooms', '/admin/rooms');
await screen('Leave', '/admin/timeoff');
await screen('Diet plans', '/admin/diet');
await screen('Settings', '/admin/settings');
await screen('Log', '/admin/log');

await sheet('Menu', '/admin/schedule', menu);
await sheet('Booking sheet', '/admin/schedule', () => p.getByRole('button', { name: 'Book a treatment', exact: true }).click());
await sheet('New patient', '/admin/patients', () => p.getByRole('button', { name: 'New patient', exact: true }).click());
await sheet('Add leave', '/admin/timeoff', () => p.getByRole('button', { name: 'Add leave', exact: true }).click(), {
  nested: async () => { await dlg().getByRole('button', { name: /^Who or what/ }).click(); },
});
await sheet('Add a therapist or doctor', '/admin/team', () => p.getByRole('button', { name: 'Add a therapist or doctor', exact: true }).click());
await sheet('Add a room', '/admin/rooms', () => p.getByRole('button', { name: 'Add a room', exact: true }).click());
await sheet('Treatment card', '/admin/schedule', async () => { await p.locator('[data-kit=bar]').waitFor(); await p.getByText(/Abhyanga|Shirodhara|Snehapana/).first().click(); });
await sheet('Change day', '/admin/schedule', async () => { await menu(); await dlg().getByRole('button', { name: /^Change day/ }).click(); });
await sheet('Backups', '/admin/settings', () => p.getByRole('button', { name: /^Backups/ }).click());

// Search takes the bar's place: the field gets focus, Escape leaves it.
await p.goto(APP + '/admin/schedule'); await p.waitForTimeout(1500);
await menu(); await dlg().getByRole('button', { name: /^Search/ }).click(); await p.waitForTimeout(700);
const sf = await stop();
row('Search: the field has focus when it opens', !!sf && /Name, therapy|Search/i.test(sf.name) || sf?.tag === 'INPUT', `focus on "${sf ? sf.name : 'nothing'}"`);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
row('Search: Escape leaves it', (await p.locator('input[placeholder*="Name, therapy"]').count()) === 0, 'bar back');

await b.close();
const fails = rows.filter((r) => r.includes('| FAIL |')).length;
writeFileSync(`${OUT}/README.md`, `# Keyboard and focus pass (#311)\n\nBase ${APP}, 375x812, keyboard only (Tab, Escape). ${rows.length - fails} pass, ${fails} fail. Written by scripts/keys.mjs.\n\n| Check | Result | Read off the page |\n|---|---|---|\n${rows.join('\n')}\n`);
console.log(`${rows.length - fails} pass, ${fails} fail`);
