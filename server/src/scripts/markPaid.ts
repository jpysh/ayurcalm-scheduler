/**
 * Manual billing (#250), until Razorpay: record what a centre paid for.
 *
 *   sh hosting/centre.sh paid <slug> founding 2026-11-30
 *   docker compose exec app npx tsx server/src/scripts/markPaid.ts founding 2026-11-30
 *
 * Plans: cloud, onprem, founding. "none" clears the plan (back to trial rules).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const PLANS = ['cloud', 'onprem', 'founding'];
const [plan, until] = process.argv.slice(2);
if (!(plan === 'none' || (PLANS.includes(plan) && /^\d{4}-\d{2}-\d{2}$/.test(until ?? '')))) {
  console.error(`Usage: markPaid.ts <${PLANS.join('|')}> <YYYY-MM-DD paid until>   or   markPaid.ts none`);
  process.exit(1);
}
const prisma = new PrismaClient();
const data = plan === 'none' ? { plan: null, paid_until: null } : { plan, paid_until: new Date(`${until}T23:59:59Z`) };
const s = await prisma.settings.update({ where: { id: 'singleton' }, data });
console.log(`${s.centre_name}: ${s.plan ?? 'no plan'}${s.paid_until ? `, paid until ${until}` : ''}`);
await prisma.$disconnect();
