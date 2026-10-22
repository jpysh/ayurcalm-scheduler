// node scripts/uat-prelaunch-walk.mjs [part] — the pre-launch audit's test patient, a 21-day Panchakarma resident, walked by taps at
// 375x812 on a throwaway stack (APP_URL). Each part leaves shots in OUT and a line per step in walk.tsv.
import { chromium } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8097';
const OUT = process.env.OUT || 'docs/design/audit/2026-10-22-prelaunch/walk';
const PART = process.argv[2] || 'admit';
const WHO = 'Devi Audit';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const api = async (m, path, body) => { const r = await fetch(`${APP}/api${path}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => null); };
const tz = (await api('GET', '/settings')).timezone || 'Asia/Kolkata';
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
const day = (n) => ymd(new Date(Date.now() + n * 86400000));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: tz, acceptDownloads: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const errors = [];
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => errors.push(e.message));
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
let n = 0;
const step = async (what, result = '') => {
  const shot = `${PART}-${String(++n).padStart(2, '0')}-${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`;
  await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${shot}` });
  const toast = (await p.locator('[data-sonner-toast]').allInnerTexts()).join(' / ').replace(/\s+/g, ' ');
  appendFileSync(`${OUT}/walk.tsv`, [PART, what, shot, toast, result, errors.splice(0).join(' ; ')].join('\t') + '\n');
};
const dlg = () => p.getByRole('dialog').last();
const tap = async (loc) => { await loc.first().scrollIntoViewIfNeeded(); await loc.first().click(); await p.waitForTimeout(600); };
const patient = async () => (await api('GET', '/patients')).find((x) => x.name === WHO);
const openCard = async () => {
  await p.waitForTimeout(500);
  await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2000);
  await tap(p.getByRole('button', { name: 'Search patients', exact: true }));
  await p.keyboard.type(WHO); await p.waitForTimeout(800);
  await tap(p.getByText(WHO, { exact: true })); await p.waitForTimeout(1500);
};
const showDay = async (d) => {
  await p.goto(`${APP}/`); await p.waitForTimeout(2500);
  await tap(p.getByRole('button', { name: 'Menu', exact: true }));
  await tap(dlg().getByRole('button', { name: /^Change day/ }));
  await dlg().locator('input[type=date]').fill(d); await p.waitForTimeout(1500);
};
const book = async (d, therapy, count, label) => {
  await showDay(d);
  await tap(p.getByRole('button', { name: 'Book a treatment', exact: true }));
  await dlg().getByLabel('Search patients').fill(WHO);
  await tap(dlg().getByRole('button', { name: new RegExp(`^${WHO}`) }));
  if (label) await step(`${label} who chosen`);
  await tap(dlg().getByRole('button', { name: /^Other therapies/ }));
  await p.getByPlaceholder('Search therapies').fill(therapy);
  await tap(dlg().getByRole('button', { name: new RegExp(`^${therapy}`) }));
  if (count > 1) await tap(dlg().getByRole('button', { name: String(count), exact: true }));
  await step(`${label || therapy} x${count} ready`);
  await tap(dlg().getByRole('button', { name: /^Book / }));
  await step(`${label || therapy} x${count} booked`);
};
const scrollShots = async (what) => {
  for (let i = 0; i < 5; i++) {
    const moved = await dlg().evaluate((el, i) => { const s = [...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 20 && getComputedStyle(x).overflowY !== 'visible') || el; const before = s.scrollTop; s.scrollTop = i * 600; return i === 0 || s.scrollTop !== before; }, i);
    if (!moved) break;
    await step(`${what} scroll ${i}`);
  }
};

