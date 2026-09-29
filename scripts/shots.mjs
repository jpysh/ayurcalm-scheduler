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
const tap = async (l) => { tapCount++; await l.click({ timeout: 4000 }); await l.page().waitForTimeout(400); };
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
  // Edit sheets (#178): the design has no mock-up for these, so its side reads "missing".
  ['25b-leave-edit', async (p) => { await menuTo(p, /^Leave/); await tap(p.locator('[role=tabpanel][data-state=active] tbody tr').first()); }],
  ['26b-diet-edit', async (p) => { await menuTo(p, /^Diet/); await tap(p.locator('[role=tabpanel][data-state=active] tbody tr').first()); }],
  ['27b-settings-hours', async (p) => { await menuTo(p, /^Settings/); await tap(btn(p, /^Opening hours/)); }],
  ['22b-therapist-edit', async (p) => { await menuTo(p, /^Team/); await tap(btn(p, /^Therapists$/)); await tap(p.locator('[role=tabpanel][data-state=active] tbody tr').first()); }],
  ['28-log', async (p) => { await menuTo(p, /^Settings/); await tap(btn(p, /Log/)); }],
  ['29-date-sheet', (p) => tap(btn(p, /^Change day/))],
  ['30-toast', (p) => tap(btn(p, /^Print/))],
  ['31-book', (p) => tap(btn(p, /^Book a treatment/))],
];


// ---- Stories (#audit): `node scripts/shots.mjs stories [name…]` ----
// Each admin story walked as taps at 375×812 on its own stack, one shot per step
// into shots/stories/<story>-<nn>-<step>.png, taps counted against the design's
// target. Then every route and sheet opened directly, so an orphaned old screen
// is caught too. stories.json and stories.html say what each run saw.
// Stacks: E2E_BASE_URL (seeded), TRIAL_URL (TRIAL=true, ADMIN_EMAIL=owner@example.com,
// password trial1234), DEMO_URL (DEMO_MODE=true). A story whose stack is unset is skipped.
const STACK = { main: APP, trial: process.env.TRIAL_URL, demo: process.env.DEMO_URL };
const menu = async (p, name) => { await tap(btn(p, /^Menu$/)); await tap(dlg(p).getByRole('button', { name })); };
const residentCard = async (p) => { await menu(p, /^Residents/); await tap(p.getByRole('button', { name: /day \d+ of \d+/ }).first()); };
const settingsRow = (name) => async (p) => { await menu(p, /^Settings/); await tap(btn(p, name)); };
const toast = (p, text) => p.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor({ timeout: 20000 });
const sql = (stack, q) => import('node:child_process').then(({ execFileSync }) => execFileSync('docker', ['compose', '-p', stack, 'exec', '-T', 'db', 'psql', '-U', 'ayurcalm', '-d', 'ayurcalm', '-c', q]));

