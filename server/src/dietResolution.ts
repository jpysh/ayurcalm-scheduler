/**
 * What one patient eats on one day, resolved from the three places it can come
 * from. Kept apart from the PDF generator because this is the part that fails
 * silently — a wrong precedence prints a plausible sheet that is simply wrong
 * about what somebody is allowed to eat.
 */

import type { PrismaClient } from '@prisma/client';
export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const mealOrder: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
// Spelled out. The day sheet goes on a notice board and is read by residents,
// not only by staff who know what 'S:' stands for.
export const mealLabel: Record<MealKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

/**
 * A plan: meals for a day with treatment, and for a day without. Read loosely
 * by field name so the stored row can be passed straight in.
 */
export type DietTemplateFields = { name?: string | null; [field: string]: unknown };

export type ResolveDietInput = {
  /** The plan the patient's segment points at, if any. */
  template: DietTemplateFields | null;
  /** Wording changed for this patient alone. Wins over the plan. */
  overrides: Record<string, string | undefined> | null;
  /** Written for this date specifically. Wins over everything, per meal. */
  dayMeals: Partial<Record<MealKey, string>>;
  hasTherapyToday: boolean;
  /** Which meals the sheet has a column for; the rest go to the notes. */
  mealsWithColumn: Set<MealKey>;
  /** Names a bespoke plan that follows no template. */
  segmentLabel?: string | null;
  /** The patient's own medication and how they eat around treatment (#355): never the plan's. */
  patient?: { medication?: string | null; before_treatment?: string | null; after_treatment?: string | null };
};

export type ResolvedDiet = {
  meals: Partial<Record<MealKey, string>>;
  /** Goes in the patient's own row: what is specific to them. */
  notes: string;
  /** The plan this came from, for the footnote. */
  planName: string;
  /** How this patient eats around treatment, on a day they have one. */
  therapyNotes: string;
};

export function resolveDiet(input: ResolveDietInput): ResolvedDiet {
  const { template, hasTherapyToday, mealsWithColumn } = input;
  const overrides = input.overrides || {};
  // A plan holds both sides: what to eat around treatment, and what to eat on a
  // rest day. A resident eats on both.
  const side = hasTherapyToday ? 'therapy' : 'rest';

  // The doctor's own wording for this patient wins; otherwise the plan's. That
  // is what lets a correction to the plan reach everyone still on it.
  const field = (name: string) =>
    (overrides[name] ?? (template?.[name] as string | null | undefined) ?? '').toString().trim();

  const meals: Partial<Record<MealKey, string>> = {};
  for (const meal of mealOrder) {
    const text = (input.dayMeals[meal] || field(`${side}_${meal}`)).trim();
    if (text) meals[meal] = text;
  }

  const noteParts: string[] = [];
  for (const meal of mealOrder) {
    // Keep a meal the day has no column for rather than dropping it.
    if (meals[meal] && !mealsWithColumn.has(meal)) noteParts.push(`${mealLabel[meal]}: ${meals[meal]}`);
  }
  const own = (v?: string | null) => (v || '').trim();
  const medication = own(input.patient?.medication);
  if (medication) noteParts.push(medication);

  const therapyNotes = hasTherapyToday
    ? [own(input.patient?.before_treatment), own(input.patient?.after_treatment)].filter(Boolean).join('; ')
    : '';

  const label = (template?.name || input.segmentLabel || '').toString();
  const notes = noteParts.join('; ');
  return {
    meals,
    notes: label && notes ? `${label}: ${notes}` : notes || (label && Object.keys(meals).length ? label : ''),
    planName: label,
    therapyNotes,
  };
}

/**
 * Everyone's diet on one day, read once. The day sheet and the AI assistant
 * both ask this, so they cannot disagree about what somebody eats.
 *
 * Three places, most specific first: a DietPlan row written for this date, the
 * template on the segment covering this date, then the free-text field on the
 * patient. Precedence is per meal, so overriding breakfast leaves the rest of
 * the plan standing.
 */
export async function loadDietsForDay(day: Date, prisma: PrismaClient) {
  const [dietDay, dietSegments] = await Promise.all([
    prisma.dietPlan.findMany({ where: { date: day } }),
    prisma.dietPlanSegment.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, include: { Template: true } }),
  ]);
  const dayMealsByPatient = new Map<string, Partial<Record<MealKey, string>>>();
  for (const d of dietDay) {
    const meals = dayMealsByPatient.get(d.patient_id) || {};
    meals[d.meal_time as MealKey] = [d.description, d.instructions].filter(Boolean).join(' — ');
    dayMealsByPatient.set(d.patient_id, meals);
  }
  const segmentByPatient = new Map<string, (typeof dietSegments)[number]>();
  for (const seg of dietSegments) {
    // A patient should not hold two overlapping segments, but if they do, the
    // one that started most recently is the one set last.
    const held = segmentByPatient.get(seg.patient_id);
    if (!held || seg.start_date > held.start_date) segmentByPatient.set(seg.patient_id, seg);
  }
  // Meals no longer take columns on the sheet, so every meal resolves as text.
  const mealsWithColumn = new Set<MealKey>();
  const dietFor = (patient: { id: string; medication?: string | null; before_treatment?: string | null; after_treatment?: string | null }, hasTherapyToday: boolean) => {
    const seg = segmentByPatient.get(patient.id);
    return resolveDiet({
      template: seg?.Template ?? null,
      overrides: (seg?.overrides || null) as Record<string, string | undefined> | null,
      dayMeals: dayMealsByPatient.get(patient.id) || {},
      hasTherapyToday,
      mealsWithColumn,
      segmentLabel: seg?.template_label,
      patient,
    });
  };
  /** True when a meal was written for this person for this date alone. */
  const hasDayMeals = (id: string) => Object.keys(dayMealsByPatient.get(id) || {}).length > 0;
  return { dietFor, hasDayMeals };
}
