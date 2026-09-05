import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 3000)),
    ])
    const [patient, staff, therapy, room] = await Promise.race([
      Promise.all([
        prisma.patient.findFirst(),
        prisma.staff.findFirst(),
        prisma.therapy.findFirst(),
        prisma.therapyRoom.findFirst(),
      ]),
      new Promise((resolve) => setTimeout(() => resolve([null,null,null,null]), 5000)),
    ]) as any
    if (!patient || !staff || !therapy || !room) {
      console.error('Smoke test failed: missing base entities')
      process.exit(10)
    }
    console.log('Smoke test passed:', { patient: patient.name, staff: staff.name, therapy: therapy.name, room: room.name })
  } finally {
    await prisma.$disconnect()
  }
}

main()
