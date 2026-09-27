// node scripts/shots.mjs — screenshots every screen and sheet of the design
// (docs/design/phone.html) and the same state in the running app, at 375×812,
// into docs/design/shots/ (git-ignored), plus contact.html: app | design pairs.
//
// App: E2E_BASE_URL (default http://localhost:8080), signed in as the seed admin.
// Design: served here on a free local port. A step that cannot be reached on one side is
// shot as "missing", which is itself a difference to look at.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const OUT = 'docs/design/shots';
mkdirSync(OUT, { recursive: true });

const html = readFileSync('docs/design/phone.html');
const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)).listen(0);
const DESIGN = `http://localhost:${await new Promise((r) => server.on("listening", () => r(server.address().port)))}`;

const dlg = (p) => p.getByRole('dialog').last();
const btn = (p, name) => p.getByRole('button', { name }).first();
const tap = async (l) => { await l.click({ timeout: 4000 }); await l.page().waitForTimeout(400); };
const esc = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(300); };
// A no-show from an earlier run stays, so ordinary cards skip it and the no-show step reuses it.
const row = (p) => p.getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasNotText: "didn't come" });
const noshowRow = (p) => p.getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasText: "didn't come" });
const menuTo = async (p, name) => { await tap(btn(p, /^Menu$/)); await tap(dlg(p).getByRole('button', { name })); };
const card = async (p, pick) => { await tap(pick(row(p))); };
// Cards that can still change are shot on tomorrow: late in the day every row today has finished.
// The pill and flags are on tomorrow in the app only: the app's seeded problems are gone by evening,
// and the design shows its pill on today alone.
const tomorrow = async (p) => { await tap(btn(p, /^Change day/)); await tap(dlg(p).getByRole('button', { name: /^Next day/ })); };
const fact = (label) => async (p) => { await tomorrow(p); await card(p, (r) => r.first()); await tap(dlg(p).getByRole('button', { name: label })); };

// name, what to do from the day (freshly loaded), per side when they differ.
const STEPS = [
  ['01-day-time', async () => {}],
  ['02-day-therapist', (p) => menuTo(p, /^Therapist$/)],
  ['03-day-room', (p) => menuTo(p, /^Room$/)],
  ['04-day-resident', (p) => menuTo(p, /^Resident$/)],
  ['05-pill-sheet', async (p, side) => { if (side === 'app') await tomorrow(p); await tap(btn(p, /to fix|done|note/)); }],
  ['06-card-plain', async (p) => { await tomorrow(p); await card(p, (r) => r.first()); }],
  ['07-card-finished', (p) => card(p, (r) => r.first())],
  ['08-card-flagged', async (p, side) => { if (side === 'app') await tomorrow(p); await tap(p.locator('button.row[class*=" st-"], button[class*="inset_0_0_0_1.5px"]').or(row(p).filter({ hasText: /Was \S+'s/ })).first()); }],
  ['09-list-when', fact(/^When/)],
  ['10-list-with', fact(/^With/)],
  ['11-list-room', fact(/^Room/)],
  ['12-list-treatment', fact(/^Treatment/)],
  ['13-list-note', fact(/^Note/)],
  ['14-list-wrong', fact(/^Something wrong/)],
  ['15-list-history', fact(/^History/)],
  ['16-card-noshow', async (p) => {
    await tomorrow(p);
    if (!(await noshowRow(p).count())) { await card(p, (r) => r.first()); await tap(dlg(p).getByRole('button', { name: /^Something wrong/ })); await tap(dlg(p).getByRole('button', { name: /didn't come$/ })); await esc(p); }
    await tap(noshowRow(p).first());
  }],
  ['17-search-empty', (p) => tap(btn(p, /^Search/))],
  ['18-search-results', async (p) => { await tap(btn(p, /^Search/)); await p.keyboard.type('Ra'); await p.waitForTimeout(600); }],
  ['19-menu', (p) => tap(btn(p, /^Menu$/))],
  ['20-residents', (p) => menuTo(p, /^Residents/)],
  ['21-resident-card', async (p) => { await menuTo(p, /^Residents/); await tap(p.locator('main button, [role=tabpanel] button').filter({ hasText: /day \d+/ }).first()); }],
  ['22-team', (p) => menuTo(p, /^Team/)],
  ['23-team-person', async (p) => { await menuTo(p, /^Team/); await tap(p.getByRole('button', { name: /Working today|^Suresh|^[A-Z][a-z]+$/ }).first()); }],
  ['24-team-room', async (p) => { await menuTo(p, /^Team/); await tap(p.getByRole('button', { name: /^Room \d|Dhanvantari|Nasatya/ }).first()); }],
  ['25-leave', (p) => menuTo(p, /^Leave/)],
  ['26-diet', (p) => menuTo(p, /^Diet/)],
  ['27-settings', (p) => menuTo(p, /^Settings/)],
  ['28-log', async (p) => { await menuTo(p, /^Settings/); await tap(btn(p, /Log/)); }],
  ['29-date-sheet', (p) => tap(btn(p, /^Change day/))],
  ['30-toast', (p) => tap(btn(p, /^Print/))],
  ['31-book', (p) => tap(btn(p, /^Book a treatment/))],
];

const only = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// Signed in once and reused: the login limit trips after a few runs otherwise.
const AUTH = `${OUT}/.auth.json`;
async function side(label, base, signIn) {
  const context = await browser.newContext({ ...ctx, baseURL: base, storageState: signIn && existsSync(AUTH) ? AUTH : undefined });
  const page = await context.newPage();
  page.on('popup', (p) => p.close().catch(() => {}));
  if (signIn) {
    await page.goto('/'); await page.waitForTimeout(900);
    if (page.url().includes('/login')) { await signIn(page); await context.storageState({ path: AUTH }); }
  }
  const miss = [];
  for (const [name, act] of STEPS) {
    if (only.length && !only.some((w) => name.includes(w))) continue;
    const file = `${OUT}/${name}-${label}.png`;
    try {
      await page.goto('/'); await page.waitForTimeout(900);
      await act(page, label); await page.waitForTimeout(400);
      await page.screenshot({ path: file });
    } catch (e) {
      miss.push(name); if (process.env.DEBUG) console.log(name, page.url(), e.message);
      await page.setContent(`<body style="font:20px sans-serif;padding:40px;color:#b00">missing: ${name}<br><small>${String(e.message).split('\n')[0]}</small>`);
      await page.screenshot({ path: file });
    }
  }
  await context.close();
  return miss;
}

const appMiss = await side('app', APP, async (page) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
});
const designMiss = await side('design', DESIGN);
await browser.close();
server.close();

const names = STEPS.map(([n]) => n).filter((n) => !only.length || only.some((w) => n.includes(w)));
writeFileSync(`${OUT}/contact.html`, `<!doctype html><meta charset=utf-8><title>App vs design</title>
<style>body{font:14px sans-serif;margin:16px}div{display:inline-block;margin:0 24px 24px 0;vertical-align:top}img{width:250px;border:1px solid #ccc;margin-right:4px}</style>
<p>Left: app. Right: design. 375×812.</p>${names.map((n) => `<div><b>${n}</b><br><img src="${n}-app.png"><img src="${n}-design.png"></div>`).join('')}`);
console.log(`Shots in ${OUT}/. Missing in app: ${appMiss.join(', ') || 'none'}. Missing in design: ${designMiss.join(', ') || 'none'}.`);
