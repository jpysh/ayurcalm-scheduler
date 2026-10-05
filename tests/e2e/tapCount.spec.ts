import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * The admin's daily jobs from #143, walked on a phone the way the app makes
 * them walk today, counting taps against the targets of the approved phone
 * design (#144). Typing is not counted; a tap on something that was not on
 * screen first also counts as a scroll, and a job with a scroll is over target.
 *
 * It only reports (a printed table, nightly; policy of 6 Oct, #315). A session
 * that builds a job's new path states its before and after in the PR.
 *
 * Everything a job changes is undone, and the two days it touches are
 * compared back through the API.
 */

/** The design's order, which is the order the table prints in. */
// 5 Oct: + , search and the pill moved into the Menu (the maintainer's call), so every job that used one of them costs one tap more.
const JOBS: [string, number][] = [
  ['See today at a glance', 0],
  ['Warning → fixed day', 3],
  ["Patient didn't come", 3],
  // Row, When, a time: the design's 2 starts from the card already open (#136).
  ['Patient late → move one treatment', 3],
  // The design's 2 assumes the day is already by therapist; from by time it is 3 (#62).
  ['Therapist not in', 3],
  // Row, Something wrong?, the room: the design's 2 starts from the card open.
  ['Room out of use', 3],
  // Who, then Book: one tap more than the old suggestion, bought by a choice of who, therapist, room and time (story 5, accepted).
  ['Book one treatment', 4], // #330: no therapy is chosen for the admin, so +, who, a therapy, Book
  ["A patient's meals today", 2],
  ["Print today's sheets", 2], // Print moved into the Menu (5 Oct): the bar keeps room for the date
  // From the Patients screen. Story 4 says 2; the gender is one tap because nothing is chosen for them (#283).
  ['Add an arriving patient', 3], // 6 Oct (#313): +, gender, Add
  // From the Patients screen: Search, then the person (typing is not counted).
  ['Find a patient', 3],
  // Stories 7 to 12 (#285), from the patient's card already open, as the design counts them.
  ["Change a patient's meals from a date", 3],
  ["Choose a patient's package", 3],
  ["Choose a patient's accommodation", 3],
  ["Change a patient's stay", 3],
  ["Print a patient's discharge summary", 3],
  // From the day: Menu, Leave, +, Who, a name on the searchable list (150 names do not fit a phone's wheel), Save, plan later (#313: + is on the bar, was 7).
  ["Record a therapist's leave", 6],
  // Menu, Diet plans, the plan, Save (#285 session 6).
  ['Edit a diet plan', 4],
  // Menu, Settings, What needs you, a switch (#285 session 7, #288).
  ['Change what needs you', 4],
  // Menu, Settings, Log.
  ['Open the Log', 3],
  // Menu, Patients, the chip (#285 session 8, story 1): the same items the pill lists, as a list of patients.
  ['See who needs attention', 3],
];

const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

test.use({ viewport: { width: 375, height: 812 } });

type Row = { job: string; target: number; taps: number | null; scrolls: number; note: string };

async function api(request: APIRequestContext) {
  const { token } = await (await request.post('/api/auth/login', { data: ADMIN })).json();
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: async (path: string) => (await request.get(`/api${path}`, { headers })).json(),
    del: async (path: string) => request.delete(`/api${path}`, { headers }),
    put: async (path: string, data: unknown) => request.put(`/api${path}`, { headers, data }),
    post: async (path: string, data: unknown) => request.post(`/api${path}`, { headers, data }),
  };
}
type Api = Awaited<ReturnType<typeof api>>;

/** A day's bookings and all time off, in a form that compares exactly. */
async function snapshot(call: Api, day: string) {
  const appts = (await call.get(`/appointments?date=${day}`)) as Record<string, unknown>[];
  const off = (await call.get('/timeoff')) as Record<string, unknown>[];
  return {
    appts: appts.map((a) => [a.id, a.staff_id, a.room_id, a.start_time, a.scheduled_date, a.status, a.notes].join('|')).sort(),
    off: off.map((h) => String(h.id)).sort(),
  };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/admin/);
}

const activePanel = (page: Page) => page.locator('[role=tabpanel][data-state=active]');

/** Not counted: puts the day on screen before a job starts, from the bottom bar's day button. */
async function showDay(page: Page, day: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change day/ }).click();
  const box = page.getByRole('dialog').locator('input[type=date]');
  // Already on that day: nothing changes, so the sheet stays open until closed.
  if ((await box.inputValue()) === day) await page.keyboard.press('Escape');
  else await box.fill(day);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

