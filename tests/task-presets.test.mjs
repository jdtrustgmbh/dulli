// New-task dialog: default presets + recently used titles in a dropdown next to the title field.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.TASK_PRESETS_PORT ?? 4351);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: '', BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await loginBrowserContext(context, base);
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'de'); });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mia', role: 'child' }) }); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.jdOpenTasksBoard && window.jdExtras);
  await page.locator('.tabs a[href="#tasks"]').click();
  await page.waitForSelector('.tb-col[data-owner="Mia"]');

  const dialog = page.locator('.jd-task-dialog');
  const open = async () => { await page.locator('.tb-col[data-owner="Mia"] [data-tb-add]').click(); await dialog.locator('input[name="title"]').waitFor(); };

  // 1. Dropdown opens from the arrow in the title box and lists the four defaults, no "recent" yet.
  await open();
  await dialog.locator('.jd-combo-toggle').click();
  const titles = await dialog.locator('.jd-combo-list [role="option"] .jd-combo-title').allInnerTexts();
  assert.deepEqual(titles, ['Spülmaschine ausräumen', 'Wäsche zusammenlegen', 'Treppe fegen', 'Bad putzen']);
  assert.equal(await dialog.locator('.jd-combo-head').count(), 1);

  // 2. Picking a preset fills title, emoji, time of day and coins.
  await dialog.locator('.jd-combo-list [role="option"]', { hasText: 'Bad putzen' }).click();
  assert.equal(await dialog.locator('input[name="title"]').inputValue(), 'Bad putzen');
  assert.equal(await dialog.locator('input[name="emoji"]').inputValue(), '🛁');
  assert.equal(await dialog.locator('input[name="coins"]').inputValue(), '2');
  assert.equal(await dialog.locator('.jd-combo-list').isHidden(), true);
  await dialog.locator('button[type="submit"]').click();
  await page.locator('.tb-col[data-owner="Mia"] .tb-item', { hasText: 'Bad putzen' }).waitFor();

  // 3. A custom task shows up under "Zuletzt eingegeben"; presets are not duplicated there.
  await open();
  await dialog.locator('input[name="title"]').fill('Zähne putzen');
  await dialog.locator('input[name="coins"]').fill('3');
  await dialog.locator('button[type="submit"]').click();
  await page.locator('.tb-col[data-owner="Mia"] .tb-item', { hasText: 'Zähne putzen' }).waitFor();
  await open();
  await dialog.locator('.jd-combo-toggle').click();
  assert.equal(await dialog.locator('.jd-combo-head').count(), 2);
  const recent = await dialog.locator('.jd-combo-list [role="option"] .jd-combo-title').allInnerTexts();
  assert.deepEqual(recent.slice(4), ['Zähne putzen']);
  assert.equal(recent.filter(title => title === 'Bad putzen').length, 1);

  // 4. Typing filters, keyboard picks, Escape closes the list but not the dialog.
  await dialog.locator('input[name="title"]').fill('zäh');
  await dialog.locator('.jd-combo-list [role="option"]').first().waitFor();
  assert.deepEqual(await dialog.locator('.jd-combo-list [role="option"] .jd-combo-title').allInnerTexts(), ['Zähne putzen']);
  await dialog.locator('input[name="title"]').press('Escape');
  assert.equal(await dialog.locator('.jd-combo-list').isHidden(), true);
  assert.equal(await dialog.evaluate(el => el.open), true);
  await dialog.locator('input[name="title"]').fill('');
  await dialog.locator('input[name="title"]').press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await dialog.locator('input[name="title"]').inputValue(), 'Wäsche zusammenlegen');
  await dialog.locator('[data-close]').first().click();

  assert.deepEqual(errors, []);
  console.log('task-presets: presets, recently used, filter, keyboard and Escape passed');
} finally {
  await browser?.close();
  server.kill();
}
