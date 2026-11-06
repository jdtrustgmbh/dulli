// Settings / profiles / picture mode / child lock smoke.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';

const port = Number(process.env.SETTINGS_SMOKE_PORT ?? 4397);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '' }, stdio: 'ignore' });
for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
const cookie = await loginCookie(base);
const api = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie, 'Content-Type': 'application/json' } });
const extras = async () => (await api('/api/extras')).json();
for (const name of ['Mira', 'Theo']) await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name, role: name === 'Theo' ? 'child' : 'adult' }) });

// 64x48 PNG generated in the page (no fixture files needed).
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
await loginBrowserContext(context, base);
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
page.on('dialog', dialog => dialog.accept().catch(() => {}));
const step = async (name, fn) => { await fn(); console.log(`settings-smoke: ${name} passed`); };
const pngFile = async (name, color) => ({ name, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(fill => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, 64, 48); return c.toDataURL('image/png').split(',')[1]; }, color), 'base64') });
const pressPin = async pin => { for (const digit of pin) await page.locator(`.jd-pin-dialog[open] [data-pin-key="${digit}"]`).click(); };
const openSettings = async () => { await page.locator('.topbar-right .topbar-icon:not(.topbar-group)').click(); await page.locator('.settings-panel:not([hidden])').waitFor(); };

