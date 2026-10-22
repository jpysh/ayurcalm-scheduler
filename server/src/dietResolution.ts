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
  /** Which day of the plan this is for the patient, Day 1 being the day it started (#1082). */
  dayNumber?: number;
  /** The patient's own medication and how they eat around treatment (#355): never the plan's. */
  patient?: { food_limits?: string | null; medication?: string | null; before_treatment?: string | null; after_treatment?: string | null };
};

export type ResolvedDiet = {
  meals: Partial<Record<MealKey, string>>;
  /** Goes in the patient's own row: what is specific to them. */
  notes: string;
  /** The plan this came from, for the footnote. */
  planName: string;
  /** How this patient eats around treatment, on a day they have one. */
  therapyNotes: string;
  /** The patient's medication alone, so the sheet can print it on their own line. */
  medication: string;
  /** What this guest must not eat (#977): bold on the day sheet, listed on the kitchen sheet. */
  foodLimits: string;
  /** Meals written for this patient (an override or for this date), not the plan's: the kitchen's exceptions. */
  personal: MealKey[];
  /** Which side of the plan this is: the kitchen names it when a plan prints twice in a meal (#832). */
  treatmentDay: boolean;
  /** The plan's day-by-day step served today, if it has steps (#1082). */
  step?: number;
};

export type DietStep = Partial<Record<MealKey, string>>;

/** A plan's day-by-day steps, read loosely from the stored JSON. */
export function stepsOf(template: DietTemplateFields | null): DietStep[] {
  return Array.isArray(template?.steps) ? (template.steps as DietStep[]) : [];
}

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

  // A step is that day's food on either side; a meal it does not mention falls back to the plan (#1082).
  const steps = stepsOf(template);
  const stepNo = input.dayNumber && input.dayNumber <= steps.length ? input.dayNumber : undefined;
  const step = stepNo ? steps[stepNo - 1] : {};
  const meals: Partial<Record<MealKey, string>> = {};
  const personal: MealKey[] = [];
  for (const meal of mealOrder) {
    const mine = overrides[`${side}_${meal}`];
    const text = (input.dayMeals[meal] || mine || step[meal]?.trim() || field(`${side}_${meal}`)).trim();
    if (text) meals[meal] = text;
    if (text && (input.dayMeals[meal] || overrides[`${side}_${meal}`])) personal.push(meal);
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
    medication,
    foodLimits: own(input.patient?.food_limits),
    personal,
    treatmentDay: input.hasTherapyToday,
    step: stepNo,
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
/** A guest whose plan's steps are done, or whose plans have all ended while they stay, eats the everyday plan (#1082). */
export function movesToGeneralPlan(p: { holdsPlan: boolean; dayNumber: number; steps: number; hadPlan: boolean; staying: boolean }) {
  return p.holdsPlan ? p.steps > 0 && p.dayNumber > p.steps : p.hadPlan && p.staying;
}

export const GENERAL_PLAN = 'General sattvic plan';

export async function loadDietsForDay(day: Date, prisma: PrismaClient) {
  const [dietDay, dietSegments, endedBefore, staying, sattvic] = await Promise.all([
    prisma.dietPlan.findMany({ where: { date: day } }),
    prisma.dietPlanSegment.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, include: { Template: true } }),
    prisma.dietPlanSegment.findMany({ where: { end_date: { lt: day } }, select: { patient_id: true }, distinct: ['patient_id'] }),
    prisma.patientStay.findMany({ where: { start_date: { lte: day }, end_date: { gte: day } }, select: { patient_id: true } }),
    // ponytail: found by its starter name; a centre that renames it loses the fallback.
    prisma.dietTemplate.findUnique({ where: { name: GENERAL_PLAN } }),
  ]);
  const hadPlan = new Set(endedBefore.map((s) => s.patient_id));
  const isStaying = new Set(staying.map((s) => s.patient_id));
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
  const dietFor = (patient: { id: string; food_limits?: string | null; medication?: string | null; before_treatment?: string | null; after_treatment?: string | null }, hasTherapyToday: boolean) => {
    const held = segmentByPatient.get(patient.id);
    const dayNumber = held ? Math.round((day.getTime() - held.start_date.getTime()) / 86_400_000) + 1 : 0;
    const steps = stepsOf(held?.Template ?? null).length;
    const finished = movesToGeneralPlan({ holdsPlan: !!held, dayNumber, steps, hadPlan: hadPlan.has(patient.id), staying: isStaying.has(patient.id) });
    const seg = finished ? undefined : held;
    return resolveDiet({
      template: finished ? sattvic : (seg?.Template ?? null),
      dayNumber: finished ? 0 : dayNumber,
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

export type KitchenMeal = {
  meal: MealKey;
  /** One line per plan and what it serves at this meal, biggest first. */
  counts: { plan: string; food: string; n: number }[];
  /** Someone eating something of their own at this meal, by name. */
  exceptions: { name: string; plan: string; food: string }[];
  total: number;
};

/**
 * What the kitchen cooks, meal by meal (#414): a count per plan, then whoever
 * eats something of their own, by name. A plan serves different food on a
 * treatment day and a rest day, so each side is its own count line.
 */
export function kitchenMeals(people: { name: string; diet: ResolvedDiet }[]): KitchenMeal[] {
  return mealOrder.map((meal) => {
    const counts = new Map<string, { plan: string; food: string; n: number; treatmentDay: boolean }>();
    const exceptions: KitchenMeal['exceptions'] = [];
    for (const { name, diet } of people) {
      const plan = (diet.planName || 'No diet plan') + (diet.step ? ` · Day ${diet.step}` : '');
      const food = diet.meals[meal] || '';
      if (diet.personal.includes(meal)) { exceptions.push({ name, plan, food }); continue; }
      const key = `${plan}\u0000${food}`;
      const held = counts.get(key);
      if (held) held.n++; else counts.set(key, { plan, food, n: 1, treatmentDay: diet.treatmentDay });
    }
    // A plan on both sides at one meal reads as a mistake to the cook unless each line says its side (#832).
    const lines = [...counts.values()];
    const split = (plan: string) => lines.filter((o) => o.plan === plan).length > 1;
    return {
      meal,
      counts: lines.map(({ plan, food, n, treatmentDay }) => ({ plan: split(plan) ? `${plan} · ${treatmentDay ? 'treatment' : 'rest'} day` : plan, food, n })).sort((a, b) => b.n - a.n || a.plan.localeCompare(b.plan)),
      exceptions: exceptions.sort((a, b) => a.name.localeCompare(b.name)),
      total: people.length,
    };
  });
}