const parts = {
  async admit() {
    await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
    await tap(p.getByRole('button', { name: 'New patient', exact: true }));
    await step('new patient sheet');
    await dlg().getByLabel('Name', { exact: true }).fill(WHO);
    await tap(dlg().getByRole('button', { name: 'Female' }));
    const dates = dlg().locator('input[type=date]');
    await dates.nth(0).fill(day(1)); await dates.nth(1).fill(day(21));
    await step('filled, arriving tomorrow for 21 days');
    await tap(dlg().getByRole('button', { name: 'Add patient' }));
    await step('added', (await patient()) ? 'saved' : 'NOT SAVED');
    await openCard();
    await scrollShots('card');
  },
  async setup() {
    for (const [row, then] of [['Plan', null], ['Their therapist', null], ['Diet', null], ['Package', /^Use \d+ days/], ['Details', null], ['Private link', null]]) {
      await openCard();
      const r = dlg().getByRole('button', { name: new RegExp(`^${row}`) });
      if (!(await r.count())) { appendFileSync(`${OUT}/walk.tsv`, `${PART}\tno "${row}" row on the card\t\t\t\t\n`); continue; }
      await tap(r); await scrollShots(row);
      if (then && await dlg().getByRole('button', { name: then }).count()) { await tap(dlg().getByRole('button', { name: then })); await step(`${row} chosen`); }
    }
  },
  async diet() {
    // The course of meals over her stay: before purification, oleation from day 4, after purification from day 9, sattvic from day 14.
    for (const [plan, from] of [['Before purification', 1], ['Internal oleation', 4], ['After purification', 9], ['General sattvic', 14]]) {
      await openCard();
      await tap(dlg().getByRole('button', { name: /^Diet/ }));
      await tap(dlg().getByRole('button', { name: new RegExp(`^${plan}`) }));
      await dlg().getByLabel('Starts', { exact: true }).fill(day(from)); await p.waitForTimeout(500);
      await step(`${plan} from day ${from}`);
      await tap(dlg().getByRole('button', { name: /^Start this plan|^Change from|^Start/ }));
      await step(`${plan} saved`);
    }
    await openCard(); await tap(dlg().getByRole('button', { name: /^Diet/ })); await scrollShots('diet course');
    const d = await patient();
    for (const k of [1, 4, 9, 14, 20]) { const m = await api('GET', `/patients/${d.id}/day?date=${day(k)}`); appendFileSync(`${OUT}/walk.tsv`, `${PART}\tmeals day ${k}\t\t\t${(m.meals || []).map((x) => x.meal + ': ' + x.text).join(' | ').slice(0, 300)}\t\n`); }
  },
  async course() {
    // Week 1 as the doctor writes it at the first consultation: oleation massage and steam daily from day 2, then week 2 vasti, week 3 dhara.
    await book(day(2), 'Abhyanga', 7, 'week 1 abhyanga');
    await book(day(2), 'Bashpa Sweda', 7, 'week 1 sweda');
    const d = await patient();
    const rows = await api('GET', `/appointments?patient_id=${d.id}`);
    appendFileSync(`${OUT}/walk.tsv`, `${PART}\tbooked so far\t\t\t${rows.map((a) => a.scheduled_date.slice(5, 10) + ' ' + a.start_time + ' ' + (a.therapy?.name || a.therapy_id) + ' ' + (a.staff?.name || '')).sort().join(' | ')}\t\n`);
    await openCard(); await scrollShots('card after week 1');
  },
  async weeks() {
    // Each review as the admin meets it: the browser's clock just after the consultation, the card, Plan next week, swaps, Book all.
    for (const [k, swaps] of [[8, { Abhyanga: 'Anuvasana Vasti', 'Bashpa Sweda': 'Kashaya Vasti' }], [15, { Abhyanga: 'Ksheeradhara', 'Bashpa Sweda': 'Nasya' }]]) {
      await book(day(k), 'Consultation', 1, `day ${k} review`);
      await p.clock.setFixedTime(new Date(`${day(k)}T18:00:00+05:30`));
      await openCard(); await step(`day ${k} card after review`);
      const plan = dlg().getByRole('button', { name: 'Plan next week' });
      if (!(await plan.count())) { await scrollShots(`day ${k} no plan next week`); continue; }
      await tap(plan); await scrollShots(`day ${k} next week`);
      for (const [from, to] of Object.entries(swaps)) {
        const sel = dlg().getByLabel(`Swap ${from}`);
        if (await sel.count()) await sel.selectOption({ label: to }).catch(async () => { await tap(sel); await tap(p.getByRole('option', { name: to }).or(dlg().getByRole('button', { name: to }))); });
      }
      if (Object.keys(swaps).length) await step(`day ${k} swapped`);
      const all = dlg().getByRole('button', { name: /^Book all|^Book it/ });
      if (await all.count() && await all.isEnabled()) { await tap(all); await step(`day ${k} booked`); }
    }
    const d = await patient();
    const rows = await api('GET', `/appointments?patient_id=${d.id}`);
    const th = Object.fromEntries((await api('GET', '/therapies')).map((t) => [t.id, t.name]));
    appendFileSync(`${OUT}/walk.tsv`, `${PART}\tcourse\t\t\t${rows.filter((a) => a.status !== 'cancelled').map((a) => a.scheduled_date.slice(5, 10) + ' ' + a.start_time + ' ' + th[a.therapy_id]).sort().join(' | ')}\t\n`);
  },
  async holiday() {
    // A closed day mid-course (scenario 3): day 11, where an Anuvasana Vasti is booked.
    await p.goto(`${APP}/`); await p.waitForTimeout(2500);
    await tap(p.getByRole('button', { name: 'Menu', exact: true }));
    await tap(dlg().getByRole('button', { name: /^Availability/ }));
    await tap(p.getByRole('button', { name: /^Centre closed days/ }));
    await tap(dlg().getByRole('button', { name: /^Close another day/ }));
    await step('close another day');
    const box = dlg().locator('input[type=date]'); if (await box.count()) await box.first().fill(day(11));
    await dlg().getByPlaceholder('Staff retreat').fill('Audit puja day');
    await step('closed day filled');
    await tap(dlg().getByRole('button', { name: 'Close and move them' }));
    await step('closed day saved');
    await showDay(day(11)); await step('day 11 after closing');
    await tap(p.getByRole('button', { name: 'Menu', exact: true }));
    const pill = dlg().getByRole('button', { name: /need you/ });
    if (await pill.count()) { await tap(pill); await scrollShots('day 11 what needs you'); }
  },
  async therapy() {
    await p.goto(`${APP}/admin/therapies`); await p.waitForTimeout(2500);
    await tap(p.getByRole('button', { name: /^Add a therapy|^New therapy|^Add therapy/ }).or(p.locator('button[aria-label^="Add"]')));
    await step('new therapy sheet');
    await dlg().getByLabel('Name', { exact: true }).fill('Audit Pizhichil');
    await dlg().locator('select').first().selectOption({ index: 4 }).catch(() => {});
    await tap(dlg().getByRole('button', { name: '2', exact: true }));
    await step('new therapy filled');
    await tap(dlg().getByRole('button', { name: /^Save|^Add/ }).last());
    await step('new therapy saved');
    // Scenario 12: the length of a therapy she has booked changes mid-course.
    await tap(p.getByRole('button', { name: /^Anuvasana Vasti/ }));
    await dlg().locator('select').first().selectOption({ label: '90 minutes' }).catch(async () => { await dlg().locator('select').first().selectOption({ index: 6 }); });
    await step('anuvasana 90 min');
    await tap(dlg().getByRole('button', { name: /^Save/ }));
    await step('anuvasana saved');
  },
  async breaks() {
    const mine = () => p.locator('[role=tabpanel][data-state=active]').getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasText: WHO.split(' ')[0] }).filter({ hasNotText: 'Consultation' }).first();
    if (process.env.ONLY_LEAVE) { await leaveFor(); return; }
    // Scenario 8: she does not come on day 14.
    await showDay(day(14)); await tap(mine()); await step('day 14 her treatment card');
    await tap(dlg().getByRole('button', { name: /^Something wrong/ })); await step('something wrong sheet');
    await tap(dlg().getByRole('button', { name: /didn't come$/ })); await step('marked didnt come');
    // Scenario 9: 40 minutes late on day 13: When, Suggested.
    await showDay(day(13)); await tap(mine());
    await tap(dlg().getByRole('button', { name: /^When/ })); await step('when sheet');
    await tap(dlg().getByRole('button', { name: /Suggested/ })); await step('moved later');
    // Scenario 2: the room of her day-12 treatment is out of use.
    await showDay(day(12)); await tap(mine());
    await tap(dlg().getByRole('button', { name: /^Something wrong/ }));
    await tap(dlg().getByRole('button', { name: /can't be used/ })); await step('room out of use');
    await leaveFor();
  },
};
async function leaveFor() {
    const mine = () => p.locator('[role=tabpanel][data-state=active]').getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasText: WHO.split(' ')[0] }).filter({ hasNotText: 'Consultation' }).first();
    // Scenario 1: her therapist on day 15 goes on leave, fixed from what needs you.
    await showDay(day(15)); await tap(mine()); await step('day 15 card shows therapist');
    const who = (await dlg().innerText()).match(/\nWith\n([^\n&]+?) ?(&|\n)/)?.[1]?.trim();
    await p.keyboard.press('Escape');
    await tap(p.getByRole('button', { name: 'Menu', exact: true }));
    await tap(dlg().getByRole('button', { name: /^Availability/ }));
    await tap(p.getByRole('button', { name: 'Mark not available', exact: true }));
    await tap(dlg().getByRole('button', { name: 'Show staff' }));
    if (who) await tap(dlg().getByRole('checkbox', { name: who, exact: true }));
    await tap(dlg().getByRole('button', { name: /^Next/ })); await step(`leave for ${who} dates`);
    await scrollShots('leave plan');
    const fix = dlg().getByRole('button', { name: /^Save and fix|^Fix|^Save, fix now|^Move/ });
    await tap((await fix.count()) ? fix : dlg().getByRole('button', { name: 'Save, fix later' })); await step('leave saved');
    await showDay(day(15));
    await tap(p.getByRole('button', { name: 'Menu', exact: true }));
    const pill = dlg().getByRole('button', { name: /need you/ });
    if (await pill.count()) { await tap(pill); await scrollShots('day 15 need you after leave'); }
}
Object.assign(parts, {
  async leave() {
    // Scenario 5 and 29: she leaves on day 18, three days early, with treatments booked after.
    await openCard(); await tap(dlg().getByRole('button', { name: /^Stay/ })); await step('stay sheet');
    await dlg().locator('input[type=date]').nth(1).fill(day(18)); await step('leaving day 18');
    const go = dlg().getByRole('button', { name: /^Leave on|^Save the stay/ }); if (await go.isEnabled()) { await tap(go); await step('stay shortened'); } else await p.keyboard.press('Escape');
    await openCard(); await scrollShots('card after shortening');
    // Scenario 30: the discharge summary on her leaving day, incomplete, then printed.
    await p.clock.setFixedTime(new Date(`${day(18)}T10:00:00+05:30`));
    await openCard(); await scrollShots('card on leaving day');
    const ds = dlg().getByRole('button', { name: /^Discharge summary|^Discharge/ });
    if (await ds.count()) {
      await tap(ds); await scrollShots('discharge sheet');
      const dl = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await tap(dlg().getByRole('button', { name: 'Print summary' }));
      const f = await dl; if (f) await f.saveAs(`${OUT}/discharge-summary.pdf`);
      await step('discharge printed', f ? 'pdf saved' : 'NO PDF');
    } else appendFileSync(`${OUT}/walk.tsv`, `${PART}\tno discharge row on the card\t\t\t\t\n`);
  },
  async edge() {
    // Scenario 28: a 200-character name with an emoji, a leaving date before arriving.
    await p.goto(`${APP}/admin/patients`); await p.waitForTimeout(2500);
    await tap(p.getByRole('button', { name: 'New patient', exact: true }));
    await dlg().getByLabel('Name', { exact: true }).fill('🙏 ' + 'Ananthapadmanabhan '.repeat(11));
    await tap(dlg().getByRole('button', { name: 'Female' }));
    const dates = dlg().locator('input[type=date]');
    await dates.nth(0).fill(day(5)); await dates.nth(1).fill(day(2));
    await step('long emoji name, leaving before arriving');
    await p.keyboard.press('Escape');
    // Scenario 27: the server cannot be reached when saving.
    await openCard(); await tap(dlg().getByRole('button', { name: /^Plan/ }));
    await dlg().locator('textarea').fill('Week 2: vasti course, review Friday.');
    await p.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort('internetdisconnected')));
    await tap(dlg().getByRole('button', { name: 'Save the plan' })); await step('save while offline');
    await p.unroute('**/api/**');
    await tap(dlg().getByRole('button', { name: 'Save the plan' })); await step('save when back online');
    // Scenario 26: the sign-in has expired mid-form.
    await openCard(); await tap(dlg().getByRole('button', { name: /^Plan/ }));
    await dlg().locator('textarea').fill('Edited after the sign-in expired.');
    await p.evaluate(() => localStorage.setItem('authToken', 'expired.token.value'));
    await tap(dlg().getByRole('button', { name: 'Save the plan' })); await step('save with expired sign-in');
    await p.waitForTimeout(1500); await step('after expiry', p.url());
  },
});
try { await parts[PART](); } catch (e) { await step('BROKE', e.message.split('\n')[0]); console.log('BROKE', e.message.split('\n')[0]); console.log(await dlg().locator('button, [role=button], input').evaluateAll((els) => els.map((x) => (x.getAttribute('aria-label') || x.innerText || x.type || '').replace(/\s+/g, ' ').slice(0, 50)))); }
await b.close();
console.log(`${PART}: ${n} shots`);
