// node scripts/uat-416.mjs — #416: what the first open moves, at 375x812. SHOT names the shot (00-before on main, 01 on the branch).
import { chromium } from '@playwright/test';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || '01';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
let api = 0, bytes = 0;
p.on('requestfinished', async (r) => { if (r.url().includes('/api/')) api++; const s = await r.sizes().catch(() => null); if (s) bytes += s.responseBodySize + s.responseHeadersSize; });
await p.goto(APP + '/'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
await p.screenshot({ path: `docs/design/uat/2026-10-07-fast-open/${SHOT}.png` });
console.log(`${SHOT}: ${api} API calls, ${Math.round(bytes / 1024)} KB moved`);
await b.close();