type Walk = (tap: (target: Locator) => Promise<void>, swipe: () => void) => Promise<string | void>;

/** Walks one job from the day with nothing open, counting its taps. */
async function job(page: Page, rows: Row[], name: string, walk: Walk) {
  // The page is not reloaded between jobs: the admin does not, and a reload
  // per job ran into the server's rate limit.
  // A sheet opened from a card gives the card back when it closes, so more than one Escape may be needed.
  for (let i = 0; i < 4 && (await page.getByRole('dialog').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A note from the last job fades by itself; the admin would not be mid-note.
  // Not while the pointer rests on it: a hovered toast never fades, which is
  // how this wait broke on CI after a job's last tap near the bottom.
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
  if (!page.url().endsWith('/schedule')) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Back to the day/ }).click();
    await expect(page).toHaveURL(/\/schedule$/);
  }

  let taps = 0;
  let scrolls = 0;
  const tap = async (target: Locator) => {
    await target.waitFor({ timeout: 15000 });
    // A sheet still sliding in is not where the thumb will find it.
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => null))));
    // Reachable means a thumb could tap it now: inside the viewport, and not
    // clipped by a scrolled list or covered by something else.
    const reachable = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
    });
    if (!reachable) scrolls++;
    await target.click();
    taps++;
  };
  const target = JOBS.find(([j]) => j === name)![1];
  try {
    const note = await walk(tap, () => { scrolls++; });
    rows.push({ job: name, target, taps, scrolls, note: note || '' });
  } catch (e) {
    rows.push({ job: name, target, taps: null, scrolls: 0, note: `walk broke: ${(e as Error).message.split('\n')[0]}` });
    await page.screenshot({ path: test.info().outputPath(`${name.replace(/\W+/g, '-')}.png`) });
  }
}

