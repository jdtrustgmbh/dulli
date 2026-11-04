// Login and invitation pages follow the language preference (jd-language) and can be switched.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = Number(process.env.PUBLIC_I18N_PORT ?? 4479); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const GERMAN = /\b(und|oder|nicht|eure?|euch|jederzeit|kündbar|Aufgaben|Termine|Preise|Anmelden|Passwort|Konto|Familie[n]?alltag|Kalender|Listen|gratis|kostenlos|Einladung|Zahlung)\b/;
const browser = await chromium.launch({ headless: true });
try {
  for (const path of ['/login', '/join?code=abc']) {
    const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('jd-language', 'en'));
    await page.goto(`${base}${path}`);
    await page.waitForSelector('#jd-public-lang button');
    const visible = () => page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && !['SCRIPT', 'STYLE'].includes(n.parentElement.tagName) && !n.parentElement.closest('#jd-public-lang')) out.push(t); } document.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(e => ['alt', 'aria-label', 'title', 'placeholder'].forEach(a => { const v = e.getAttribute(a); if (v && !e.closest('#jd-public-lang')) out.push(v); })); out.push(document.title); return out; });
    // user-visible sample data inside screenshots/mock card is intentionally German names; ignore short proper nouns
    const german = (await visible()).filter(text => GERMAN.test(text));
    assert.deepEqual(german, [], `${path}: German text left in English mode`);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    await page.locator('#jd-public-lang button').click();
    const back = await visible();
    assert.ok(back.some(text => GERMAN.test(text)), `${path}: switching to Deutsch restores German`);
    assert.equal(await page.evaluate(() => localStorage.getItem('jd-language')), 'de');
    await context.close();
  }
  console.log('public-i18n-smoke: login and invitation switch between German and English passed');
} finally { await browser.close(); server.kill(); }