// [story, stack, design target taps (null: no design for it), steps: [name, act]].
const STORIES = [
  ['glance', 'main', 0, [['day', async () => {}]]],
  ['print', 'main', 1, [['day', async () => {}], ['print', (p) => tap(btn(p, /^Print/))]]],
  ['book', 'main', 2, [['tomorrow', tomorrow], ['sheet', (p) => tap(btn(p, /^Book a treatment/))], ['booked', async (p) => { await tap(dlg(p).getByRole('button', { name: /^Book / }).first()); await toast(p, /^Booked/); }]]],
  ['warning-fix', 'main', 2, [['tomorrow', tomorrow], ['pill', (p) => tap(btn(p, /to fix|done|note/))], ['fixed', async (p) => { await tap(dlg(p).locator('[data-main]').first()); await p.waitForTimeout(2500); }]]],
  ['noshow', 'main', 3, [['tomorrow', tomorrow], ['card', (p) => card(p, (r) => r.first())], ['wrong', (p) => tap(dlg(p).getByRole('button', { name: /^Something wrong/ }))], ['marked', async (p) => { await tap(dlg(p).getByRole('button', { name: /didn't come$/ })); await toast(p, "didn't come"); }]]],
  ['late-move', 'main', 3, [['tomorrow', tomorrow], ['card', (p) => card(p, (r) => r.first())], ['when', (p) => tap(dlg(p).getByRole('button', { name: /^When/ }))], ['moved', async (p) => { await tap(dlg(p).getByRole('button', { name: /Suggested/ }).first()); await toast(p, 'Moved to'); }]]],
  ['therapist-not-in', 'main', 3, [['tomorrow', tomorrow], ['menu', (p) => tap(btn(p, /^Menu$/))], ['by-therapist', (p) => tap(dlg(p).getByRole('button', { name: 'Therapist', exact: true }))], ['not-in', async (p) => { await tap(p.getByRole('button', { name: / not in$/ }).first()); await toast(p, 'not in'); }]]],
  ['room-out', 'main', 3, [['tomorrow', tomorrow], ['card', (p) => card(p, (r) => r.first())], ['wrong', (p) => tap(dlg(p).getByRole('button', { name: /^Something wrong/ }))], ['out', async (p) => { await tap(dlg(p).getByRole('button', { name: /can't be used/ })); await toast(p, 'out of use'); }]]],
  ['search', 'main', 2, [['search', (p) => tap(btn(p, /^Search/))], ['typed', async (p) => { await p.keyboard.type('Diya'); await p.waitForTimeout(700); }], ['result', (p) => tap(p.getByRole('button', { name: /Diya/ }).first())]]],
  ['meals', 'main', 2, [['menu', (p) => tap(btn(p, /^Menu$/))], ['diet', (p) => tap(dlg(p).getByRole('button', { name: /^Diet/ }))], ['resident', (p) => tap(p.locator('[role=tabpanel][data-state=active] tbody tr td, main tbody tr td').first())]]],
  ['resident-card', 'main', 3, [['menu', (p) => tap(btn(p, /^Menu$/))], ['residents', (p) => tap(dlg(p).getByRole('button', { name: /^Residents/ }))], ['card', (p) => tap(p.getByRole('button', { name: /day \d+ of \d+/ }).first())], ['details', (p) => tap(dlg(p).getByRole('button', { name: /details|History|stay/i }).first())]]],
  ['arrival', 'main', null, [['residents', (p) => menu(p, /^Residents/)], ['add', (p) => tap(btn(p, /^Add|New resident|\+/))], ['filled', async (p) => { await dlg(p).getByLabel(/name/i).first().fill('Audit Arrival'); }], ['saved', (p) => tap(dlg(p).getByRole('button', { name: /^(Save|Add|Register)/ }).last())]]],
  ['discharge', 'main', 5, [['card', async (p) => { await menu(p, /^Residents/); await tap(p.getByRole('button', { name: /day (\d+) of \1\b/ }).first()); }], ['write', (p) => tap(dlg(p).getByRole('button', { name: /discharge summary/i }).first())], ['form-end', async (p) => { await dlg(p).locator('div').filter({ has: p.locator('textarea') }).last().evaluate((e) => e.scrollIntoView()).catch(() => {}); }], ['saved', (p) => tap(dlg(p).getByRole('button', { name: /^Save|^Done|^Print/ }).first())]]],
  ['leave', 'main', 5, [['menu', (p) => tap(btn(p, /^Menu$/))], ['leave', (p) => tap(dlg(p).getByRole('button', { name: /^Leave/ }))], ['add', (p) => tap(btn(p, /^Add leave/))], ['who', async (p) => { await tap(dlg(p).getByRole('combobox').first()); }], ['saved', async (p) => { await esc(p); await tap(dlg(p).getByRole('button', { name: /^(Save|Add)/ }).last()); }]]],
  ['holidays', 'main', 3, [['leave', (p) => menu(p, /^Leave/)], ['holidays', (p) => tap(btn(p, /^Public holidays/))]]],
  ['team', 'main', 3, [['team', (p) => menu(p, /^Team/)], ['person', (p) => tap(p.getByRole('button', { name: /Working today/ }).first())], ['room', async (p) => { await esc(p); await tap(p.getByRole('button', { name: /^(Agni|Brahma|Room)/ }).first()); }], ['week', async (p) => { await esc(p); await tap(btn(p, /^This week/)); }]]],
  ['therapies', 'main', null, [['team', (p) => menu(p, /^Team/)], ['therapies', async (p) => { await p.mouse.wheel(0, 20000); await p.waitForTimeout(400); await tap(p.getByRole('button', { name: /Therap(y|ies)|library/i }).last()); }]]],
  ['diet-plans', 'main', null, [['diet', (p) => menu(p, /^Diet/)], ['plans', (p) => tap(btn(p, /^Plans$/))], ['plan', (p) => tap(p.getByRole('dialog').getByRole('button').nth(1))]]],
  ['log', 'main', 3, [['settings', (p) => menu(p, /^Settings/)], ['log', (p) => tap(btn(p, /^Log/))]]],
  ...['Centre details', 'Discharge letterhead', 'Opening hours', 'Support contacts', 'Backups', 'Printed sheets', 'Your password', 'Your AI assistant', 'People with access', 'Demo data'].map((n) =>
    [`settings-${n.toLowerCase().replace(/\W+/g, '-')}`, 'main', 3, [['sheet', settingsRow(new RegExp(`^${n}`))], ['end', (p) => p.getByRole('dialog').last().evaluate((d) => d.querySelectorAll('*').forEach((e) => { e.scrollTop = e.scrollHeight; }))]]]),
  ['export', 'main', 4, [['backups', settingsRow(/^Backups/)], ['download', async (p) => { const d = p.waitForEvent('download', { timeout: 60000 }); await tap(dlg(p).getByRole('button', { name: /^Download everything/ })); await d; }]]],
  ...['Time', 'Therapist', 'Room', 'Resident', 'Back to the day'].map((n) => [`menu-${n.toLowerCase().replace(/\W+/g, '-')}`, 'main', 2, [['menu', (p) => tap(btn(p, /^Menu$/))], ['item', (p) => tap(dlg(p).getByRole('button', { name: new RegExp(`^${n}`) }).first())]]]),
  ['sign-out', 'main', 3, [['settings', (p) => menu(p, /^Settings/)], ['out', (p) => tap(btn(p, /^Sign out/))]]],
  // Launch A (#245–#250).
  ['landing-demo', 'demo', null, [['landing', (p) => p.goto(`${SITE}/ruta/index.html`)], ['demo-login', (p) => p.goto(`${STACK.demo}/login`)], ['signed-in', async (p) => { await tap(p.getByRole('button', { name: /sign in|try|demo/i }).first()); await p.waitForTimeout(1500); }]]],
  ['trial-signup', 'trial', null, [['form', (p) => p.goto(SIGNUP)], ['login', (p) => p.goto(`${STACK.trial}/login`)], ['wizard', async (p) => { await p.getByLabel('Email').fill('owner@example.com'); await p.getByLabel('Password').fill('trial1234'); await p.getByLabel('Password').press('Enter'); await p.waitForTimeout(2000); }],
    ['wizard-2', async (p) => { await p.getByLabel(/name/i).first().fill('Audit Centre'); await tap(btn(p, /^Continue/)); }], ['wizard-3', (p) => tap(btn(p, /^Continue|^Finish/))], ['first-day', async (p) => { if (await btn(p, /templates|starter|keep/i).count()) await tap(btn(p, /templates|starter|keep/i)); await p.waitForTimeout(2000); }], ['plan', settingsRow(/^Plan/)]]],
  ['trial-ended', 'trial', null, [['day', async (p) => { await sql('ayurcalm-audit-trial', "update \"Settings\" set trial_started_at = now() - interval '31 days'"); await p.goto('/'); await p.waitForTimeout(1500); }], ['book', (p) => tap(btn(p, /^Book a treatment/))], ['plan', async (p) => { await esc(p); await settingsRow(/^Plan/)(p); }]]],
];
// Every route and every place that opens a dialog, opened directly: an old screen reached by nothing still counts.
const ROUTES = ['/', '/index', '/setup', '/admin/schedule', '/admin/staff', '/admin/rooms', '/admin/therapies', '/admin/diet', '/admin/timeoff', '/admin/team', '/admin/log', '/admin/events', '/admin/patients', '/admin/settings', '/admin/ailments', '/admin/dashboard/x', '/nope', '/l/not-a-token'];
const SITE = process.env.SITE_URL || 'http://localhost:8766';
const SIGNUP = process.env.SIGNUP_URL || 'http://localhost:8200';

async function runStories(names) {
  const SOUT = `${OUT}/stories`; mkdirSync(SOUT, { recursive: true });
  const site = createServer((req, res) => { try { res.writeHead(200, { 'content-type': req.url.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }).end(readFileSync(`site/public${decodeURIComponent(req.url.split('?')[0])}`)); } catch { res.writeHead(404).end(); } }).listen(8766);
  const report = [];
  for (const [story, stack, target, steps] of STORIES) {
    if (names.length && !names.some((w) => story.includes(w))) continue;
    if (!STACK[stack]) { console.log(`skip ${story}: no ${stack} stack`); continue; }
    const creds = stack === 'trial' ? null : ['admin@example.com', 'demo1234'];
    const auth = `${OUT}/.auth-${stack}.json`;
    const context = await browser.newContext({ ...ctx, baseURL: STACK[stack], storageState: creds && existsSync(auth) ? auth : undefined });
    const page = await context.newPage();
    page.on('popup', (p) => p.close().catch(() => {}));
    if (creds && !story.startsWith('landing')) {
      await page.goto('/'); await page.waitForTimeout(900);
      if (page.url().includes('/login')) {
        await page.getByLabel('Email').fill(creds[0]); await page.getByLabel('Password').fill(creds[1]); await page.getByLabel('Password').press('Enter');
        await page.waitForURL((u) => !u.pathname.startsWith('/login')); await context.storageState({ path: auth });
      }
    }
    let taps = 0;
    const shots = [];
    if (!story.startsWith('landing') && !story.startsWith('trial-signup')) { await page.goto('/'); await page.waitForTimeout(1200); }
    for (const [i, [step, act]] of steps.entries()) {
      const file = `${story}-${String(i + 1).padStart(2, '0')}-${step}.png`;
      const before = tapCount; let error = null;
      try { await act(page, 'app'); await page.waitForTimeout(500); } catch (e) { error = String(e.message).split('\n')[0]; }
      if (step !== 'tomorrow') taps += tapCount - before; // putting tomorrow on screen is set-up, as tapCount's showDay
      await page.screenshot({ path: `${SOUT}/${file}` }).catch(() => {});
      shots.push({ step, file, error, url: page.url().replace(STACK[stack], '') });
      if (error) break;
    }
    report.push({ story, stack, target, taps, shots });
    console.log(`${story}: ${taps} taps (target ${target ?? '—'})${shots.some((s) => s.error) ? ` BROKE at ${shots.find((s) => s.error).step}: ${shots.find((s) => s.error).error}` : ''}`);
    await context.close();
  }
  if (!names.length || names.includes('routes')) {
    const context = await browser.newContext({ ...ctx, baseURL: APP, storageState: existsSync(`${OUT}/.auth-main.json`) ? `${OUT}/.auth-main.json` : undefined });
    const page = await context.newPage();
    for (const r of ROUTES) {
      const file = `route${r.replace(/\W+/g, '-')}.png`;
      await page.goto(r); await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SOUT}/${file}` });
      report.push({ story: `route ${r}`, stack: 'main', target: null, taps: 0, shots: [{ step: r, file, url: page.url().replace(APP, '') }] });
    }
    await context.close();
  }
  site.close();
  const prev = existsSync(`${SOUT}/stories.json`) ? JSON.parse(readFileSync(`${SOUT}/stories.json`, 'utf8')) : [];
  const merged = [...prev.filter((x) => !report.some((y) => y.story === x.story)), ...report];
  writeFileSync(`${SOUT}/stories.json`, JSON.stringify(merged, null, 1));
  writeFileSync(`${SOUT}/stories.html`, `<!doctype html><meta charset=utf-8><title>Stories</title><style>body{font:14px sans-serif;margin:16px}section{margin-bottom:24px}img{width:200px;border:1px solid #ccc;margin:0 4px 4px 0}</style>
${merged.map((r) => `<section><b>${r.story}</b> — ${r.taps} taps, target ${r.target ?? '—'}<br>${r.shots.map((s) => `<img title="${s.step}${s.error ? ': ' + s.error : ''}" src="${s.file}">`).join('')}</section>`).join('')}`);
}
let tapCount = 0;
const only = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
if (only[0] === 'stories') { await runStories(only.slice(1)); await browser.close(); server.close(); process.exit(0); }

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
