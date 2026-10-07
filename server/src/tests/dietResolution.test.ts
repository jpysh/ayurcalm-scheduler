import assert from 'node:assert/strict';
import { kitchenMeals, resolveDiet, type MealKey } from '../dietResolution.js';

/**
 * The day sheet tells a patient what they may eat. A wrong precedence here does
 * not throw — it prints a plausible sheet that is wrong — so these are the cases
 * worth holding still. No database and no server: this is pure resolution.
 */

const plan = {
  name: 'Standard sattvic plan',
  therapy_breakfast: 'Mung dal porridge',
  therapy_lunch: 'Khichdi',
  therapy_dinner: 'Vegetable soup',
  therapy_snacks: 'Buttermilk',
  rest_breakfast: 'Upma',
  rest_lunch: 'Rice and dal',
  rest_dinner: 'Chapati and curry',
  rest_snacks: 'Fruit',
};
// Medication and the treatment notes are the patient's own (#355).
const patient = { medication: 'Trikatu after meals', before_treatment: 'Nothing heavy beforehand', after_treatment: 'Warm water afterwards' };

const allColumns = new Set<MealKey>(['breakfast', 'lunch', 'dinner']);
const base = { overrides: null, dayMeals: {}, mealsWithColumn: allColumns };

const cases: [string, () => void][] = [
  ['a treated patient gets the therapy-day meals', () => {
    const out = resolveDiet({ ...base, template: plan, hasTherapyToday: true });
    assert.equal(out.meals.breakfast, 'Mung dal porridge');
    assert.equal(out.meals.lunch, 'Khichdi');
  }],

  ['a resident with no treatment gets the rest-day meals', () => {
    const out = resolveDiet({ ...base, template: plan, hasTherapyToday: false });
    assert.equal(out.meals.breakfast, 'Upma');
    assert.equal(out.meals.lunch, 'Rice and dal');
  }],

  ['wording changed for one patient beats the plan', () => {
    const out = resolveDiet({
      ...base,
      template: plan,
      overrides: { therapy_lunch: 'Rice gruel only' },
      hasTherapyToday: true,
    });
    assert.equal(out.meals.lunch, 'Rice gruel only');
    // and leaves the rest of the plan standing
    assert.equal(out.meals.breakfast, 'Mung dal porridge');
  }],

  ['something written for today beats both', () => {
    const out = resolveDiet({
      ...base,
      template: plan,
      overrides: { therapy_lunch: 'Rice gruel only' },
      dayMeals: { lunch: 'Clear broth' },
      hasTherapyToday: true,
    });
    assert.equal(out.meals.lunch, 'Clear broth');
  }],

  ['a meal with no column of its own is kept in the notes', () => {
    const out = resolveDiet({ ...base, template: plan, hasTherapyToday: true });
    assert.ok(out.notes.includes('Snacks: Buttermilk'), out.notes);
  }],

  ['the patient\'s own treatment notes print on a treatment day', () => {
    const treated = resolveDiet({ ...base, template: plan, hasTherapyToday: true, patient });
    assert.ok(!treated.notes.includes('Nothing heavy beforehand'), treated.notes);
    assert.ok(treated.therapyNotes.includes('Nothing heavy beforehand'), treated.therapyNotes);
    assert.ok(treated.therapyNotes.includes('Warm water afterwards'), treated.therapyNotes);
    assert.equal(treated.planName, 'Standard sattvic plan');
  }],

  ['a rest day has nothing to say about treatment', () => {
    const resting = resolveDiet({ ...base, template: plan, hasTherapyToday: false, patient });
    assert.equal(resting.therapyNotes, '');
    // medication is per patient and not tied to treatment, so it stays in the row
    assert.ok(resting.notes.includes('Trikatu after meals'), resting.notes);
  }],

  ['the notes name the plan they came from', () => {
    const out = resolveDiet({ ...base, template: plan, hasTherapyToday: true });
    assert.ok(out.notes.startsWith('Standard sattvic plan: '), out.notes);
  }],

  ['a bespoke segment carries its own meals and name', () => {
    const out = resolveDiet({
      ...base,
      template: null,
      overrides: { rest_breakfast: 'Papaya only' },
      hasTherapyToday: false,
      segmentLabel: 'Fasting day',
    });
    assert.equal(out.meals.breakfast, 'Papaya only');
    assert.equal(out.planName, 'Fasting day');
  }],

  ['a plan never brings medication or treatment notes of its own', () => {
    const out = resolveDiet({ ...base, template: { ...plan, medication: 'Old plan text', pre_therapy_notes: 'Old' }, hasTherapyToday: true });
    assert.ok(!out.notes.includes('Old plan text'), out.notes);
    assert.equal(out.therapyNotes, '');
  }],

  ['a patient with nothing set gets nothing invented', () => {
    const out = resolveDiet({ ...base, template: null, hasTherapyToday: true });
    assert.deepEqual(out.meals, {});
    assert.equal(out.notes, '');
  }],

  ['blank fields on a plan do not print as empty meals', () => {
    const sparse = { name: 'Water only', therapy_breakfast: '   ', therapy_lunch: 'Warm water' };
    const out = resolveDiet({ ...base, template: sparse, hasTherapyToday: true });
    assert.equal(out.meals.breakfast, undefined);
    assert.equal(out.meals.lunch, 'Warm water');
  }],

  // #414: the cook reads counts per plan and side, and only a meal written for
  // one patient is named; their medication never splits the count.
  ['the kitchen counts a plan per side and names only what is personal', () => {
    const treated = resolveDiet({ ...base, template: plan, hasTherapyToday: true, patient });
    const resting = resolveDiet({ ...base, template: plan, hasTherapyToday: false });
    const own = resolveDiet({ ...base, template: plan, dayMeals: { lunch: 'Clear broth' }, hasTherapyToday: true });
    const [, lunch] = kitchenMeals([
      { name: 'Asha', diet: treated }, { name: 'Ravi', diet: { ...treated, medication: '' } },
      { name: 'Meera', diet: resting }, { name: 'Dev', diet: own },
    ]);
    assert.equal(lunch.total, 4);
    assert.deepEqual(lunch.counts.map((c) => [c.n, c.food]), [[2, 'Khichdi'], [1, 'Rice and dal']]);
    assert.deepEqual(lunch.exceptions, [{ name: 'Dev', plan: 'Standard sattvic plan', food: 'Clear broth' }]);
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(`     ${err instanceof Error ? err.message.split('\n')[0] : err}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
