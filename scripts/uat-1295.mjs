// node scripts/uat-1295.mjs — sign-up and the demo at 375x812 (#1295).
// SIGNUP_URL: provisioner/public.mjs run locally; APP_URL: a throwaway stack with DEMO_MODE=true.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const SIGNUP = process.env.SIGNUP_URL || 'http://localhost:8299';
const APP = process.env.APP_URL || 'http://localhost:8098';
const OUT = 'docs/design/uat/2026-10-27-signup';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
const p = await ctx.newPage();
await p.goto(`${SIGNUP}/`); await p.screenshot({ path: `${OUT}/signup-375.png`, fullPage: true });
await p.goto(`${APP}/login`); await p.waitForURL(/schedule/, { timeout: 15000 }); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/demo-opens-on-day-375.png` });
await b.close();
