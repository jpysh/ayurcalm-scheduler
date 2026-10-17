// node scripts/uat-polish-words-841.mjs — Make it mine step 1 on a fresh trial, at 375x812 (#841).
//   CENTRE_NAME="Shanti Retreat" ADMIN_EMAIL=owner@shanti.example TRIAL=true APP_PORT=8097 docker compose -p freshwalk up -d --build
//   docker compose -p freshwalk exec -T app npx tsx server/src/scripts/resetPassword.ts owner@shanti.example freshwalk1
// SHOT=before against main, SHOT=after (default) against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8097';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-17-polish-words';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@shanti.example', password: 'freshwalk1' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/setup/mine`); await p.waitForTimeout(2500);
console.log(SHOT, (await p.evaluate(() => document.body.innerText)).match(/They see[^\n]*/)?.[0]);
await p.screenshot({ path: `${OUT}/${SHOT}-make-it-mine.png` });
await b.close();
