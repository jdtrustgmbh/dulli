import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = 4322;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
for (let attempt = 0; attempt < 30; attempt++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await loginBrowserContext(context, `http://127.0.0.1:${port}`);
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/app`, { waitUntil: 'domcontentloaded' });
const wizardSkip = page.locator('[data-wizard-skip-all]');
try { await wizardSkip.waitFor({ timeout: 2000 }); await wizardSkip.click(); await page.waitForFunction(() => !document.querySelector('#wizard-dialog')); } catch {}
// Styles are loaded by the feature loader after DOMContentLoaded: measure only once they are in (slower machines such as CI runners need a moment).
await page.waitForFunction(() => [...document.querySelectorAll('button, a, select')].every(element => { const box = element.getBoundingClientRect(); return !(box.width > 0 && box.height > 0 && (box.width < 40 || box.height < 40)); }), null, { timeout: 8000 }).catch(() => {});
const unnamed = await page.locator('button, a, input, select').evaluateAll(elements => elements.filter(element => {
  if (element.matches('input, select')) return !(element.getAttribute('aria-label') || element.getAttribute('id') || element.labels?.length);
  return !(element.getAttribute('aria-label') || element.textContent?.trim());
}).map(element => element.outerHTML));
assert.deepEqual(unnamed, []);
const invalidLinks = await page.locator('a').evaluateAll(links => links.filter(link => !link.getAttribute('href')).map(link => link.outerHTML));
assert.deepEqual(invalidLinks, []);
const touchTargets = await page.locator('button, a, select').evaluateAll(elements => elements.filter(element => {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && (box.width < 40 || box.height < 40);
}).map(element => ({ tag: element.tagName, text: element.textContent?.trim(), class: element.className, size: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`, parent: element.parentElement?.className })));
assert.deepEqual(touchTargets, []);
  const capture = page.locator('.tabs-fab');
await capture.focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#capture-dialog').getAttribute('open'), '');
await page.keyboard.press('Escape'); assert.equal(await page.locator('#capture-dialog').getAttribute('open'), null);
console.log('accessibility: names, links and touch targets passed');
await page.close(); await browser.close(); server.kill();
