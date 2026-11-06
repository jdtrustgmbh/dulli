// Dropdown component: every single-choice select shows a chevron on the right, in every component that styles its own select, in both themes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = Number(process.env.DROPDOWN_PORT ?? 4496); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }

// Containers whose own rules style a select (box, background, padding): the chevron must survive all of them.
const CONTEXTS = ['.cal-editor .jd-field', '.jd-task-form .jd-field', '.mp-dialog .jd-field', '.tr-custom-form', '.hub-card', '.members-panel .member-form', '.school-panel', '.settings-panel', 'dialog', '.jd-more', '.jd-field', '.language-row'];
const browser = await chromium.launch({ headless: true });
try {
  for (const page of ['/styleguide', '/login']) for (const dark of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'block' });
    await context.addInitScript(isDark => { try { if (isDark) localStorage.setItem('jd-theme', 'dark'); } catch { /* ignore */ } }, dark);
    const tab = await context.newPage();
    await tab.goto(base + page); await tab.addStyleTag({ url: base + '/dulli.css' }); await tab.waitForTimeout(300); // the app stylesheet too, so the component rules that style selects are present
    const rows = await tab.evaluate(contexts => {
      const results = [];
      for (const selector of [null, ...contexts]) {
        const holder = document.createElement('div');
        let parent = holder; let host = holder;
        if (selector) { const parts = selector.split(' ').reverse(); host = null; for (const part of parts.reverse()) { const element = document.createElement(part.startsWith('.') ? 'div' : part.replace(/\..*/, '')); const classes = part.split('.').slice(1); classes.forEach(name => element.classList.add(name)); (host ?? holder).append(element); host = element; } }
        const select = document.createElement('select'); select.innerHTML = '<option>Test</option>'; (host ?? holder).append(select);
        document.body.append(holder);
        const style = getComputedStyle(select);
        results.push({ selector: selector ?? '(plain)', arrow: style.backgroundImage.includes('svg'), plain: style.appearance === 'none', room: parseFloat(style.paddingRight) >= 40, position: style.backgroundPosition });
        holder.remove();
      }
      return results;
    }, CONTEXTS);
    for (const row of rows) { assert.ok(row.arrow && row.plain && row.room, `${page} ${dark ? 'dark' : 'light'}: select in "${row.selector}" shows the chevron (${JSON.stringify(row)})`); }
    // The two documented opt-outs keep the native look.
    const optOut = await tab.evaluate(() => { const make = html => { const holder = document.createElement('div'); holder.innerHTML = html; document.body.append(holder); const style = getComputedStyle(holder.firstChild); const out = style.backgroundImage.includes('svg'); holder.remove(); return out; }; return [make('<select multiple><option>a</option></select>'), make('<select class="jd-raw"><option>a</option></select>')]; });
    assert.deepEqual(optOut, [false, false], 'multiple selects and .jd-raw have no chevron');
    await context.close();
  }
  console.log('dropdown: chevron on every single-choice select, both themes, all component contexts passed');
} finally { await browser.close(); server.kill(); }
