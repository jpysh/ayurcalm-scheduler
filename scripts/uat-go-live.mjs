// Live go-live check of Ruta's public addresses at phone width. Never submits the sign-up form.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const dir = `docs/design/uat/${process.argv[2] || new Date().toISOString().slice(0, 10)}-go-live`;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ruta.jains.es 188.114.96.9, MAP ruta-demo.jains.es 188.114.96.9'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
let failed = 0;
async function check(name, url, test) {
  const res = await page.goto(url, { waitUntil: 'load' }).catch((e) => ({ err: e.message }));
  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText().catch(() => '');
  const ok = !res?.err && test(page.url(), body);
  if (!ok) { failed++; console.log(body.slice(0, 200).replace(/\s+/g, ' ')); }
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false }).catch(() => {});
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${url} -> ${page.url()}${res?.err ? ' ' + res.err : ''}`);
}
await check('landing', 'https://ruta.jains.es/', (u, b) => /Ruta/.test(b) && /Run a calmer centre/.test(b));
await check('old-path-redirect', 'https://jains.es/ruta', (u) => u.startsWith('https://ruta.jains.es'));
await check('start', 'https://ruta.jains.es/start', (u, b) => /Centre name/.test(b) && /Look first/.test(b));
await check('demo', 'https://ruta-demo.jains.es/', (u, b) => /Start free/.test(b));
await check('old-signup', 'https://signup.jains.es/', () => true);
await check('old-demo', 'https://demo.jains.es/', () => true);
await browser.close();
process.exit(failed ? 1 : 0);
