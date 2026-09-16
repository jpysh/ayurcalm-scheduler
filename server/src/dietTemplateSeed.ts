import type { PrismaClient } from '@prisma/client';

/**
 * Five plans to start from, so a fresh install has something to assign on day
 * one. They are written from the classical regimens a residential Ayurveda
 * centre actually runs, but they are a starting point, not a prescription — a
 * centre's own plans differ, and the physician edits these in the Diet tab.
 *
 * Quantities, and the step a patient is on, are deliberately not fixed here:
 * they are set per patient per day, which is what the per-day override on the
 * day sheet is for.
 *
 * Written from, not copied from:
 *   - Samsarjana krama, the graduated return to normal food after purification:
 *     https://www.easyayurveda.com/samsarjana-krama/
 *     https://jaims.in/jaims/article/download/5768/10599?inline=1
 *   - Snehapana, internal oleation:
 *     https://ayurvaid.com/treatments/snehapana/
 *     https://www.fitsri.com/articles/snehapana-internal-oleation-benefits-procedure
 *   - Sattvic diet and mitahara, moderate eating:
 *     https://en.wikipedia.org/wiki/Sattvic_diet
 *     https://en.wikipedia.org/wiki/Mitahara
 *   - Deepana and pachana, the preparatory phase before purification:
 *     https://irjay.com/index.php/irjay/article/view/883
 *     https://arogyaayu.com/ayurveda/panchkarma/purvakarma/dipana-pachana-karma/
 *   - Sthaulya (medoroga), and the langhana/rukshana regimen for it:
 *     https://jaims.in/jaims/article/download/3934/5899?inline=1
 *     https://www.ovid.com/jnls/joay/fulltext/10.4103/joa.joa_71_20~wholesome-ayurvedic-diet-and-lifestyle-for-sthaulya-obesity
 *
 * The five cover the arc a residential centre actually runs: an everyday plan,
 * the three phases of a purification (before, during, after), and the commonest
 * standalone programme. A centre that runs something else adds its own.
 *
 * Each plan carries two sides. `therapy_*` is what a patient eats on a day they
 * are treated; `rest_*` is a day without treatment. Both are needed because a
 * resident eats every day.
 */
