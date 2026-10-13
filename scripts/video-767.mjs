// #767: the 30-second phone video, sign-up to tomorrow planned. Re-record after a screen in it changes.
//   CENTRE_NAME="Shanti Ayurveda Retreat" ADMIN_EMAIL=owner@shanti.example TRIAL=true APP_PORT=8090 docker compose -p video767 up -d --build
//   docker compose -p video767 exec -T app npx tsx server/src/scripts/resetPassword.ts owner@shanti.example video767pass
//   E2E_BASE_URL=http://localhost:8090 node scripts/video-767.mjs
//   docker compose -p video767 down -v
// The sign-up form is the live one, typed into and never sent; the centre it would create is the fresh stack above.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8090';
const OUT = 'site/public/ruta/video';
const size = { width: 375, height: 812 };
const raw = mkdtempSync(`${tmpdir()}/video-767-`);
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@shanti.example', password: 'video767pass' }) })).json();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: size, isMobile: true, hasTouch: true, recordVideo: { dir: raw, size } });
const p = await ctx.newPage();
const video = p.video();
const slow = (loc, text) => loc.pressSequentially(text, { delay: 70 });
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await loc.click(); };

await p.goto('https://signup.jains.es/');
await slow(p.getByLabel('Centre name'), 'Shanti Ayurveda Retreat');
await slow(p.getByLabel('Your email'), 'owner@shanti.example');
await p.waitForTimeout(1500);

// The "Open your centre" link signs the owner in; here the token stands in for it.
await p.goto(`${APP}/login`);
await p.evaluate((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'owner@shanti.example'); }, token);
await p.goto(`${APP}/admin/schedule`);
await p.getByRole('link', { name: 'Make it mine' }).waitFor();
await p.waitForTimeout(3500);
await p.mouse.wheel(0, 500); await p.waitForTimeout(1200); await p.mouse.wheel(0, -500); await p.waitForTimeout(600);

await tap(p.getByRole('link', { name: 'Make it mine' }));
await slow(p.getByLabel('Doctors'), 'Dr Anjali Nair');
await tap(p.getByRole('button', { name: 'Woman', exact: true }).first());
await slow(p.getByLabel('Therapists'), 'Ramesh\nLatha\nSuresh');
const men = p.getByRole('button', { name: 'Man', exact: true });
const women = p.getByRole('button', { name: 'Woman', exact: true });
await tap(men.nth(1)); await tap(women.nth(2)); await tap(men.nth(3));
await tap(p.getByRole('button', { name: 'Continue' }));
await p.waitForTimeout(1200);
await tap(p.getByRole('button', { name: 'Continue' }));
await slow(p.getByLabel('Residents'), 'Priya Menon\nArjun Rao\nKavya Iyer');
await tap(women.nth(0)); await tap(men.nth(1)); await tap(women.nth(2));
await tap(p.getByRole('button', { name: /^Plan tomorrow/ }));
await p.waitForURL(/date=/, { timeout: 60000 });
await p.waitForLoadState('networkidle');
await p.waitForTimeout(5000);

await ctx.close(); await b.close();
const webm = await video.path();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', '-an', `${OUT}.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=8,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse', `${OUT}.gif`]);
console.log(`${OUT}.mp4 and ${OUT}.gif`);
