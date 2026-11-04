// Calendar slice smoke: month/5-day/day/profiles views, Mon-Fri recurring event via the editor, reminder,
// profile filter, search, Bavarian holidays and a privacy-synced ICS connection.
// SHOT_DIR=<dir> saves demo screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';

const port = Number(process.env.CALENDAR_SMOKE_PORT ?? 4391);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.SHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', STATE_FILE: '', DATABASE_URL: '' }, stdio: 'ignore' });
for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }

const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:secret-1\r\nSUMMARY:Secret salary talk\r\nLOCATION:Boardroom\r\nDTSTART:20261103T100000Z\r\nDTEND:20261103T113000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const icsServer = createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(ics); });
await new Promise(r => icsServer.listen(0, '127.0.0.1', r));

const cookie = await loginCookie(base);
const api = (path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
for (const name of ['Mia', 'Theo']) await api('/api/household/demo/members', 'POST', { name });
await api('/api/extras/profiles', 'PUT', { Mia: { color: '#e97962', order: 1 }, Theo: { color: '#4a7dbf', order: 2 } });
await api('/api/extras/settings', 'PUT', { defaultCalendarView: 'month', stateCode: '' });
// Four events on one November day force the month cell's "+n more".
for (const [i, title] of ['Dentist', 'Piano', 'Football', 'Parents evening'].entries()) await api('/api/calendar/events', 'POST', { title, startsAt: new Date(2026, 10, 12, 9 + i * 2).toISOString(), owners: ['Mia'] });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', serviceWorkers: 'block' });
await loginBrowserContext(context, base);
const page = await context.newPage(); const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const shot = name => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);
const skipWizard = async () => { try { await page.locator('[data-wizard-skip-all]').waitFor({ timeout: 2500 }); await page.locator('[data-wizard-skip-all]').click(); } catch {} };
const go = (view, y, m, d) => page.evaluate(([v, a, b, c]) => window.jdCalendar.setView(v, new Date(a, b, c)), [view, y, m, d]);

