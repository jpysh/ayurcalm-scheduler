import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * The admin's daily jobs from #143, walked on a phone the way the app makes
 * them walk today, counting taps against the targets of the approved phone
 * design (#144). Typing is not counted; a tap on something that was not on
 * screen first also counts as a scroll, and a job with a scroll is over target.
 *
 * It reports; it does not fail, except for the jobs in BLOCKING. When a
 * session builds a job's new path, it adds that job here, so the job cannot
 * quietly get longer again. Each later session states its before and after.
 *
 * Everything a job changes is undone, and the two days it touches are
 * compared back through the API.
 */
const BLOCKING = new Set<string>(['See today at a glance', "Print today's sheets", 'Therapist not in', "Resident didn't come", 'Resident late → move one treatment', 'Book one treatment', 'Room out of use', 'Warning → fixed day']);

/** The design's order, which is the order the table prints in. */
const JOBS: [string, number][] = [
  ['See today at a glance', 0],
  ['Warning → fixed day', 2],
  ["Resident didn't come", 3],
  // Row, When, a time: the design's 2 starts from the card already open (#136).
  ['Resident late → move one treatment', 3],
  // The design's 2 assumes the day is already by therapist; from by time it is 3 (#62).
  ['Therapist not in', 3],
  // Row, Something wrong?, the room: the design's 2 starts from the card open.
  ['Room out of use', 3],
  ['Book one treatment', 2],
  ["A resident's meals today", 2],
  ["Print today's sheets", 1],
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
  await page.getByRole('button', { name: /^Change day/ }).click();
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
  await page.keyboard.press('Escape');
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
  test.setTimeout(240000);
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
  const restore = async () => {
    for (const batch of accepted) await call.post('/replan/undo', { batch_id: batch });
    for (const h of (await call.get('/timeoff')) as { id: string }[]) {
      if (before.day.off.includes(String(h.id))) continue;
      const res = await call.del(`/timeoff/${h.id}`);
      // Said, not swallowed: a restore refused (the write limit) leaves the centre changed.
      if (!res.ok()) console.log(`restore: DELETE /timeoff/${h.id} -> ${res.status()}`);
    }
    // A booking the walk made, and any treatment it changed, put back.
    const was = new Set(beforeRows.map((a) => a.id));
    const now = new Map([...await rowsOf(today), ...await rowsOf(day)].map((a) => [a.id, a]));
    for (const a of now.values()) if (!was.has(a.id)) await call.del(`/appointments/${a.id}`);
    for (const a of beforeRows) {
      const n = now.get(a.id);
      if (n && (n.status !== a.status || n.notes !== a.notes || n.start_time !== a.start_time || n.staff_id !== a.staff_id || n.room_id !== a.room_id)) {
        await call.put(`/appointments/${a.id}`, { status: a.status, notes: a.notes ?? '', start_time: a.start_time, staff_id: a.staff_id, room_id: a.room_id });
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

    await job(page, rows, "A resident's meals today", async (tap) => {
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Diet plans/ }));
      const dayButtons = activePanel(page).getByRole('button', { name: 'Day', exact: true });
      await dayButtons.first().waitFor();
      // Someone from the middle of the list, found by typing their name (#137).
      // By element, not role: on a phone the table's rows are cards (#137).
      const rowsWithDay = activePanel(page).locator('tr').filter({ has: page.getByRole('button', { name: 'Day', exact: true }) });
      const name = (await rowsWithDay.nth(Math.floor((await rowsWithDay.count()) / 2)).locator('td').first().innerText()).trim();
      await activePanel(page).getByRole('textbox', { name: 'Search residents' }).fill(name);
      await tap(dayButtons.first());
      await expect(page.getByRole('dialog')).toContainText(/Diet for one day/);
      return 'the name is typed, not tapped';
    });

    await job(page, rows, "Print today's sheets", async (tap) => {
      await showDay(page, today);
      const download = page.waitForEvent('download');
      await tap(page.getByRole('button', { name: "Print the day's sheets" }));
      expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      return 'the therapist rota is a second tap, on the note that follows';
    });

    // + offers the server's next free time for the residents furthest behind (#136).
    await job(page, rows, 'Book one treatment', async (tap) => {
      await showDay(page, day);
      await tap(page.getByRole('button', { name: 'Book a treatment' }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Book / }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: /^Booked/ });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
    });

    // On the walk's day with a room taken out first: today's own problem has
    // started by the afternoon, and then there is nothing left to fix.
    await job(page, rows, 'Warning → fixed day', async (tap) => {
      const booked = (await rowsOf(day)).find((a) => a.room_id && a.status === 'pending');
      await call.post('/timeoff', { entity_type: 'room', entity_id: booked!.room_id, date: day, description: 'Tap count: out of use' });
      // Arrive at the day afresh, so the app checks it after the room went out.
      await showDay(page, today);
      await showDay(page, day);
      await tap(page.getByRole('button', { name: /to fix/ }));
      const sheet = page.getByRole('dialog');
      // The first action row's own button: the one that does the thing (#164).
      await tap(sheet.locator('[data-main]').first());
      await expect(sheet).toContainText('✓', { timeout: 20000 });
      await sheet.getByRole('button', { name: 'Undo', exact: true }).first().click();
      await expect(sheet).toContainText('Put back as it was.', { timeout: 20000 });
    });

    // The treatment card (#136): a treatment still to come on the walk's day.
    const upcoming = () => activePanel(page).getByRole('button', { name: /^\d\d:\d\d/ }).first();
    await job(page, rows, "Resident didn't come", async (tap) => {
      await showDay(page, day);
      await tap(upcoming());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^Something wrong/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /didn't come$/ }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: "didn't come" });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
    });

    await job(page, rows, 'Resident late → move one treatment', async (tap) => {
      await showDay(page, day);
      await tap(upcoming());
      await tap(page.getByRole('dialog').getByRole('button', { name: /^When/ }));
      await tap(page.getByRole('dialog').getByRole('button', { name: /Suggested/ }));
      const note = page.locator('[data-sonner-toast]').filter({ hasText: 'Moved to' });
      await expect(note).toBeVisible({ timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
      return 'the design counts the card as open';
    });

    await job(page, rows, 'Therapist not in', async (tap) => {
      await showDay(page, day);
      await tap(page.getByRole('button', { name: 'Menu', exact: true }));
      await tap(page.getByRole('dialog').getByRole('button', { name: 'Therapist', exact: true }));
      await tap(activePanel(page).getByRole('button', { name: / not in$/ }).first());
      const note = page.locator('[data-sonner-toast]');
      await expect(note).toContainText('not in all day', { timeout: 20000 });
      await note.getByRole('button', { name: 'Undo' }).click();
      await activePanel(page).getByRole('button', { name: 'Back to by time' }).click();
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
    ].filter(Boolean).join('; ')}${BLOCKING.has(r.job) ? ' [blocking]' : ''}`),
  ];
  console.log(`\nTap count at 375×812 (${today}):\n${lines.join('\n')}\n`);
  await test.info().attach('tap-count.txt', { body: lines.join('\n'), contentType: 'text/plain' });

  for (const r of rows.filter((x) => BLOCKING.has(x.job))) {
    expect(r.taps, `${r.job}: ${r.note}`).not.toBeNull();
    expect(r.taps! + r.scrolls, r.job).toBeLessThanOrEqual(r.target);
  }
});
