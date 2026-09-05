import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.staff.count({ where: { name: { startsWith: 'Dr.' } } })
  console.log(JSON.stringify({ withDrPrefix: count }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

