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
const BLOCKING = new Set<string>(['See today at a glance', "Print today's sheets"]);

/** The design's order, which is the order the table prints in. */
const JOBS: [string, number][] = [
  ['See today at a glance', 0],
  ['Warning → fixed day', 2],
  ["Resident didn't come", 3],
  ['Resident late → move one treatment', 2],
  ['Therapist not in', 2],
  ['Room out of use', 2],
  ['Book one treatment', 2],
  ["A resident's meals today", 2],
  ["Print today's sheets", 1],
];

const ADMIN = { email: 'admin@example.com', password: 'demo1234' };

// The server allows 40 writes per address in 5 minutes, and counts Verify
// working out the day (a POST) as one. The walk makes about 23, after the other
// tests' writes, so each run takes its own count by the header the limiter
// keys on: a before and an after run within 5 minutes would share one.
test.use({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { 'cf-connecting-ip': `tap-count-${Date.now()}` } });

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
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
  if (!page.url().endsWith('/schedule')) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^The day/ }).click();
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
  const booked = (await call.get(`/appointments?date=${day}`)) as { staff_id: string | null; co_staff_ids?: string[]; room_id: string | null; patient_id: string }[];
  const staff = (await call.get('/staff')) as { id: string; name: string; is_active: boolean }[];
  const rooms = (await call.get('/rooms')) as { id: string; name: string; is_active: boolean }[];
  const patients = (await call.get('/patients')) as { id: string; name: string }[];
  // Someone with nothing booked that day: marking them off moves nothing, so
  // the Undo restores everything. A room out of use only records the time off.
  const idleTherapist = staff.find((s) => s.is_active && !booked.some((a) => a.staff_id === s.id || a.co_staff_ids?.includes(s.id)))!;
  const room = rooms.find((r) => r.is_active)!;
  // Someone staying that week, so the booking has days to go to.
  const walkIn = patients.find((p) => p.id === booked[0].patient_id)!;

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
  const rowsOf = async (d: string) => (await call.get(`/appointments?date=${d}`)) as { id: string; status: string; notes: string | null }[];
  const beforeRows = [...await rowsOf(today), ...await rowsOf(day)];
  const walkInBefore = new Set(((await call.get(`/appointments?patient_id=${walkIn.id}`)) as { id: string }[]).map((a) => a.id));
  const restore = async () => {
    for (const batch of accepted) await call.post('/replan/undo', { batch_id: batch });
    for (const h of (await call.get('/timeoff')) as { id: string }[]) if (!before.day.off.includes(String(h.id))) await call.del(`/timeoff/${h.id}`);
    for (const a of (await call.get(`/appointments?patient_id=${walkIn.id}`)) as { id: string }[]) if (!walkInBefore.has(a.id)) await call.del(`/appointments/${a.id}`);
    const now = new Map([...await rowsOf(today), ...await rowsOf(day)].map((a) => [a.id, a]));
    for (const a of beforeRows) {
      const n = now.get(a.id);
      if (n && (n.status !== a.status || n.notes !== a.notes)) await call.put(`/appointments/${a.id}`, { status: a.status, notes: a.notes ?? '' });
    }
  };

  const rows: Row[] = [];
  await signIn(page);
  try {
    await job(page, rows, 'See today at a glance', async (_tap, swipe) => {
      const first = activePanel(page).getByRole('button', { name: /\d\d:\d\d–\d\d:\d\d/ }).first();
      await first.waitFor();
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
      // Someone from the middle of the list: nobody the admin looks for is first.
      await tap(dayButtons.nth(Math.floor((await dayButtons.count()) / 2)));
      await expect(page.getByRole('dialog')).toContainText(/Diet for one day/);
      return 'no search; the list is scrolled by hand';
    });

    await job(page, rows, "Print today's sheets", async (tap) => {
      await showDay(page, today);
      const download = page.waitForEvent('download');
      await tap(page.getByRole('button', { name: "Print the day's sheets" }));
      expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      return 'the therapist rota is a second tap, on the note that follows';
    });

    await job(page, rows, 'Book one treatment', async (tap) => {
      await tap(page.getByRole('button', { name: 'Book a treatment' }));
      await page.getByLabel('Start Date').fill(day);
      await page.getByLabel('End Date').fill(ymd(new Date(Date.parse(day) + 7 * 86400000)));
      await tap(page.getByRole('button', { name: 'Select patient' }));
      await page.getByPlaceholder('Search patient').fill(walkIn.name);
      await tap(page.getByRole('option').first());
      await tap(page.getByRole('button', { name: /Select therapy/i }));
      await page.getByPlaceholder(/Search therapy/i).fill('Abhyanga');
      await tap(page.getByRole('option').first());
      await tap(page.getByRole('button', { name: 'Auto-Assign' }));
      await expect(page.getByText(/suggested slot/)).toBeVisible({ timeout: 20000 });
      await tap(page.getByText(/^Option 1$/));
      await tap(page.getByRole('button', { name: 'Confirm Selected Slot' }));
      await expect(page.getByText('Selected slot confirmed')).toBeVisible({ timeout: 20000 });
      return '+ typing the resident and the therapy';
    });

    await job(page, rows, 'Warning → fixed day', async (tap) => {
      await showDay(page, today);
      await tap(page.getByRole('button', { name: /^Fix/ }));
      const verify = page.getByRole('dialog');
      await tap(verify.getByRole('button', { name: /^Accept the plan/ }));
      await expect(verify).toContainText(/changes? made/, { timeout: 20000 });
      await verify.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
    });

    await job(page, rows, "Resident didn't come", async (tap) => {
      await showDay(page, day);
      await tap(activePanel(page).getByRole('button', { name: 'Verify', exact: true }));
      const verify = page.getByRole('dialog');
      await tap(verify.getByRole('button', { name: "Resident didn't come" }));
      await tap(verify.getByRole('combobox'));
      await tap(page.getByRole('option').first());
      await tap(verify.getByRole('button', { name: 'Mark as no-show' }));
      await expect(verify).toContainText('marked as no-show', { timeout: 20000 });
      await verify.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
    });

    // A treatment's card offers Edit, and the edit form shows the time as
    // text: one treatment cannot be moved to another time (#136).
    rows.push({ job: 'Resident late → move one treatment', target: 2, taps: null, scrolls: 0, note: 'no path: the edit form cannot change the time' });

    await job(page, rows, 'Therapist not in', async (tap) => {
      await showDay(page, day);
      await tap(activePanel(page).getByRole('button', { name: 'Verify', exact: true }));
      const verify = page.getByRole('dialog');
      await tap(verify.getByRole('button', { name: 'Therapist not in' }));
      await tap(verify.getByRole('combobox'));
      await tap(page.getByRole('option', { name: idleTherapist.name, exact: true }));
      await tap(verify.getByRole('button', { name: 'Move their treatments' }));
      await expect(verify).toContainText(`${idleTherapist.name} not in`, { timeout: 20000 });
      await verify.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
    });

    await job(page, rows, 'Room out of use', async (tap) => {
      await showDay(page, day);
      await tap(activePanel(page).getByRole('button', { name: 'Verify', exact: true }));
      const verify = page.getByRole('dialog');
      await tap(verify.getByRole('button', { name: 'Room out of use' }));
      await tap(verify.getByRole('combobox'));
      await tap(page.getByRole('option', { name: room.name, exact: true }));
      await tap(verify.getByRole('button', { name: 'Find other rooms' }));
      await expect(verify).toContainText(`${room.name} out of use`, { timeout: 20000 });
      await verify.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(verify).toContainText('Put back as it was.', { timeout: 20000 });
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
