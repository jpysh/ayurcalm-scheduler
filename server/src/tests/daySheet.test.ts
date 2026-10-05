/**
 * The day sheet says everything it should, and prints no empty boxes.
 *
 * The sheet has failed silently before: PDFKit moves text that runs past the
 * bottom of a page onto the next one and leaves the box it belonged in behind,
 * empty. That shipped for a whole release. So this reads the finished PDF, the
 * way the notice board does:
 *
 *   - every resident, and under each of them every treatment's time and
 *     therapist (both of them, for a treatment worked by a pair), in the order the sheet groups them (a diet plan, then residents
 *     with no plan, then outpatients; alphabetical inside a group)
 *   - on every page, every box drawn between two lines has ink in it
 *   - the PDF carries both weights, bold and regular, read from its own fonts
 *
 * It builds its own centre on a day in 2030, big enough to run to several pages
 * with treatments into the evening, and deletes it afterwards. Needs poppler's
 * pdftotext, pdftoppm and pdffonts, which the app image carries.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generateDailySchedulePdf } from '../pdf/dailySchedulePdf.js';
import { generateTherapistRotaPdf } from '../pdf/therapistRotaPdf.js';
import { requireDemoData } from './demoGuard.js';

const TAG = 'Sheettest';
const DAY = '2030-01-16';
const PEOPLE_PER_PAGE = 8;
const allDay = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, { start: '09:00', end: '20:00' }]),
);

async function tidy(prisma: PrismaClient) {
  const patients = await prisma.patient.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const ids = patients.map((p) => p.id);
  await prisma.appointment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patientStay.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.dietPlanSegment.deleteMany({ where: { patient_id: { in: ids } } });
  await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  await prisma.staff.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapyRoom.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.therapy.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.dietTemplate.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.programEvent.deleteMany({ where: { activity_name: { startsWith: TAG } } });
}

/** Dark pixels in each box between two ruled lines, for one greyscale page. */
function boxesWithoutInk(pgm: Buffer) {
  const header = pgm.toString('latin1', 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
  assert.ok(header, 'pdftoppm did not produce a greyscale image');
  const [, W, H] = header.map(Number);
  const px = pgm.subarray(header[0].length);
  const dark = (x: number, y: number) => px[y * W + x] < 160;
  // A ruled line is a row of pixels dark across most of the table.
  const isRule = (y: number) => { let n = 0; for (let x = 0; x < W; x++) if (dark(x, y)) n++; return n > W * 0.6; };
  const rules: number[] = [];
  for (let y = 0; y < H; y++) if (isRule(y) && !isRule(y - 1)) rules.push(y);
  const empty: number[] = [];
  for (let r = 1; r < rules.length; r++) {
    const top = rules[r - 1] + 2;
    const bottom = rules[r] - 2;
    if (bottom - top < 4) continue;
    let ink = 0;
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let y = top; y <= bottom; y++) if (dark(x, y)) n++;
      // A column dark the whole way down is a box's side, not writing.
      if (n < (bottom - top + 1) * 0.9) ink += n;
    }
    if (ink < 5) empty.push(r);
  }
  return { rules: rules.length, empty };
}

