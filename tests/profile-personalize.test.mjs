// Profile personalisation for kids: emoji avatar, gradient, frames and badges unlocked by streaks, wish list -> treasure.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';

const port = Number(process.env.PROFILE_PERSONALIZE_PORT ?? 4493); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const cookie = await loginCookie(base);
const api = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie, 'Content-Type': 'application/json' } });
const extras = async () => (await api('/api/extras')).json();
await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name: 'Mira', role: 'child' }) });

// A daily task that Mira finished today and the two days before: a 3-day streak (bronze frame, 3-day badge; silver stays locked).
const task = await (await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Zaehne putzen', owner: 'Mira', recurrence: 'daily' }) })).json();
const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
await api('/api/extras/taskMeta', { method: 'PUT', body: JSON.stringify({ tasks: {}, completions: { [task.id]: { [day(0)]: true, [day(1)]: true, [day(2)]: true } } }) });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'en'); });
  await loginBrowserContext(context, base);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  await page.goto(`${base}/app`);
  await page.waitForFunction(() => window.jdProfiles && window.jdTasks?.streakOf && window.jdExtras);
  assert.equal(await page.evaluate(() => window.jdTasks.streakOf('Mira')), 3, 'three consecutive days make a streak of 3');

  await page.locator('.topbar-right .topbar-icon:not(.topbar-group)').click();
  await page.locator('.settings-panel [data-open-tool="Family"]').click();
  await page.locator('.jd-profile-list li[data-profile="Mira"] [data-profile-edit]').click();
  const dialog = page.locator('dialog.jd-profile-dialog[open]'); await dialog.waitFor();

  // emoji avatar + gradient show up in the header avatar row
  await dialog.locator('[data-emoji="🦊"]').click();
  await page.waitForFunction(() => document.querySelector('.topbar .avatar-chip[title="Mira"]')?.textContent.includes('🦊'));
  await dialog.locator('[data-color2]:not([data-color2=""])').first().click();
  await page.waitForFunction(() => /linear-gradient/.test(document.querySelector('.topbar .avatar-chip[title="Mira"]')?.style.background ?? ''));
  assert.equal((await extras()).profiles.Mira.emoji, '🦊');

  // frames are chosen under Manage > Frames (see manage-pages test); here: a chosen frame shows, locked ones do not apply; badge for 3 days earned
  await page.evaluate(() => window.jdProfiles.setFrame('Mira', 'silver'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.jdProfiles.frameOf('Mira')), '', 'silver needs 7 days, so it does not apply');
  await page.evaluate(() => window.jdProfiles.setFrame('Mira', 'bronze'));
  await page.waitForFunction(() => document.querySelector('.topbar .avatar-chip[title="Mira"]')?.classList.contains('jd-ring-bronze'));
  assert.equal(await dialog.locator('[data-badge="streak3"]').evaluate(el => !el.classList.contains('locked')), true);
  assert.equal(await dialog.locator('[data-badge="streak7"]').evaluate(el => el.classList.contains('locked')), true);
  await page.waitForFunction(async () => ((await (await fetch('/api/extras')).json()).streaks?.Mira ?? 0) >= 3);

  // wish list -> treasure
  await dialog.locator('.jd-wish-form input').fill('Eis essen gehen');
  await dialog.locator('.jd-wish-form [type="submit"]').click();
  await dialog.locator('.jd-wishes li').waitFor();
  await dialog.locator('[data-wish-price]').fill('35');
  await dialog.locator('[data-wish-treasure]').click();
  await page.waitForFunction(async () => (await (await fetch('/api/extras')).json()).treasures?.custom?.some(item => item.name === 'Eis essen gehen' && item.price === 35 && item.member === 'Mira'));
  const profile = (await extras()).profiles.Mira; assert.deepEqual(profile.wishes ?? [], [], 'the wish moved into the treasures');
  console.log('profile personalisation: emoji, gradient, frames, badges and wish list passed');
} finally { await browser.close(); server.kill(); }
