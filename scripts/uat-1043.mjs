// node scripts/uat-1043.mjs — their own therapist first (#1043), 375x812, on a throwaway stack (APP_URL) seeded today.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8096';
const OUT = 'docs/design/uat/2026-10-22-their-therapist';
mkdirSync(OUT, { recursive: true });
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date('2026-10-22T08:30:00+05:30'));
await p.goto(`${APP}/`); await p.waitForTimeout(3500);
// The seeded resident whose own therapist, Bhavna, is on leave today.
await p.getByRole('button', { name: 'Book a treatment' }).click(); await p.waitForTimeout(1500);
await p.getByPlaceholder('Search patients').fill('Vivaan Gupta'); await p.waitForTimeout(800);
await p.getByRole('dialog').getByText('Vivaan Gupta', { exact: true }).last().click(); await p.waitForTimeout(2000);
await p.getByText('Other therapies').click(); await p.waitForTimeout(800);
await p.getByPlaceholder('Search therapies').fill('Nasya'); await p.waitForTimeout(500);
await p.getByRole('dialog').getByText('Nasya', { exact: true }).last().click(); await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/after-booking-their-therapist-375.png` });
// The card: their therapist, set from the card.
await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
await p.getByText('Vivaan Gupta', { exact: true }).first().click(); await p.waitForTimeout(2000);
await p.getByText('Open card').first().click(); await p.waitForTimeout(2500);
await p.getByText('Their therapist', { exact: true }).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/after-card-their-therapist-375.png` });
await b.close();
