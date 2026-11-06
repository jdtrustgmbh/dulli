import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = 4324;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
for (let attempt = 0; attempt < 30; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const context = await browser.newContext({ viewport });
  await loginBrowserContext(context, base);
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.locator('main.shell').waitFor(); // visible = the finished design (the page stays hidden while styles and scripts load)
  assert.ok(Date.now() - started < 4500, `shell load exceeded 4500ms at ${viewport.width}px`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await context.close();
}
await browser.close(); server.kill();
console.log('performance: shell load and horizontal layout passed');
