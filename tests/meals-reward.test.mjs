// Planning a meal for an empty slot earns coins for the chosen planner profile, once per date + slot.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.MEAL_REWARD_PORT ?? 4461); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
  await loginBrowserContext(context, base);
  for (const name of ['Mira', 'Theo']) await context.request.post(`${base}/api/household/demo/members`, { data: { name, role: name === 'Theo' ? 'child' : 'adult' } });
  const page = await context.newPage(); await page.goto(`${base}/app`);
  await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  await page.waitForFunction(() => window.jdExtras && window.jdMeals);
  await page.evaluate(() => document.querySelector('.tabs a[href="#meals"]')?.click());
  await page.locator('.mp-slot').first().waitFor();
  const meals = () => page.evaluate(() => (window.jdExtras.get('coins', []) ?? []).filter(entry => entry.reason === 'meal').map(entry => ({ member: entry.member, delta: entry.delta, date: entry.date, slot: entry.slot })));
  const plan = async (slotIndex, planner) => {
    await page.locator('.mp-slot:not(.filled)').nth(slotIndex).click();
    await page.locator('.mp-planner-chip').first().waitFor();
    const pressed = await page.locator('.mp-planner-chip[aria-pressed="true"]').count();
    if (planner === null && pressed) await page.locator('.mp-planner-chip[aria-pressed="true"]').click();
    if (planner && !(await page.locator(`.mp-planner-chip[data-name="${planner}"][aria-pressed="true"]`).count())) await page.locator(`.mp-planner-chip[data-name="${planner}"]`).click();
    await page.locator('.mp-quick input[name="title"]').fill('Pasta');
    await page.locator('.mp-quick button[type="submit"]').click();
    await page.locator('.mp-dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
    await page.waitForTimeout(300);
  };

  await plan(0, 'Theo');
  let coins = await meals(); assert.equal(coins.length, 1); assert.deepEqual([coins[0].member, coins[0].delta], ['Theo', 1]);
  // Removing the meal and planning the same slot again must not pay twice.
  const first = coins[0];
  await page.evaluate(() => window.jdExtras.set('mealPlan', { entries: [] })); await page.waitForTimeout(300);
  await page.locator(`.mp-slot[data-date="${first.date}"][data-slot="${first.slot}"]`).click();
  await page.locator('.mp-quick input[name="title"]').fill('Pasta again'); await page.locator('.mp-quick button[type="submit"]').click(); await page.waitForTimeout(500);
  assert.equal((await meals()).length, 1, 'same date + slot is rewarded only once');
  // Another empty slot with the planner switched off earns nothing; with a planner it earns again.
  await plan(0, null);
  assert.equal((await meals()).length, 1, 'no planner chosen = no coins');
  await plan(0, 'Mira');
  coins = await meals(); assert.equal(coins.length, 2); assert.equal(coins[1].member, 'Mira');
  console.log('meals-reward: coins for planning an empty slot, once per slot, planner optional passed');
} finally { await browser.close(); server.kill(); }
