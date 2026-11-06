// A reload must never show the first (unstyled) version of the app: the shell stays hidden until the feature styles and
// scripts are in, and it is already the final layout when it appears.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.NO_FLASH_PORT ?? 4495); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'en'); });
  await loginBrowserContext(context, base);
  const page = await context.newPage();
  // slow down the app script so the window between "page parsed" and "design ready" is wide
  await page.route('**/dulli.js', async route => { await new Promise(resolve => setTimeout(resolve, 1800)); await route.continue(); });
  await page.goto(`${base}/app`, { waitUntil: 'commit' });
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.app-shell')).visibility), 'hidden', 'the shell is hidden while the design is still loading');
  const splash = await page.evaluate(() => { const box = document.querySelector('.jd-splash img.splash-light').getBoundingClientRect(); return { shown: getComputedStyle(document.querySelector('.jd-splash')).display, width: box.width, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2, vw: innerWidth, vh: innerHeight }; });
  assert.equal(splash.shown, 'grid', 'the Dulli logo is shown while loading');
  assert.ok(splash.width > 100 && Math.abs(splash.centerX - splash.vw / 2) < 2 && Math.abs(splash.centerY - splash.vh / 2) < 2, `the logo is centred: ${JSON.stringify(splash)}`);
  await page.waitForFunction(() => !document.documentElement.classList.contains('jd-boot'), null, { timeout: 8000 });
  const state = await page.evaluate(() => ({
    visible: getComputedStyle(document.querySelector('.app-shell')).visibility,
    navIcons: document.querySelectorAll('.tabs .tab-icon svg').length,
    topbarRight: Boolean(document.querySelector('.topbar-right')),
    themeLoaded: [...document.styleSheets].some(sheet => /dulli.css/.test(sheet.href ?? '')) && document.querySelectorAll('link[rel=stylesheet]').length === 1
  }));
  assert.equal(state.visible, 'visible');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.jd-splash')).display), 'none', 'the logo is gone once the app is shown');
  await page.evaluate(() => document.querySelector('.tabs a[href="#more"]').click());
  assert.equal(await page.locator('.jd-more .language-row').first().isVisible(), false, 'language and moon rows are not on the Manage page');
  assert.equal(await page.locator('.jd-more-prefs').count(), 0);
  assert.ok(state.navIcons >= 4 && state.topbarRight, `the shell is already rebuilt when it appears: ${JSON.stringify(state)}`);
  assert.ok(state.themeLoaded, 'the single design stylesheet is in before the page is shown');
  console.log('no flash: shell hidden until the final design is ready passed');
} finally { await browser.close(); server.kill(); }
