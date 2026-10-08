import type { PrismaClient } from '@prisma/client';

// The starting lists. Some figures are the maintainer's own centre's, from the design round, and every
// centre starts with them: all are marked as examples so a new centre sees at a glance what to replace (#516).
const EXAMPLE = 'Example price: change it to yours';
const starterPackages: [number, number, string][] = [
  [3, 16_000, EXAMPLE], [5, 26_500, EXAMPLE], [7, 37_200, EXAMPLE], [10, 51_200, EXAMPLE], [12, 61_000, EXAMPLE],
  [14, 70_750, EXAMPLE], [21, 98_750, EXAMPLE], [28, 127_000, EXAMPLE], [40, 176_000, EXAMPLE], [45, 195_000, EXAMPLE],
];
const starterHouses: [string, number][] = [['Trishul House', 1600], ['Nanda House', 2500], ['Special Apartments', 4000], ['Huts', 4000]];

/** Upserted by name, so re-seeding never overwrites a price the centre has since changed. */
export async function ensureStarterCatalogues(db: PrismaClient) {
  for (const [days, price, note] of starterPackages) {
    await db.package.upsert({ where: { name: `Panchakarma ${days} days` }, update: {}, create: { name: `Panchakarma ${days} days`, days, price, notes: note } });
  }
  for (const [name, price_per_day] of starterHouses) {
    await db.accommodationType.upsert({ where: { name }, update: {}, create: { name, price_per_day, notes: EXAMPLE } });
  }
}
