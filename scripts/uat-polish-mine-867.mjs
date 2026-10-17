// node scripts/uat-polish-mine-867.mjs before|after — #867 at 375x812 and 200%: Make it mine step 1, the WhatsApp link's height.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/polish-mine-867';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/setup/mine`); await p.waitForTimeout(1500);
const link = p.getByRole('link', { name: /WhatsApp/ });
console.log(WHEN, 'link height', Math.round((await link.boundingBox()).height));
await p.screenshot({ path: `${OUT}/step1-${WHEN}.png` });
await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/step1-${WHEN}-200.png` });
await b.close();
