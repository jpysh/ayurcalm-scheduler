import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const PORT = process.env.PORT || 4100;
  const API_BASE = process.env.API_BASE || `http://127.0.0.1:${PORT}/api`;
  try {
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 3000)),
    ]);

    console.log('Testing Validation/Null handling...');

    // 1) ProgramEvent with null recurrence
    const eventPayload = {
      start_time: '10:00',
      end_time: '11:00',
      activity_name: 'Validation Test Event',
      recurrence: null, // This was crashing the server
      weekdays: null,
      notes: null,
      date: new Date().toISOString().slice(0,10)
    };

    const eventRes = await fetch(`${API_BASE}/program-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });

    if (eventRes.status !== 201) {
      const txt = await eventRes.text();
      throw new Error(`ProgramEvent creation failed with status ${eventRes.status}: ${txt}`);
    }
    const eventData = await eventRes.json();
    console.log('ProgramEvent created successfully with null recurrence:', eventData.id);

    // Cleanup
    if (eventData.id) {
      await prisma.programEvent.delete({ where: { id: eventData.id } });
    }

    // 2) TimeOff with null recurrence
    const timeoffPayload = {
      entity_type: 'center',
      start_date: new Date().toISOString().slice(0,10),
      end_date: new Date().toISOString().slice(0,10),
      recurrence: null, // Was crashing
      weekdays: null,
      description: 'Validation Test TimeOff'
    };

    const timeoffRes = await fetch(`${API_BASE}/timeoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeoffPayload)
    });

    if (timeoffRes.status !== 201) {
      const txt = await timeoffRes.text();
      throw new Error(`TimeOff creation failed with status ${timeoffRes.status}: ${txt}`);
    }
    const timeoffData = await timeoffRes.json();
    console.log('TimeOff created successfully with null recurrence:', timeoffData.id);

    // Cleanup
    if (timeoffData.id) {
      await prisma.timeOff.delete({ where: { id: timeoffData.id } });
    }

    console.log('Validation/Null handling tests passed');
  } finally {
    await prisma.$disconnect();
  }
}

main();
