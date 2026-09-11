/**
 * A diet plan is stored twice over: what a patient eats on a day they are
 * treated, and what they eat on a rest day. A rest-day meal left blank falls
 * back to the treatment-day one, so a plan that does not vary is filled in once.
 */
export type ServerDietTemplate = {
  id: string;
  name: string;
  description?: string | null;
  therapy_breakfast: string;
  therapy_lunch: string;
  therapy_dinner: string;
  therapy_snacks: string;
  rest_breakfast: string;
  rest_lunch: string;
  rest_dinner: string;
  rest_snacks: string;
  medication?: string | null;
  pre_therapy_notes?: string | null;
  post_therapy_notes?: string | null;
  is_active: boolean;
  /** How many patients are on this plan right now. */
  patients?: number;
};

export type UiDietTemplate = {
  id: string;
  name: string;
  description?: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks: string;
  restBreakfast?: string;
  restLunch?: string;
  restDinner?: string;
  restSnacks?: string;
  preTherapyNotes?: string;
  postTherapyNotes?: string;
  medication?: string;
  therapyIds: string[];
  applicability: 'daily' | 'therapyDays';
  patients?: number;
};

export const fromServerTemplate = (t: ServerDietTemplate): UiDietTemplate => ({
  id: t.id,
  name: t.name,
  description: t.description || '',
  breakfast: t.therapy_breakfast,
  lunch: t.therapy_lunch,
  dinner: t.therapy_dinner,
  snacks: t.therapy_snacks,
  restBreakfast: t.rest_breakfast,
  restLunch: t.rest_lunch,
  restDinner: t.rest_dinner,
  restSnacks: t.rest_snacks,
  preTherapyNotes: t.pre_therapy_notes || '',
  postTherapyNotes: t.post_therapy_notes || '',
  medication: t.medication || '',
  therapyIds: [],
  applicability: 'daily' as const,
  patients: t.patients ?? 0,
});

/**
 * Both sides of a plan, as the server stores them. A rest-day meal left blank
 * repeats the treatment-day one: a plan that does not vary is filled in once,
 * and nobody ends up with a blank Sunday.
 */
const bothSides = (t: Partial<UiDietTemplate>) => ({
  therapy_breakfast: t.breakfast || '',
  therapy_lunch: t.lunch || '',
  therapy_dinner: t.dinner || '',
  therapy_snacks: t.snacks || '',
  rest_breakfast: t.restBreakfast || t.breakfast || '',
  rest_lunch: t.restLunch || t.lunch || '',
  rest_dinner: t.restDinner || t.dinner || '',
  rest_snacks: t.restSnacks || t.snacks || '',
  medication: t.medication || '',
  pre_therapy_notes: t.preTherapyNotes || '',
  post_therapy_notes: t.postTherapyNotes || '',
});

/** Fields a bespoke plan carries in place of a template. */
export const toOverrides = (t: Partial<UiDietTemplate>) => bothSides(t);

const toTemplateBody = (t: Partial<UiDietTemplate>) => ({
  name: (t.name || '').trim(),
  description: t.description || '',
  ...bothSides(t),
});

/**
 * Save a plan and return it with the id the server gave it. A plan kept only in
 * component state cannot be assigned — the id it invents is not one the server
 * knows — and does not survive a refresh.
 */
export async function saveTemplate(
  apiBase: string,
  draft: Partial<UiDietTemplate>,
  existingId?: string,
): Promise<UiDietTemplate> {
  const isStored = !!existingId && !existingId.startsWith('tpl-');
  const res = await fetch(`${apiBase}/diet-templates${isStored ? `/${existingId}` : ''}`, {
    method: isStored ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toTemplateBody(draft)),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || (res.status === 403 ? 'Only an administrator can change plans' : 'Could not save the plan'));
  }
  return fromServerTemplate(await res.json());
}

export async function loadTemplates(apiBase: string): Promise<UiDietTemplate[]> {
  const res = await fetch(`${apiBase}/diet-templates`);
  if (!res.ok) return [];
  const rows: ServerDietTemplate[] = await res.json();
  return rows.filter((t) => t.is_active).map(fromServerTemplate);
}
