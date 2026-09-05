import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ALL_AMENITIES = [
  'massage_table',
  'shower',
  'steam',
  'herbal_oil',
  'shirodhara_stand',
  'dhara_stand',
  'rice_boluses',
  'herbal_paste',
]

function pickDistinct<T>(arr: T[], count: number): T[] {
  const pool = [...arr]
  const chosen: T[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    chosen.push(pool[idx])
    pool.splice(idx, 1)
  }
  return chosen
}

async function main() {
  const rooms = await prisma.therapyRoom.findMany({ orderBy: { id: 'asc' } })
  let updated = 0
  const preview: { id: string; oldName: string; newName: string; newAmenities: string[] }[] = []
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]
    const newName = `Rm${i + 1}`
    const newAmenities = pickDistinct(ALL_AMENITIES, 4)
    await prisma.therapyRoom.update({
      where: { id: r.id },
      data: { name: newName, amenities: newAmenities },
    })
    updated++
    if (preview.length < 8) preview.push({ id: r.id, oldName: r.name, newName, newAmenities })
  }
  const totalRooms = rooms.length
  console.log(JSON.stringify({ totalRooms, updated, preview }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

