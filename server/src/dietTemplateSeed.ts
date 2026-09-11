import type { PrismaClient } from '@prisma/client';

/**
 * A starting set of plans. Placeholders until the centre's own are loaded —
 * edit them in the Diet tab rather than here.
 *
 * Each plan carries two sides. `therapy_*` is what a patient eats on a day they
 * are treated; `rest_*` is a day without treatment. Both are needed because a
 * resident eats every day.
 */
export const starterDietTemplates = [
  {
    name: 'Standard sattvic plan',
    description: 'Baseline for most residents with no specific restriction.',
    therapy_breakfast: 'Warm mung dal porridge, soaked almonds, herbal tea',
    therapy_lunch: 'Khichdi with seasonal vegetables, ghee, cumin rice, salad',
    therapy_dinner: 'Light vegetable soup, chapati with ghee, steamed greens',
    therapy_snacks: 'Seasonal fruit, buttermilk mid-afternoon',
    rest_breakfast: 'Vegetable upma or poha, herbal tea',
    rest_lunch: 'Rice, dal, two seasonal vegetables, curd, salad',
    rest_dinner: 'Chapati, vegetable curry, warm milk before bed',
    rest_snacks: 'Seasonal fruit, roasted chana',
    medication: 'As prescribed by the physician',
    pre_therapy_notes: 'Nothing heavy within two hours of treatment',
    post_therapy_notes: 'Warm water only for one hour afterwards',
  },
  {
    name: 'Light digestive plan',
    description: 'Weak digestion, bloating, or early days of a stay.',
    therapy_breakfast: 'Thin rice gruel with ginger, herbal tea',
    therapy_lunch: 'Soft khichdi, ghee, cooked bottle gourd',
    therapy_dinner: 'Clear vegetable broth, small portion of rice',
    therapy_snacks: 'Warm water with cumin; fruit only if hungry',
    rest_breakfast: 'Soft rice gruel or steamed idli, ginger tea',
    rest_lunch: 'Khichdi, cooked vegetables, small portion of curd',
    rest_dinner: 'Vegetable soup, one chapati',
    rest_snacks: 'Buttermilk with roasted cumin',
    medication: 'Trikatu after meals if advised',
    pre_therapy_notes: 'Treatment on a light stomach',
    post_therapy_notes: 'Rest; warm water in small sips',
  },
  {
    name: 'Ghee regimen (snehapana)',
    description: 'Internal oleation days. Quantities are set by the physician daily.',
    therapy_breakfast: 'Medicated ghee on an empty stomach, warm water after',
    therapy_lunch: 'Nothing until hunger returns; then thin rice gruel',
    therapy_dinner: 'Thin rice gruel, warm water',
    therapy_snacks: 'Warm water through the day; nothing cold',
    rest_breakfast: 'Thin rice gruel, warm water',
    rest_lunch: 'Soft khichdi, ghee',
    rest_dinner: 'Rice gruel or light soup',
    rest_snacks: 'Warm water only',
    medication: 'Ghee quantity as prescribed each morning',
    pre_therapy_notes: 'Physician approval required before each dose',
    post_therapy_notes: 'Rest, warm water only; report nausea or heaviness',
  },
  {
    name: 'Post-purification plan (samsarjana krama)',
    description: 'Graded return to normal food after purification. Step set daily.',
    therapy_breakfast: 'Thin rice gruel (manda), warm',
    therapy_lunch: 'Thicker gruel (peya), then soft rice as tolerated',
    therapy_dinner: 'Rice gruel with a little ghee',
    therapy_snacks: 'Warm water only',
    rest_breakfast: 'Soft rice with ghee',
    rest_lunch: 'Rice, thin dal soup, cooked vegetable',
    rest_dinner: 'Soft rice, dal, small quantity of ghee',
    rest_snacks: 'Warm water; buttermilk if advised',
    medication: 'As prescribed',
    pre_therapy_notes: 'Confirm the current step with the physician each morning',
    post_therapy_notes: 'Do not advance the step without instruction',
  },
  {
    name: 'Diabetic-friendly plan',
    description: 'No added sugar, controlled grains, higher fibre.',
    therapy_breakfast: 'Vegetable besan chilla, herbal tea, no sugar',
    therapy_lunch: 'Millet roti, dal, two vegetables, salad',
    therapy_dinner: 'Vegetable soup, millet roti, steamed greens',
    therapy_snacks: 'Roasted chana, buttermilk; no fruit juice',
    rest_breakfast: 'Sprouted moong salad, herbal tea',
    rest_lunch: 'Millet or barley roti, dal, vegetables, curd',
    rest_dinner: 'Light vegetable curry, one millet roti',
    rest_snacks: 'A handful of nuts; one low-sugar fruit',
    medication: 'Continue prescribed medication; report readings daily',
    pre_therapy_notes: 'Check blood sugar before treatment',
    post_therapy_notes: 'Take something light if readings run low',
  },
  {
    name: 'Weight reduction plan',
    description: 'Lighter portions, no dairy fat, early dinner.',
    therapy_breakfast: 'Vegetable soup or sprouts, herbal tea with honey',
    therapy_lunch: 'Barley or millet roti, dal, generous vegetables, salad',
    therapy_dinner: 'Clear soup and steamed vegetables, before 19:00',
    therapy_snacks: 'Warm water with honey and lemon; no fried food',
    rest_breakfast: 'Sprouts or fruit, herbal tea',
    rest_lunch: 'Millet roti, dal, two vegetables, salad',
    rest_dinner: 'Vegetable soup, steamed greens, before 19:00',
    rest_snacks: 'Buttermilk; warm water through the day',
    medication: 'As prescribed',
    pre_therapy_notes: 'Treatment is better on an empty stomach',
    post_therapy_notes: 'Walk gently once rested',
  },
];

/**
 * Upserted by name, so re-seeding never overwrites a plan the centre has since
 * changed — the whole point of moving these out of code was that edits survive.
 */
export async function ensureStarterDietTemplates(prisma: PrismaClient) {
  for (const tpl of starterDietTemplates) {
    await prisma.dietTemplate.upsert({ where: { name: tpl.name }, update: {}, create: tpl });
  }
  return starterDietTemplates.length;
}