export const starterDietTemplates = [
  {
    name: 'General sattvic plan',
    description:
      'Everyday plan for a resident with no specific restriction. Freshly cooked, warm, moderate portions, the largest meal at midday.',
    therapy_breakfast: 'Mung dal porridge or vegetable upma; soaked almonds; ginger tea',
    therapy_lunch: 'Khichdi with seasonal vegetables and ghee; small salad',
    therapy_dinner: 'Light vegetable soup; one chapati with ghee; steamed greens',
    therapy_snacks: 'Seasonal fruit; buttermilk with roasted cumin',
    rest_breakfast: 'Vegetable upma or poha; soaked almonds; herbal tea',
    rest_lunch: 'Rice, dal, two seasonal vegetables, curd, salad',
    rest_dinner: 'Chapati with a light vegetable curry',
    rest_snacks: 'Seasonal fruit; roasted chana',
    medication: 'As prescribed. Midday is the main meal; nothing cold or fizzy',
    pre_therapy_notes: 'Nothing heavy within two hours of treatment',
    post_therapy_notes: 'Rest; warm water for the first hour; eat once hunger returns',
  },
  {
    name: 'Internal oleation (snehapana)',
    description:
      'Days on medicated ghee. The dose is set by the physician each morning and is deliberately not fixed here; what is fixed is that nothing follows it until the patient is genuinely hungry.',
    therapy_breakfast: 'Medicated ghee before sunrise, on an empty stomach; warm water after',
    therapy_lunch: 'Nothing until true hunger; then thin rice gruel',
    therapy_dinner: 'Thin rice gruel or clear soup, early',
    therapy_snacks: 'Warm water only',
    rest_breakfast: 'Thin rice gruel, warm',
    rest_lunch: 'Soft khichdi with a little ghee; cooked bottle gourd',
    rest_dinner: 'Rice gruel or light vegetable soup',
    rest_snacks: 'Warm water only',
    medication: 'Ghee dose set each morning; last meal ten hours before',
    pre_therapy_notes: 'Confirm the dose with the physician; the previous evening meal light and early',
    post_therapy_notes: 'Warm water only while the taste of ghee remains; report nausea or heaviness the same day',
  },
  {
    name: 'After purification (samsarjana krama)',
    description:
      'The graduated return to normal food after vamana or virechana. The step a patient is on is set by the physician each day and depends on how the purification went — this plan describes the ladder, not the rung.',
    therapy_breakfast: 'Thin rice gruel (peya), small quantity',
    therapy_lunch: 'Thicker gruel (vilepi) as digestion returns',
    therapy_dinner: 'Thin rice gruel, warm',
    therapy_snacks: 'Warm water only',
    rest_breakfast: 'Vilepi, or soft rice with a little ghee at later steps',
    rest_lunch: 'Mung soup without fat (akrita yusha), then with ghee and mild spices (krita yusha)',
    rest_dinner: 'Soft rice with mung soup',
    rest_snacks: 'Warm water; buttermilk at later steps if advised',
    medication: 'As prescribed. Appetite, stool and energy reported daily',
    pre_therapy_notes: 'Confirm the current step with the physician before the first meal',
    post_therapy_notes: 'Do not advance a step without instruction; step back if there is heaviness or no appetite',
  },
  {
    name: 'Before purification (deepana–pachana)',
    description:
      'The preparatory days that kindle digestion and clear ama before oleation begins. Food is deliberately lighter than the patient wants; the point is to arrive at genuine hunger, which is the sign the physician is waiting for.',
    therapy_breakfast: 'Warm water with ginger; thin gruel only if hungry',
    therapy_lunch: 'Mung soup with ginger, pepper and long pepper; soft rice, small quantity',
    therapy_dinner: 'Clear vegetable soup, early and light',
    therapy_snacks: 'Warm water; nothing between meals',
    rest_breakfast: 'Warm water with ginger; thin gruel only if hungry',
    rest_lunch: 'Soft rice with mung soup and digestive spices; cooked bitter gourd or drumstick',
    rest_dinner: 'Thin gruel or clear soup, early',
    rest_snacks: 'Warm water; buttermilk with roasted cumin at midday if advised',
    medication: 'Digestive preparations before meals as prescribed. Nothing cold, no curd, no fried food',
    pre_therapy_notes: 'Eat only when hungry, never by the clock; skip a meal rather than eat without appetite',
    post_therapy_notes: 'Report appetite, stool and coating on the tongue daily — these decide when oleation starts',
  },
  {
    name: 'Weight and metabolism (sthaulya)',
    description:
      'For a resident on a weight or metabolic programme. Drier and lighter than the general plan, with the largest meal at midday and nothing after dark. Written as a regimen, not a calorie count; portions are set per patient.',
    therapy_breakfast: 'Warm water with honey if advised; roasted barley or millet porridge, no sugar',
    therapy_lunch: 'Barley or millet roti; mung dal; two cooked vegetables with little oil; small salad',
    therapy_dinner: 'Clear vegetable soup with pepper; no rice, no wheat after dark',
    therapy_snacks: 'Buttermilk with roasted cumin; warm water. No fruit juice, no milk sweets',
    rest_breakfast: 'Roasted barley or millet porridge; a few soaked almonds',
    rest_lunch: 'Barley or millet roti; horse gram or mung soup; two cooked vegetables; salad',
    rest_dinner: 'Vegetable soup or steamed greens, early',
    rest_snacks: 'Buttermilk; warm water',
    medication: 'As prescribed. No day sleep; walk after meals',
    pre_therapy_notes: 'Udvartana and similar dry treatments are given on an empty stomach — nothing for two hours before',
    post_therapy_notes: 'Warm water, not cold; do not lie down straight after the treatment',
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
