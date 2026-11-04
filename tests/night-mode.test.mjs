// Night mode: Settings switch sets data-theme, persists per device, applies before paint, covers public pages.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.NIGHT_MODE_PORT ?? 4352);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: '', BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
let browser;
const luminance = rgb => { const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await loginBrowserContext(context, base);
  await context.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'de'); sessionStorage.setItem('seeded', '1'); } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.jdTheme && document.querySelector('.topbar-icon'));
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme ?? null), null);
  assert.ok(luminance(await bg()) > 0.8, 'light by default');

  // Settings switch turns night mode on
  await page.locator('.topbar-icon').last().click();
  const toggle = page.locator('[data-night]');
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false);
  await toggle.check({ force: true });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('jd-theme')), 'dark');
  assert.ok(luminance(await bg()) < 0.2, 'dark background');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#0b1622');
  // The light logo is hidden, the dark twin (white wordmark) shown
  assert.equal(await page.locator('.topbar .brand-logo:not(.brand-logo--dark)').evaluate(el => getComputedStyle(el).display), 'none');
  assert.equal(await page.locator('.topbar .brand-logo--dark').evaluate(el => getComputedStyle(el).display), 'block');

  // Survives a reload and is applied before first paint (attribute set by the inline head script)
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  // Public pages follow the same setting
  for (const path of ['/login']) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', path);
    assert.ok(luminance(await bg()) < 0.25, `${path} dark`);
  }

  // Back to day mode
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.jdTheme && document.querySelector('.topbar-icon'));
  await page.locator('.topbar-icon').last().click();
  await page.locator('[data-night]').waitFor();
  assert.equal(await page.locator('[data-night]').isChecked(), true);
  await page.locator('[data-night]').uncheck({ force: true });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme ?? null), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('jd-theme')), null);
  assert.ok(luminance(await bg()) > 0.8, 'light again');
  assert.deepEqual(errors, []);
  console.log('night-mode: settings switch, persistence, public pages, logo swap passed');
} finally {
  await browser?.close();
  server.kill();
}
