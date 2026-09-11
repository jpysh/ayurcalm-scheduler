/**
 * What one patient eats on one day, resolved from the three places it can come
 * from. Kept apart from the PDF generator because this is the part that fails
 * silently — a wrong precedence prints a plausible sheet that is simply wrong
 * about what somebody is allowed to eat.
 */

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const mealOrder: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const mealLabel: Record<MealKey, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D',
  snacks: 'S',
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
  /** The free-text field on the patient, used only when nothing else applies. */
  freeText?: string | null;
  /** Names a bespoke plan that follows no template. */
  segmentLabel?: string | null;
};

export type ResolvedDiet = {
  meals: Partial<Record<MealKey, string>>;
  /** Goes in the patient's own row: what is specific to them. */
  notes: string;
  /** The plan this came from, for the footnote. */
  planName: string;
  /**
   * How to eat around treatment. The same sentences for everyone on a plan, so
   * they print once under the table instead of once per patient — which is the
   * difference between a sheet of one page and a sheet of three.
   */
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
  // Medication is per patient, so it stays in the row.
  const medication = field('medication');
  if (medication) noteParts.push(medication);

  const therapyNotes = hasTherapyToday
    ? [field('pre_therapy_notes'), field('post_therapy_notes')].filter(Boolean).join('; ')
    : '';

  const free = (input.freeText || '').trim();
  if (free && Object.keys(meals).length === 0) noteParts.unshift(free);

  const label = (template?.name || input.segmentLabel || '').toString();
  const notes = noteParts.join('; ');
  return {
    meals,
    notes: label && notes ? `${label}: ${notes}` : notes || (label && Object.keys(meals).length ? label : ''),
    planName: label,
    therapyNotes,
  };
}