async function main() {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'daysheet-'));
  try {
    await prisma.$connect();
    await requireDemoData(prisma);
    await tidy(prisma);

    const day = new Date(`${DAY}T00:00:00.000Z`);
    const therapy = await prisma.therapy.create({ data: { name: `${TAG} Abhyanga`, required_amenities: [], duration_minutes: 60 } });
    const room = await prisma.therapyRoom.create({ data: { name: `${TAG} Room`, amenities: [], weekly_schedule: allDay } });
    const therapists = [];
    for (const name of ['Asha', 'Meera', 'Ravi']) {
      therapists.push(await prisma.staff.create({ data: { name: `${TAG} ${name}`, gender: 'female', specializations: [therapy.id], weekly_schedule: allDay } }));
    }
    const plan = await prisma.dietTemplate.create({
      data: { name: `${TAG} Plan`, therapy_breakfast: 'Rice gruel', therapy_lunch: 'Khichdi', therapy_dinner: 'Soup' },
    });

    // Three groups: residents on a plan, residents with none, outpatients.
    // Two-letter suffixes keep every name unique and in a known order.
    const times = ['09:00', '10:30', '13:15', '16:45', '19:00'];
    const suffix = (i: number) => String.fromCharCode(65 + Math.floor(i / 26), 97 + (i % 26));
    type Expected = { name: string; group: string; appts: { time: string; therapist: string }[] };
    const expected: Expected[] = [];
    for (let i = 0; i < 40; i++) {
      const group = i < 24 ? 'plan' : i < 34 ? 'none' : 'outpatient';
      const patient = await prisma.patient.create({ data: { name: `${TAG} ${suffix(i)}`, gender: 'female' } });
      if (group !== 'outpatient') {
        await prisma.patientStay.create({ data: { patient_id: patient.id, start_date: day, end_date: day, duration_days: 1 } });
      }
      if (group === 'plan') {
        await prisma.dietPlanSegment.create({ data: { patient_id: patient.id, start_date: day, end_date: day, template_id: plan.id } });
      }
      const appts = [];
      // Residents on the no-plan list have a rest day: meals only, no treatment.
      for (const k of group === 'none' && i % 2 ? [] : [i % 5, (i + 2) % 5]) {
        const therapist = therapists[(i + k) % 3];
        // Every fifth resident's first treatment is worked by two.
        const partner = i % 5 === 0 && k === i % 5 ? therapists[(i + k + 1) % 3] : null;
        await prisma.appointment.create({
          data: {
            patient_id: patient.id, therapy_id: therapy.id, staff_id: therapist.id, co_staff_ids: partner ? [partner.id] : [], room_id: room.id,
            scheduled_date: day, start_time: times[k], duration_minutes: 60,
            session_number: 1, total_sessions: 1, status: 'pending', assignment_type: 'manual',
          },
        });
        appts.push({ time: times[k], therapist: partner ? `${therapist.name} & ${partner.name}` : therapist.name });
      }
      expected.push({ name: patient.name, group, appts: appts.sort((a, b) => a.time.localeCompare(b.time)) });
    }

    // A cancelled treatment is not on either sheet: a therapist would go to it (#161).
    const cancelled = await prisma.therapy.create({ data: { name: `${TAG} Nasyacancel`, required_amenities: [], duration_minutes: 30 } });
    const firstResident = await prisma.patient.findFirstOrThrow({ where: { name: expected[0].name } });
    await prisma.appointment.create({
      data: {
        patient_id: firstResident.id, therapy_id: cancelled.id, staff_id: therapists[0].id, room_id: room.id,
        scheduled_date: day, start_time: '12:00', duration_minutes: 30,
        session_number: 1, total_sessions: 1, status: 'cancelled', assignment_type: 'manual',
      },
    });
    // A resident who didn't come prints, marked, on both (#94).
    const noShow = await prisma.therapy.create({ data: { name: `${TAG} Shirodhara`, required_amenities: [], duration_minutes: 30 } });
    await prisma.appointment.create({
      data: {
        patient_id: firstResident.id, therapy_id: noShow.id, staff_id: therapists[1].id, room_id: room.id,
        scheduled_date: day, start_time: '18:00', duration_minutes: 30,
        session_number: 1, total_sessions: 1, status: 'no_show', assignment_type: 'manual',
      },
    });
    const rotaPath = join(dir, 'rota.pdf');
    writeFileSync(rotaPath, await generateTherapistRotaPdf(DAY, prisma));
    const rotaText = execFileSync('pdftotext', ['-raw', rotaPath, '-']).toString().replace(/\s+/g, ' ');
    assert.ok(!rotaText.includes('Nasyacancel'), 'A cancelled treatment printed on the therapist sheet');
    assert.match(rotaText, /DIDN'T COME · Sheettest Shirodhara/, "A no-show is not marked on the therapist sheet");

    // Two events that start together print by end time, then name, never in the
    // order the database returns them: a move between installs reorders rows and
    // the notice board must not change (#231). Longer one is stored, and named, first.
    for (const [activity_name, end_time] of [[`${TAG} A long`, '09:30'], [`${TAG} B short`, '09:00']]) {
      await prisma.programEvent.create({ data: { date: day, start_time: '08:30', end_time, activity_name, required_amenities: [], weekdays: [], patient_ids: [], staff_ids: [] } });
    }

    const pdfPath = join(dir, 'sheet.pdf');
    writeFileSync(pdfPath, await generateDailySchedulePdf(DAY, prisma));

    // Text in the order it is drawn, so a treatment wrapped onto two lines of
    // its cell still reads as one run of words.
    const text = execFileSync('pdftotext', ['-raw', pdfPath, '-']).toString().replace(/\s+/g, ' ');

    assert.ok(!text.includes('Nasyacancel'), 'A cancelled treatment printed on the day sheet');
    assert.ok(text.indexOf(`${TAG} B short 08:30`) < text.indexOf(`${TAG} A long 08:30`), 'Events starting together are not in end-time order');
    assert.match(text, /18:00 DIDN'T COME · Sheettest Shirodhara/, 'A no-show is not marked on the day sheet');
    // The events line is everything before the table's first heading.
    assert.doesNotMatch(text.split(' Patient ')[0], /\d+m\b/, 'An event for everyone still prints as a length, not its window');

    const pages = Number(execFileSync('pdfinfo', [pdfPath]).toString().match(/Pages:\s+(\d+)/)![1]);
    assert.ok(pages >= 2, `Expected the test centre to need more than one page, got ${pages}`);
    // The sheet went from seven pages to three by grouping on plan (#59); a
    // layout fault that makes it grow again, or print a blank page, shows here
    // as fewer people per page. Moved from the e2e test, which read today's
    // demo day and so changed its answer with the date (#159).
    assert.ok(expected.length / pages >= PEOPLE_PER_PAGE, `${expected.length} people took ${pages} pages`);

    // Everyone, in group order, each with every treatment between their name
    // and the next person's.
    let at = 0;
    const positions = expected.map((p) => {
      const i = text.indexOf(`${p.name} `, at);
      assert.ok(i >= 0, `${p.name} is missing from the sheet, or out of order`);
      at = i + p.name.length;
      return i;
    });
    let pairs = 0;
    expected.forEach((p, n) => {
      const own = text.slice(positions[n], positions[n + 1] ?? text.length);
      for (const a of p.appts) {
        assert.ok(own.includes(`${a.time} ${TAG} Abhyanga 60m`), `${p.name}'s ${a.time} treatment is missing`);
        assert.ok(own.includes(a.therapist), `${p.name}'s ${a.time} treatment does not name ${a.therapist}`);
        pairs += a.therapist.includes(' & ') ? 1 : 0;
      }
    });
    assert.ok(pairs >= 5, `Expected pair treatments on the sheet, found ${pairs}`);
    const heading = (s: string) => text.indexOf(s);
    assert.ok(heading(`${TAG} Plan`) < heading('No diet plan') && heading('No diet plan') < heading('Outpatients'),
      'Groups are not in the order plan, no plan, outpatients');
    assert.ok(heading('No diet plan') < positions[24] && positions[23] < heading('No diet plan'), 'The no-plan heading is not above its residents');
    assert.ok(text.includes(`Page ${pages} of ${pages}`), 'The last page is not numbered');

    // Every box has something written in it, on every page.
    execFileSync('pdftoppm', ['-r', '72', '-gray', pdfPath, join(dir, 'page')]);
    const images = readdirSync(dir).filter((f) => f.startsWith('page')).sort();
    assert.equal(images.length, pages);
    images.forEach((f, n) => {
      const { rules, empty } = boxesWithoutInk(readFileSync(join(dir, f)));
      assert.ok(rules >= 3, `Page ${n + 1} has no table on it: rows have spilled over the page break and left their boxes behind`);
      assert.deepEqual(empty, [], `Page ${n + 1} has ${empty.length} empty box(es)`);
    });

    // Names and treatments are bold, food is not; both weights must be in it.
    const fonts = execFileSync('pdffonts', [pdfPath]).toString();
    assert.match(fonts, /Helvetica-Bold/, 'The sheet uses no bold type');
    assert.match(fonts, /^Helvetica\s/m, 'The sheet uses no regular type');

    console.log(`Day sheet: ${expected.length} people on ${pages} pages, all present, in order, no empty boxes.`);
  } finally {
    await tidy(prisma).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
