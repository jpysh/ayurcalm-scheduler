// node shot.mjs <path> <name> [js-steps-file]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = 'http://localhost:8741', D = process.env.D;
const token = readFileSync(`${D}/token`, 'utf8').trim();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'America/New_York' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-14T01:00:00Z'));
await p.goto(APP + process.argv[2]); await p.waitForTimeout(2500);
if (process.argv[4]) await new Function('p', `return (async()=>{${readFileSync(process.argv[4], 'utf8')}})()`)(p);
await p.screenshot({ path: `${D}/${process.argv[3]}.png` });
console.log((await p.locator('body').innerText()).slice(0, 1500));
await b.close();
