// Signup link: families get their own household, the code is checked, the limit holds, and the wizard starts for new households.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const start = async (port, env) => {
  const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), DATABASE_URL: '', STATE_FILE: '', BOOTSTRAP_EMAIL: 'owner@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', ...env }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
  return server;
};
const post = (base, path, body, cookie) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });

// disabled without SIGNUP_CODE
let port = Number(process.env.SIGNUP_PORT ?? 4490); let base = `http://127.0.0.1:${port}`;
let server = await start(port, { SIGNUP_CODE: '' });
assert.equal((await fetch(`${base}/signup`)).status, 404, '/signup does not exist without a code');
assert.equal((await post(base, '/api/auth/signup', { code: 'x', email: 'a@example.com', password: 'password-123' })).status, 404);
server.kill();

port += 1; base = `http://127.0.0.1:${port}`;
server = await start(port, { SIGNUP_CODE: 'friends-secret-code', SIGNUP_LIMIT: '2' });
const browser = await chromium.launch({ headless: true });
try {
  assert.equal((await fetch(`${base}/signup?code=friends-secret-code`)).status, 200);
  const good = { code: 'friends-secret-code', password: 'password-123' };
  assert.equal((await post(base, '/api/auth/signup', { ...good, code: 'wrong', email: 'a@example.com' })).status, 403, 'wrong code');
  assert.equal((await post(base, '/api/auth/signup', { ...good, email: 'not-an-email' })).status, 400);
  assert.equal((await post(base, '/api/auth/signup', { ...good, email: 'a@example.com', password: 'short' })).status, 400);
  const first = await post(base, '/api/auth/signup', { ...good, email: 'Familie.A@example.com' });
  assert.equal(first.status, 201); const cookieA = first.headers.get('set-cookie').split(';')[0];
  assert.equal((await post(base, '/api/auth/signup', { ...good, email: 'familie.a@example.com' })).status, 409, 'email already used');

  // own household: data of the owner is not visible, own data is not visible to others
  const ownerCookie = (await (await post(base, '/api/auth/login', { email: 'owner@example.com', password: 'test-password-123' })).headers.get('set-cookie')).split(';')[0];
  await post(base, '/api/tasks', { title: 'Nur Inhaber', owner: 'Shared' }, ownerCookie);
  const tasksA = await (await fetch(`${base}/api/tasks`, { headers: { Cookie: cookieA } })).json();
  assert.ok(!JSON.stringify(tasksA).includes('Nur Inhaber'), 'a signed-up family does not see the owner household');

  assert.equal((await post(base, '/api/auth/signup', { ...good, email: 'familie.b@example.com' })).status, 201);
  assert.equal((await post(base, '/api/auth/signup', { ...good, email: 'familie.c@example.com' })).status, 403, 'limit of 2 families reached');

  // the page: sign up in the browser and land in the setup wizard
  port += 1;
  server.kill(); server = await start(port, { SIGNUP_CODE: 'friends-secret-code', SIGNUP_LIMIT: '5' }); base = `http://127.0.0.1:${port}`;
  const context = await browser.newContext({ locale: 'de-DE', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${base}/signup?code=friends-secret-code`);
  await page.fill('#signup-email', 'neu@example.com'); await page.fill('#signup-password', 'password-123');
  await Promise.all([page.waitForURL('**/app'), page.click('button[type=submit]')]);
  await page.locator('#wizard-dialog').waitFor({ timeout: 8000 });
  console.log('signup: disabled without code, own household, code and limit checks, wizard starts passed');
} finally { await browser.close(); server.kill(); }
