import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { app } from './server.js';
import { prisma } from './server.js';
import { authRouter, requireAuth, warnIfDefaultAdminUnchanged } from './auth.js';
import { settingsRouter } from './settings.js';
import { generateDailySchedulePdf } from './pdf/dailySchedulePdf.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const host = process.env.HOST || '127.0.0.1';
const KEEP_ALIVE_TIMEOUT = 30000; // 30 seconds
const HEADERS_TIMEOUT = 35000; // 35 seconds

const expressApp = express();
expressApp.set('trust proxy', 1);
expressApp.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  next();
});
expressApp.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','CF-Access-JWT-Assertion','cf-connecting-ip','x-api-key'],
}));
// Settings carries a logo data: URI, so it gets a larger body limit than the
// rest of the API, which stays tight at 100kb.
expressApp.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/settings')) return express.json({ limit: '2mb' })(req, res, next);
  return express.json({ limit: '100kb' })(req, res, next);
});

// Enhanced root /health endpoint with server metadata
expressApp.get('/health', async (_req: Request, res: Response) => {
  try {
    const ok = await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => true),
      new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    res.json({
      ok,
      service: 'ayurcalm',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      env: process.env.NODE_ENV || 'development',
    });
  } catch {
    res.status(200).json({
      ok: false,
      service: 'ayurcalm',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

function createRateLimiter(windowMs: number, max: number) {
  const store = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = String((req.headers['cf-connecting-ip'] as string) || req.ip || req.socket.remoteAddress || '');
    const entry = store.get(ip);
    if (!entry || entry.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= max) {
      res.status(429).json({ error: 'Too Many Requests' });
      return;
    }
    entry.count += 1;
    next();
  };
}

const globalLimiter = createRateLimiter(15 * 60 * 1000, 1200);
const writeLimiter = createRateLimiter(5 * 60 * 1000, 40);
const apptPostLimiter = createRateLimiter(60 * 1000, 10);

expressApp.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const p = req.path || '';
  if (p === '/health') return next();
  return globalLimiter(req, res, next);
});
// Login and health are the only unauthenticated API routes. Everything else
// requires a valid session token, reads included — appointment and patient
// data is not public.
expressApp.use('/api/auth', authRouter);
expressApp.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if ((req.path || '') === '/health') return next();
  return requireAuth(req, res, next);
});
expressApp.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    return writeLimiter(req, res, next);
  }
  next();
});
expressApp.post('/api/appointments', apptPostLimiter);
expressApp.use('/api/settings', settingsRouter);
expressApp.use('/api', app);

expressApp.get('/api/daily-schedule-pdf', async (req: Request, res: Response) => {
  try {
    const dateParam = String(req.query.date || '');
    const dateISO = dateParam || new Date().toISOString().slice(0, 10);
    const pdf = await generateDailySchedulePdf(dateISO, prisma);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="daily-schedule.pdf"');
    res.status(200).send(pdf);
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.resolve(__dirname, '../../dist');
if (fs.existsSync(staticDir)) {
  expressApp.use(express.static(staticDir));
  expressApp.get('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });
  expressApp.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}
if (!fs.existsSync(staticDir)) {
  expressApp.get('/', (_req: Request, res: Response) => {
    res.status(200).send('AyurCalm API');
  });
  expressApp.get('*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });
}

// Start server with timeouts
const server = expressApp.listen(port, host, () => {
  console.log(`AyurCalm API listening on http://${host}:${port}`);
  void warnIfDefaultAdminUnchanged();
});

server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
server.headersTimeout = HEADERS_TIMEOUT;

expressApp.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'Internal Server Error' });
});

function shutdown() {
  import('./server.js').then(({ prisma }) => {
    prisma.$disconnect().finally(() => process.exit(0));
  }).catch(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