test('tap count for the daily jobs, against the phone design', async ({ page, request }) => {
  test.setTimeout(300000);
  const call = await api(request);
  const tz = ((await call.get('/settings')).timezone as string) || 'Asia/Kolkata';
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const today = ymd(new Date());
  // Jobs that depend on the hour (what is still missable, "from now") run on
  // the next working day, so the count does not change with the time of day.
  let day = '';
  for (let i = 1; i <= 7 && !day; i++) {
    const d = ymd(new Date(Date.now() + i * 86400000));
    // Not a weekend holding the one treatment another test booked.
    if (((await call.get(`/appointments?date=${d}`)) as unknown[]).length >= 10) day = d;
  }
  expect(day, 'no working day in the next week to walk the jobs on').not.toBe('');
  const before = { today: await snapshot(call, today), day: await snapshot(call, day) };
  const staff = (await call.get('/staff')) as { id: string; name: string; is_active: boolean }[];

  // Whatever a job leaves behind, even one that broke halfway, is put back
  // through the API before the days are compared.
  const accepted = new Set<string>();
  page.on('response', async (res) => {
    if (!res.url().includes('/day-check/accept') || !res.ok()) return;
    const batch = (await res.json().catch(() => ({}))).batch_id;
    if (batch) accepted.add(batch);
  });
  page.on('request', (req) => {
    if (req.url().includes('/replan/undo')) accepted.delete(JSON.parse(req.postData() || '{}').batch_id);
  });
  const rowsOf = async (d: string) => (await call.get(`/appointments?date=${d}`)) as { id: string; status: string; notes: string | null; start_time: string; staff_id: string | null; room_id: string | null }[];
  const beforeRows = [...await rowsOf(today), ...await rowsOf(day)];
  // Each clean-up step that is refused (the write limit answers 429), with its status.
  // Checked before the centre is compared, so the cause is the first line of the failure (#192).
  const refused: string[] = [];
  const must = async (what: string, res: { ok(): boolean; status(): number }) => { if (!res.ok()) refused.push(`${what} -> ${res.status()}`); };
  const restore = async () => {
    for (const batch of accepted) await must(`POST /replan/undo ${batch}`, await call.post('/replan/undo', { batch_id: batch }));
    for (const h of (await call.get('/timeoff')) as { id: string }[]) {
      if (before.day.off.includes(String(h.id))) continue;
      await must(`DELETE /timeoff/${h.id}`, await call.del(`/timeoff/${h.id}`));
    }
    // A booking the walk made, and any treatment it changed, put back.
    const was = new Set(beforeRows.map((a) => a.id));
    const now = new Map([...await rowsOf(today), ...await rowsOf(day)].map((a) => [a.id, a]));
    for (const a of now.values()) if (!was.has(a.id)) await must(`DELETE /appointments/${a.id}`, await call.del(`/appointments/${a.id}`));
    for (const a of beforeRows) {
      const n = now.get(a.id);
      if (n && (n.status !== a.status || n.notes !== a.notes || n.start_time !== a.start_time || n.staff_id !== a.staff_id || n.room_id !== a.room_id)) {
        await must(`PUT /appointments/${a.id}`, await call.put(`/appointments/${a.id}`, { status: a.status, notes: a.notes ?? '', start_time: a.start_time, staff_id: a.staff_id, room_id: a.room_id }));
      }
    }
  };

  const rows: Row[] = [];
  await signIn(page);
  try {
    await job(page, rows, 'See today at a glance', async (_tap, swipe) => {
      // The line at now, or the first treatment on a day that has not started.
      await activePanel(page).getByRole('button', { name: /^\d\d:\d\d/ }).first().waitFor();
      const first = (await page.locator('#nowline').count()) ? page.locator('#nowline') : activePanel(page).getByRole('button', { name: /^\d\d:\d\d/ }).first();
      if (!(await first.evaluate((el) => el.getBoundingClientRect().top < innerHeight))) {
        swipe();
        return 'the first treatment is below the fold';
      }
    });

    // From the day: a treatment's row, then the resident's name opens their card with today's meals.
    await job(page, rows, "A patient's meals today", async (tap) => {
      await showDay(page, today);
      // A row a thumb can reach: not under the sticky day header, the pill or the bar. The day opens at now, so which row that is moves through the day.
      const treatments = activePanel(page).getByRole('button', { name: /^\d\d:\d\d/ });
      await treatments.first().waitFor();
      const onScreen = await treatments.evaluateAll((els) => Math.max(0, els.findIndex((el) => { const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight - 130) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && el.contains(hit); })));
      await tap(treatments.nth(onScreen));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Patient/ }));
      await expect(page.getByRole('dialog')).toContainText('Meals today');
    });

    await job(page, rows, "Print today's sheets", async (tap) => {
      await showDay(page, today);
      const download = page.waitForEvent('download');
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Print the day's sheets/ }));
      expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      return 'the therapist rota is a second tap, on the note that follows';
    });

    // + asks who, then fills the rest in with a free time, therapist and room (#285 story 5).
    await job(page, rows, 'Book one treatment', async (tap) => {
      await showDay(page, day);
      // Someone who has had a treatment before, so the list's first row is the last one they had (#330).
      let name = '';
      const who = (await call.get(`/appointments/who?date=${day}`)) as { none: { id: string; name: string }[]; all: { id: string; name: string }[] };
      for (const p of [...who.none, ...who.all].slice(0, 40)) {
        if (((await call.get(`/appointments/therapies?date=${day}&patient_id=${p.id}`)) as { therapies: { repeat: boolean }[] }).therapies.some((t) => t.repeat)) { name = p.name; break; }
      }
      expect(name, 'nobody in house has had a treatment before').not.toBe('');
      await tap(page.getByRole('button', { name: 'Book a treatment', exact: true }));
      await page.getByRole('dialog').getByLabel('Search patients').fill(name);
      await tap(page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).first());
      // The therapy is a visible list with nothing chosen (#330).
      await tap(page.getByRole('dialog').getByRole('button', { name: /Same as last time/ }).first());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Book / }));
      // The sheet stays on Booked (#330); Undo is on it, and is not a tap of the job.
      await expect(page.getByRole('dialog').getByText(/Booked/).first()).toBeVisible({ timeout: 20000 });
      await page.getByRole('dialog').getByRole('button', { name: 'Undo', exact: true }).click();
    });

    // On the walk's day with a room taken out first: today's own problem has
    // started by the afternoon, and then there is nothing left to fix.
    await job(page, rows, 'Warning → fixed day', async (tap) => {
      const booked = (await rowsOf(day)).find((a) => a.room_id && a.status === 'pending');
      await call.post('/timeoff', { entity_type: 'room', entity_id: booked!.room_id, date: day, description: 'Tap count: out of use' });
      // Arrive at the day afresh, so the app checks it after the room went out.
      await showDay(page, today);
      await showDay(page, day);
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /need you/ }));
      const sheet = page.getByRole('dialog');
      // The first action row's own button: the one that does the thing (#164).
      await tap(sheet.locator('[data-main]').first());
      await expect(sheet).toContainText('✓', { timeout: 20000 });
      await sheet.getByRole('button', { name: 'Undo', exact: true }).first().click();
      await expect(sheet).toContainText('Put back as it was.', { timeout: 20000 });
    });

    // The treatment card (#136): a treatment still to come on the walk's day.
    // Not a no-show: its card has no "Something wrong?" (#211).
    const upcoming = () => activePanel(page).getByRole('button', { name: /^\d\d:\d\d/ }).filter({ hasNotText: "didn't come" }).first();
    await job(page, rows, "Patient didn't come", async (tap) => {
      await showDay(page, day);
      await tap(upcoming());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /didn't come$/ }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: "didn't come" });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
    });

    await job(page, rows, 'Patient late → move one treatment', async (tap) => {
      await showDay(page, day);
      await tap(upcoming());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^When/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /Suggested/ }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: 'Moved to' });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
      return 'the design counts the card as open';
    });

    await job(page, rows, 'Add an arriving patient', async (tap) => {
      await page.goto('/admin/patients');
      await page.getByRole('button', { name: 'New patient', exact: true }).waitFor();
      await tap(page.getByRole('button', { name: 'New patient', exact: true }));
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Tapcount Meera');
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Female' }));
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Add Tapcount Meera' }));
      await expect(page.getByRole('dialog').last().getByRole('button', { name: /^Diet/ })).toBeVisible({ timeout: 15000 });
      const mine = ((await call.get('/patients')) as { id: string; name: string }[]).filter((p) => p.name === 'Tapcount Meera');
      for (const p of mine) await must(`DELETE /patients/${p.id}`, await call.del(`/patients/${p.id}`));
      await page.keyboard.press('Escape');
      return 'from the Patients screen; the consultation is pre-booked';
    });

    await job(page, rows, 'Find a patient', async (tap) => {
      await page.goto('/admin/patients');
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Search patients/ }));
      await expect(page.getByPlaceholder('Search patients')).toBeFocused();
      await page.keyboard.type('sha');
      await tap(page.getByText(/Diet:/).first());
      await expect(page.getByRole('dialog').last().getByRole('button', { name: /^Diet/ })).toBeVisible({ timeout: 15000 });
      // Closing the card returns to the results; the search is left with its own Cancel.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: /^Cancel/ }).click();
    });

    // Stories 7 to 12 (#285): one patient made for the walk, a card open, the job from there. Deleted afterwards.
    const story = (await call.post('/patients', { name: 'Tapcount Story', gender: 'female', stay: { start_date: today, end_date: ymd(new Date(Date.now() + 13 * 86400000)) } }).then((r) => r.json())) as { id: string };
    const card = () => page.getByRole('dialog').last();
    const openStory = async () => {
      await page.goto('/admin/patients');
      await page.getByRole('button', { name: /Tapcount Story/ }).click();
      await card().getByRole('button', { name: /^Diet/ }).waitFor();
    };
    try {
      await job(page, rows, "Change a patient's meals from a date", async (tap) => {
        await openStory();
        await tap(card().getByRole('button', { name: /^Diet/ }));
        await tap(card().locator('button[aria-pressed]').nth(2));
        await tap(card().getByRole('button', { name: /^Start this plan/ }));
        await expect(page.locator('[data-sonner-toast]').filter({ hasText: /from/ })).toBeVisible({ timeout: 20000 });
        return 'from the card; Today is preselected, Start names the date';
      });
      await job(page, rows, "Choose a patient's package", async (tap) => {
        await openStory();
        await tap(card().getByRole('button', { name: /^Package/ }));
        // The package nearest the stay is ready: one tap to use it.
        await tap(card().getByRole('button', { name: /^Use \d+ days/ }));
        await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Panchakarma/ })).toBeVisible({ timeout: 20000 });
      });
      await job(page, rows, "Choose a patient's accommodation", async (tap) => {
        await openStory();
        await tap(card().getByRole('button', { name: /^Accommodation/ }));
        await tap(card().locator('button[aria-pressed]').nth(1));
        await tap(card().getByRole('button', { name: /^Use / }));
        await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Tapcount/ })).toBeVisible({ timeout: 20000 });
      });
      await job(page, rows, "Change a patient's stay", async (tap) => {
        await openStory();
        await tap(card().getByRole('button', { name: /^Stay/ }));
        const leaving = card().locator('input[type=date]').nth(1);
        // The phone's own calendar opens on this tap; choosing a day in it is not a second one.
        await tap(leaving);
        await leaving.fill(ymd(new Date(Date.now() + 10 * 86400000)));
        await tap(card().getByRole('button', { name: /^Leave on/ }));
        await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Tapcount/ })).toBeVisible({ timeout: 20000 });
      });
      await job(page, rows, "Print a patient's discharge summary", async (tap) => {
        await openStory();
        await tap(card().getByRole('button', { name: /^Discharge summary/ }));
        const download = page.waitForEvent('download');
        await tap(card().getByRole('button', { name: 'Print summary' }));
        expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
        return 'missing items print as blank lines; nothing blocks';
      });
    } finally {
      await must(`DELETE /patients/${story.id}`, await call.del(`/patients/${story.id}`));
    }

    await job(page, rows, "Record a therapist's leave", async (tap) => {
      await showDay(page, day);
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Leave/ }));
      await tap(page.getByRole('button', { name: 'Add leave', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Who or what/ }));
      await tap(page.getByRole('dialog').last().getByRole('button', { name: staff.find((x) => x.is_active)!.name, exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Save, plan later' }));
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Leave saved/ })).toBeVisible({ timeout: 20000 });
    });

    // Menu, Diet plans, a plan, then Save. Typing is not counted; the walk saves the plan as it is, so nothing changes.
    await job(page, rows, 'Edit a diet plan', async (tap) => {
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Diet plans/ }));
      await tap(activePanel(page).getByRole('button', { name: /patients?$|Not used$/ }).first());
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Save the plan' }));
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /saved$/ })).toBeVisible({ timeout: 20000 });
    });

    // A rule switched on and off again: the switch is the fourth tap; putting it back is not counted.
    await job(page, rows, 'Change what needs you', async (tap) => {
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Settings/ }));
      await tap(activePanel(page).getByRole('button', { name: /^What needs you/ }));
      const rule = page.getByRole('dialog').getByRole('switch', { name: /^Leaves tomorrow/ });
      await tap(rule);
      await expect(rule).toBeChecked({ timeout: 15000 });
      await rule.click();
      await expect(rule).not.toBeChecked({ timeout: 15000 });
      await page.keyboard.press('Escape');
    });

    await job(page, rows, 'Open the Log', async (tap) => {
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Settings/ }));
      await tap(activePanel(page).getByRole('button', { name: /^Log\b/ }));
      await expect(activePanel(page).getByRole('heading', { name: 'Log' })).toBeVisible({ timeout: 15000 });
    });

    await job(page, rows, 'See who needs attention', async (tap) => {
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Patients/ }));
      await tap(activePanel(page).getByRole('button', { name: /^Needs attention/ }));
      await expect(activePanel(page).getByRole('button', { name: /^Needs attention/ })).toHaveAttribute('aria-pressed', 'true');
    });

    await job(page, rows, 'Therapist not in', async (tap) => {
      await showDay(page, day);
      await tap(page.getByRole('button', { name: /^Show the day by/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Therapist', exact: true }));
      await tap(activePanel(page).getByRole('button', { name: / not in$/ }).first());
      const note = page.locator('[data-sonner-toast]');
      await expect(note).toContainText('not in all day', { timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
      await activePanel(page).getByRole('button', { name: /^Show the day by/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Time', exact: true }).click();
    });

    // From a treatment in that room: Something wrong? → the room can't be used.
    await job(page, rows, 'Room out of use', async (tap) => {
      await showDay(page, day);
      await tap(upcoming());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /can't be used/ }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: 'out of use' });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
    });
  } finally {
    await restore();
  }
  expect(refused, 'the walk could not put the centre back: a clean-up was refused').toEqual([]);
  // The walk leaves the centre as it found it.
  expect(await snapshot(call, today)).toEqual(before.today);
  expect(await snapshot(call, day)).toEqual(before.day);

  rows.sort((a, b) => JOBS.findIndex(([j]) => j === a.job) - JOBS.findIndex(([j]) => j === b.job));
  const pad = (s: string, n: number) => s.padEnd(n);
  const lines = [
    `${pad('Job', 36)}${pad('Target', 8)}${pad('Now', 6)}Note`,
    ...rows.map((r) => `${pad(r.job, 36)}${pad(String(r.target), 8)}${pad(r.taps === null ? '—' : String(r.taps), 6)}${[
      r.taps === null ? '' : r.taps > r.target ? `over by ${r.taps - r.target}` : r.scrolls ? 'over' : 'ok',
      r.scrolls ? `+${r.scrolls} scroll${r.scrolls === 1 ? '' : 's'}` : '',
      r.note,
    ].filter(Boolean).join('; ')}`),
  ];
  console.log(`\nTap count at 375×812 (${today}):\n${lines.join('\n')}\n`);
  await test.info().attach('tap-count.txt', { body: lines.join('\n'), contentType: 'text/plain' });
});
