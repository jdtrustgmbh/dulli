// The gear icon opens the Settings page on its own from every view, never below the content of Tasks or Lists.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.SETTINGS_VIEWS_PORT ?? 4492); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'de-DE' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'de'); });
  await loginBrowserContext(context, base);
  const page = await context.newPage(); await page.goto(`${base}/app`);
  await page.waitForSelector('.topbar .topbar-icon');
  for (const view of ['tasks', 'lists', 'calendar']) {
    await page.locator(`.tabs a[href="#${view}"]`).click(); await page.waitForTimeout(500);
    await page.locator('.topbar .topbar-icon').click();
    await page.locator('.settings-panel').waitFor({ state: 'visible', timeout: 5000 });
    const visible = await page.evaluate(() => [...document.querySelectorAll('.module-view, .tasks-board-panel, .calendar-week-panel, .today-grid')].filter(el => !el.hidden && el.offsetParent !== null).map(el => el.className));
    assert.deepEqual(visible, [], `from ${view}: only Settings is shown, found ${visible.join(', ')}`);
  }
  console.log('settings from views: gear opens Settings alone from tasks, lists and calendar');
} finally { await browser.close(); server.kill(); }
