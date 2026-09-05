import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const staff = await prisma.staff.findMany()
  let updated = 0
  for (const s of staff) {
    const next = s.name.replace(/^Dr\.\s*/, '').trim()
    if (next !== s.name) {
      await prisma.staff.update({ where: { id: s.id }, data: { name: next } })
      updated++
    }
  }
  console.log(JSON.stringify({ updated }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

