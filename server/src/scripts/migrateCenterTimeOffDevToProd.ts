import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const devUrl = process.env.DEV_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/ayurcalm_dev?schema=public'
const prodUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/ayurcalm?schema=public'

const dev = new PrismaClient({ datasources: { db: { url: devUrl } } })
const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } })

const key = (h: any) => JSON.stringify({
  entity_type: h.entity_type,
  entity_id: h.entity_id ?? 'All',
  date: h.date ? new Date(h.date).toISOString() : '',
  start_date: h.start_date ? new Date(h.start_date).toISOString() : '',
  end_date: h.end_date ? new Date(h.end_date).toISOString() : '',
  start_time: h.start_time ?? '',
  end_time: h.end_time ?? '',
  recurrence: h.recurrence ?? '',
  weekdays: Array.isArray(h.weekdays) ? [...h.weekdays].sort() : []
})

async function main() {
  const src = await dev.timeOff.findMany({ where: { entity_type: 'center' } })
  const dst = await prod.timeOff.findMany({ where: { entity_type: 'center' } })
  const existing = new Set(dst.map(key))
  let created = 0
  for (const h of src) {
    const k = key(h)
    if (existing.has(k)) continue
    await prod.timeOff.create({ data: {
      entity_type: 'center',
      entity_id: null,
      date: h.date ? new Date(h.date) : null,
      start_date: h.start_date ? new Date(h.start_date) : null,
      end_date: h.end_date ? new Date(h.end_date) : null,
      start_time: h.start_time ?? null,
      end_time: h.end_time ?? null,
      recurrence: h.recurrence ?? null,
      weekdays: h.weekdays ?? [],
      description: h.description ?? null,
    } })
    created++
  }
  console.log(JSON.stringify({ source_count: src.length, dest_count_before: dst.length, created }))
}

main().finally(async () => {
  await dev.$disconnect()
  await prod.$disconnect()
})

