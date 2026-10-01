import type { PrismaClient } from '@prisma/client';

// The starting lists. The four package prices and the four house prices are the centre's own
// figures from the design round; the other package prices are placeholders to be replaced.
const EXAMPLE = 'Example price: change it to yours';
const starterPackages: [number, number, string | null][] = [
  [3, 16_000, EXAMPLE], [5, 26_500, EXAMPLE], [7, 37_200, null], [10, 51_200, null], [12, 61_000, EXAMPLE],
  [14, 70_750, null], [21, 98_750, null], [28, 127_000, EXAMPLE], [40, 176_000, EXAMPLE], [45, 195_000, EXAMPLE],
];
const starterHouses: [string, number][] = [['Trishul House', 1600], ['Nanda House', 2500], ['Special Apartments', 4000], ['Huts', 4000]];

/** Upserted by name, so re-seeding never overwrites a price the centre has since changed. */
export async function ensureStarterCatalogues(db: PrismaClient) {
  for (const [days, price, note] of starterPackages) {
    await db.package.upsert({ where: { name: `Panchakarma ${days} days` }, update: {}, create: { name: `Panchakarma ${days} days`, days, price, notes: note } });
  }
  for (const [name, price_per_day] of starterHouses) {
    await db.accommodationType.upsert({ where: { name }, update: {}, create: { name, price_per_day } });
  }
}