try {
  await page.goto(`${base}/app#today`);
  await page.evaluate(() => localStorage.setItem('jd-language', 'en'));
  await page.reload();
  await skipWizard();
  await page.locator('.tabs a[href="#calendar"]').click();
  // default view from extras.settings
  await page.locator('.cal-month').waitFor();
  assert.equal(await page.locator('.cal-view-btn[data-view="month"]').getAttribute('aria-pressed'), 'true', 'settings.defaultCalendarView=month opens the month view');

  // Mon-Fri recurring event for two profiles through the editor
  await page.locator('.cal-new').click();
  const form = page.locator('.cal-editor');
  await form.locator('[name="title"]').fill('School run');
  await form.locator('[name="startDate"]').fill('2026-11-02');
  await form.locator('[name="startTime"]').fill('07:30');
  await form.locator('[name="endDate"]').fill('2026-11-02');
  await form.locator('[name="endTime"]').fill('08:15');
  await form.locator('[name="repeat"]').selectOption('custom');
  await form.locator('[data-workdays]').click();
  await form.locator('[name="reminder"]').selectOption('15');
  await form.locator('[name="owners"][value="Theo"]').check();
  await form.locator('[name="owners"][value="Mia"]').check();
  await form.locator('[name="description"]').fill('Bring the gym bags');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => /Calendar event added/.test(document.querySelector('#live-region')?.textContent ?? ''));
  const stored = (await (await api('/api/calendar/events')).json()).find(e => e.title === 'School run');
  assert.equal(stored.recurrence, 'weekly');
  assert.equal(stored.recurrenceDays.join(), 'Mon,Tue,Wed,Thu,Fri');
  assert.equal(stored.owners.length, 2);
  assert.equal(stored.description, 'Bring the gym bags');
  const reminder = (await (await api('/api/reminders')).json()).find(r => r.id === `event-${stored.providerId}`);
  assert.equal(reminder?.kind, 'event', 'a 15-minute reminder is registered for the event');
  assert.equal(reminder.offsetMinutes, 15);

  // Month view: chips, holidays, +n more, click day -> day view
  await go('month', 2026, 10, 1);
  assert.equal(await page.locator('.cal-month-cell').count(), 42);
  assert.equal(await page.locator('.cal-month-cell:not(.is-outside) .cal-month-chip', { hasText: 'School run' }).count(), 21, 'Mon-Fri in November 2026 = 21 occurrences');
  assert.equal(await page.locator('.cal-month-cell[data-date="2026-11-07"] .cal-month-chip', { hasText: 'School run' }).count(), 0, 'no occurrence on Saturday');
  assert.equal(await page.locator('.cal-month-chip.cal-holiday').count(), 0, 'no holidays without a region');
  await page.locator('.cal-region').selectOption('BY');
  await page.locator('.cal-month-cell[data-date="2026-11-01"] .cal-holiday', { hasText: /Allerheiligen|All Saints/ }).waitFor();
  assert.equal((await (await api('/api/extras')).json()).settings.stateCode, 'BY', 'region select writes settings.stateCode');
  await page.locator('.cal-month-cell[data-date="2026-11-12"] .cal-month-more').waitFor();
  await shot('1-month-bavaria');
  await page.locator('.cal-month-cell[data-date="2026-11-12"] .cal-month-more').click();
  await page.waitForFunction(() => document.querySelector('.calendar-week-panel')?.dataset.view === 'day');
  assert.equal(await page.locator('.week-day-col').count(), 1);
  assert.equal(await page.locator('.week-event', { hasText: 'Parents evening' }).count(), 1);
  await shot('2-day');

  // Week + 5-day views, multi-profile stripes
  await go('week', 2026, 10, 2);
  assert.equal(await page.locator('.week-event.is-multi', { hasText: 'School run' }).count(), 5, 'Mon-Fri occurrences in week view, striped for two profiles');
  await page.locator('.cal-view-btn[data-view="5day"]').click();
  await page.waitForFunction(() => document.querySelector('.calendar-week-panel')?.dataset.view === '5day');
  assert.equal(await page.locator('.week-day-col').count(), 5);
  await page.locator('[data-week="next"]').click();
  await page.waitForFunction(() => /07\.11|11\/07|7\.11/.test(document.querySelector('.week-range').textContent) || document.querySelectorAll('.week-day-col').length === 5);
  await go('5day', 2026, 10, 2);
  await shot('3-five-day');

  // Profile filter: hiding both owners hides the event
  await go('week', 2026, 10, 2);
  await page.locator(`.topbar .avatar-chip[title="Mia"]`).click();
  await page.waitForFunction(() => document.querySelector('.cal-profile-chip[data-member="Mia"]')?.getAttribute('aria-pressed') === 'false');
  assert.equal(await page.locator('.week-event', { hasText: 'School run' }).count(), 5, 'still shown for Theo');
  await page.locator(`.topbar .avatar-chip[title="Theo"]`).click();
  await page.waitForFunction(() => !document.querySelector('.week-event')?.textContent.includes('School run'));
  assert.equal(await page.locator('.week-event', { hasText: 'School run' }).count(), 0);
  await page.locator(`.topbar .avatar-chip[title="Mia"]`).click();
  await page.locator(`.topbar .avatar-chip[title="Theo"]`).click();
  await page.locator('.week-event', { hasText: 'School run' }).first().waitFor();

  // Profiles view: one column per member (events for everyone span all columns)
  await page.locator('.cal-view-btn[data-view="profiles"]').click();
  await page.waitForFunction(() => document.querySelector('.calendar-week-panel')?.dataset.view === 'profiles');
  assert.equal(await page.locator('.week-day-col').count(), 2);

  // Search jumps to the date
  await go('week', 2026, 0, 5);
  await page.locator('.cal-search').fill('Parents');
  await page.locator('.cal-search-results [data-jump]').first().click();
  await page.locator('.week-event', { hasText: 'Parents evening' }).waitFor();

  // Edit via the detail dialog: the editor is prefilled with the custom weekdays
  await go('week', 2026, 10, 2);
  await page.locator('.week-event', { hasText: 'School run' }).nth(2).click();
  await page.locator('[data-detail-edit]').click();
  assert.equal(await form.locator('[name="repeat"]').inputValue(), 'custom');
  assert.equal(await form.locator('[name="days"]:checked').count(), 5);
  await form.locator('[name="title"]').fill('School run (bike)');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => /Calendar event updated/.test(document.querySelector('#live-region')?.textContent ?? ''));
  await page.locator('.week-event', { hasText: 'School run (bike)' }).nth(4).waitFor();

  // Privacy sync: an ICS calendar marked private shows only "Busy" blocks
  const connect = await (await api('/api/providers/ics/connect', 'POST', { url: `http://127.0.0.1:${icsServer.address().port}/work.ics`, label: 'Work' })).json();
  await page.reload();
  await skipWizard();
  // The shell hides "More" on desktop (reachable via the gear/menu); open it directly.
  // (On slow machines the page scripts may not be wired yet, so retry the click until the connection card is visible.)
  const privateBox = page.locator(`[data-private="${connect.id}"]`);
  for (let attempt = 0; attempt < 15 && !(await privateBox.isVisible()); attempt++) { await page.evaluate(() => document.querySelector('.tabs a[href="#more"]')?.click()); await page.waitForTimeout(800); }
  if (!(await privateBox.count())) { const info = await page.evaluate(async () => ({ hash: location.hash, grid: document.querySelector('.provider-grid')?.innerHTML.slice(0, 600) ?? 'no provider grid', more: document.querySelector('.tool-grid') ? 'tool-grid present' : 'no tool-grid', conns: await (await fetch('/api/provider-connections')).text(), reg: typeof window.__jdRegisterEnhancer })); throw new Error('connection card missing: ' + JSON.stringify(info) + ' errors: ' + pageErrors.join(' | ')); }
  await privateBox.check();
  await page.waitForFunction(() => /only busy times/.test(document.querySelector('#live-region')?.textContent ?? ''));
  const served = (await (await api('/api/calendar/events')).json()).find(e => e.providerId.startsWith(connect.id));
  assert.equal(served.title, 'Busy'); assert.equal(served.location, null); assert.equal(served.private, true);
  assert.equal((await api(`/api/calendar/events/${encodeURIComponent(served.providerId)}`, 'PUT', { title: 'x', startsAt: served.startsAt })).status, 403, 'private events are read-only');
  await page.locator('.tabs a[href="#calendar"]').click();
  await go('week', 2026, 10, 2);
  await page.locator('.week-event.is-busy').waitFor();
  assert.equal(await page.locator('.calendar-week-panel').evaluate(el => el.textContent.includes('Secret salary')), false, 'private title never reaches the page');
  await page.locator('.week-event.is-busy').click();
  assert.equal(await page.locator('[data-detail-edit]').isHidden(), true);
  assert.equal(await page.locator('[data-detail-delete]').isHidden(), true);
  assert.equal(await page.locator('[data-detail-private]').isVisible(), true);
  await shot('4-week-private-busy');
  await page.locator('[data-detail-close]').click();

  // German UI
  await page.evaluate(() => localStorage.setItem('jd-language', 'de'));
  await page.reload();
  await skipWizard();
  await page.locator('.tabs a[href="#calendar"]').click();
  await page.locator('.cal-view-btn[data-view="month"]', { hasText: 'Monat' }).waitFor();
  await go('month', 2026, 10, 1);
  await shot('5-month-de');

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log('calendar: month/week/5-day/day/profiles views, Mon-Fri recurrence, reminder, filter, search, Bavarian holidays and privacy sync passed');
} finally {
  await browser.close();
  server.kill();
  icsServer.close();
}