try {
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  try { await page.locator('[data-wizard-skip-all]').waitFor({ timeout: 2500 }); await page.locator('[data-wizard-skip-all]').click(); } catch {}
  await page.waitForFunction(() => window.jdLock && window.jdSettings && window.jdPhotoFrame && window.jdProfiles && window.jdExtras);

  await step('Settings panel opens from More with all sections', async () => {
    await openSettings();
    const text = await page.locator('.settings-panel').innerText();
    for (const heading of ['General', 'Profiles', 'Customize', 'Quiet times', 'Child lock', 'Who has access?', 'Data', 'Software']) assert.ok(text.includes(heading), `missing section ${heading}`);
    assert.ok(text.includes('test@example.com'), 'access list shows the signed-in account');
  });

  await step('Region Bayern and School tab toggle persist', async () => {
    await page.locator('.settings-panel select[data-setting="stateCode"]').selectOption('BY');
    await page.waitForFunction(() => window.jdExtras.get('settings', {}).stateCode === 'BY');
    assert.equal((await extras()).settings.stateCode, 'BY');
    await page.locator('.settings-panel input[data-setting="showSchool"]').uncheck();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.tabs a[href="#school"]')).display === 'none');
    await page.locator('.settings-panel input[data-setting="showSchool"]').check();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.tabs a[href="#school"]')).display !== 'none');
  });

  await step('Profile color and photo change everywhere', async () => {
    await page.locator('.settings-panel [data-open-tool="Family"]').click();
    await page.locator('.members-panel:not([hidden]) .jd-profile-list').waitFor();
    await page.locator('.jd-profile-list li[data-profile="Mira"] [data-profile-edit]').click();
    await page.locator('dialog.jd-profile-dialog[open]').waitFor();
    const box = await page.locator('dialog.jd-profile-dialog').boundingBox(); const viewport = page.viewportSize();
    assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, 'the profile editor opens as an overlay fully inside the viewport');
    await page.locator('.jd-profile-editor [data-color="#8f7ac4"]').click();
    await page.waitForFunction(() => window.jdMemberColor('Mira') === '#8f7ac4');
    assert.equal((await extras()).profiles.Mira.color, '#8f7ac4');
    await page.locator('.jd-profile-editor input[type="file"]').setInputFiles(await pngFile('me.png', '#e97962'));
    await page.waitForFunction(() => (window.jdExtras.get('profiles', {}).Mira?.photo ?? '').startsWith('data:image/jpeg'));
    await page.waitForFunction(() => [...document.querySelectorAll('.avatar-row .avatar-chip')].some(chip => chip.title === 'Mira' && chip.classList.contains('has-photo')));
    await page.keyboard.press('Escape'); await page.locator('dialog.jd-profile-dialog').waitFor({ state: 'detached' });
    await page.locator('.jd-profile-list li[data-profile="Theo"] [data-move="-1"]').click();
    await page.waitForFunction(() => document.querySelector('.jd-profile-list li[data-profile]')?.dataset.profile === 'Theo');
    await page.locator('.jd-profile-list li[data-profile="Mira"] [data-profile-edit]').click();
    await page.locator('.jd-profile-editor .jd-rename input').fill('Mira K.');
    await page.locator('.jd-profile-editor .jd-rename [type="submit"]').click();
    await page.locator('.jd-profile-list li[data-profile="Mira K."]').waitFor();
    const household = await (await api('/api/household/demo')).json();
    assert.ok(household.members.includes('Mira K.') && !household.members.includes('Mira'));
    const profiles = (await extras()).profiles;
    assert.equal(profiles['Mira K.'].color, '#8f7ac4'); assert.equal(profiles.Mira, undefined);
  });

  await step('Child lock with PIN 1234 protects events and tasks', async () => {
    await openSettings();
    await page.locator('[data-lock-toggle]').click();
    await pressPin('1234'); await page.locator('#jd-pin-title', { hasText: 'Repeat' }).waitFor(); await pressPin('1234');
    await page.waitForFunction(() => window.jdLock.enabled && window.jdLock.locked);
    const stored = (await extras()).childLock;
    assert.ok(stored.hash && stored.salt && !JSON.stringify(stored).includes('1234'), 'only a salted hash is stored');
    assert.deepEqual(stored.areas, ['events', 'tasks']);
    assert.equal(await page.evaluate(() => [window.jdLock.isLocked('events'), window.jdLock.isLocked('tasks'), window.jdLock.isLocked('lists')].join()), 'true,true,false');
    // Quick capture an event -> PIN dialog; wrong PIN shows feedback; right PIN saves.
    await page.locator('.tabs-fab').click(); // shell: the topbar capture button is replaced by the sidebar FAB
    await page.locator('#capture-form .type[data-type="Event"]').click();
    await page.locator('#capture-input').fill('Dentist appointment');
    await page.locator('#capture-form [type="submit"]').click();
    await page.locator('.jd-pin-dialog[open]').waitFor();
    await pressPin('0000');
    await page.locator('.jd-pin-msg', { hasText: 'Wrong PIN' }).waitFor();
    await pressPin('1234');
    await page.waitForFunction(() => !document.querySelector('.jd-pin-dialog[open]') && !document.querySelector('#capture-dialog[open]'));
    assert.equal(await page.evaluate(() => window.jdLock.locked), false);
    // Lock again: the calendar "+" asks for the PIN too; 5 wrong tries -> 30 s cooldown.
    await page.evaluate(() => window.jdLock.lock());
    await page.locator('.tabs a[href="#calendar"]').click();
    await page.locator('.week-add').first().click();
    await page.locator('.jd-pin-dialog[open]').waitFor();
    for (let i = 0; i < 5; i++) await pressPin('9999');
    await page.locator('.jd-pin-msg', { hasText: 'Too many attempts' }).waitFor();
    assert.equal(await page.locator('.jd-pin-dialog [data-pin-key="1"]').isDisabled(), true);
    await page.locator('.jd-pin-dialog [data-pin-cancel]').click();
    // Disabling requires the PIN (still cooling down -> stays enabled).
    await page.evaluate(() => window.jdSettings.open());
    await page.locator('[data-lock-toggle]').click();
    await page.locator('.jd-pin-dialog[open]').waitFor();
    await page.locator('.jd-pin-dialog [data-pin-cancel]').click();
    assert.equal(await page.evaluate(() => window.jdLock.enabled), true);
  });

  await step('Two uploaded photos drive idle picture mode and quiet-time sleep', async () => {
    await page.evaluate(() => window.jdExtras.set('childLock', { ...window.jdExtras.get('childLock'), enabled: false }));
    await page.locator('.tabs a[href="#more"]').dispatchEvent('click'); // desktop: More is reached via gear/back link, the tab is mobile-only
    await page.locator('[data-tool="Photos"]').click();
    await page.locator('.photos-panel [data-frame-upload]').setInputFiles([await pngFile('a.png', '#2b8c87'), await pngFile('b.png', '#c9a227')]);
    await page.waitForFunction(() => (window.jdExtras.get('photoFrame', {}).photos ?? []).length === 2);
    assert.equal((await extras()).photoFrame.photos.length, 2);
    assert.equal(await page.locator('.photos-panel .jd-frame-grid figure').count(), 2 + 4);
    await page.evaluate(() => window.jdPhotoFrame.simulateIdle(16 * 60000));
    await page.locator('.jd-frame:not([hidden]):not(.sleep) .jd-frame-img.visible').waitFor();
    assert.ok((await page.locator('.jd-frame-img.visible').getAttribute('src')).startsWith('data:image/jpeg'));
    await page.locator('.jd-frame').click();
    await page.locator('.jd-frame').waitFor({ state: 'hidden' });
    await page.evaluate(() => { const now = new Date(); const pad = n => String(n).padStart(2, '0'); const later = new Date(now.getTime() + 3600000); return window.jdExtras.set('settings', { ...window.jdExtras.get('settings', {}), quietStart: `${pad(now.getHours())}:${pad(now.getMinutes())}`, quietEnd: `${pad(later.getHours())}:${pad(later.getMinutes())}` }); });
    await page.evaluate(() => window.jdPhotoFrame.simulateIdle(61000));
    await page.locator('.jd-frame.sleep:not([hidden])').waitFor();
    await page.locator('.jd-frame').click();
  });

  await step('Shared display uses the same picture mode', async () => {
    const display = await context.newPage();
    const displayErrors = [];
    display.on('pageerror', error => displayErrors.push(error.message));
    await display.goto(`${base}/display.html`, { waitUntil: 'domcontentloaded' });
    await display.waitForFunction(() => window.jdPhotoFrame && window.jdExtras.get('photoFrame', {}).photos?.length === 2);
    await display.locator('#picture-mode').click();
    await display.locator('.jd-frame:not([hidden]) .jd-frame-img.visible').waitFor();
    assert.deepEqual(displayErrors, []);
    await display.close();
  });

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log('settings: all passed');
} finally {
  await browser.close();
  server.kill();
}
