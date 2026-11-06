// Link previews: public pages carry Open Graph / Twitter tags with an absolute image URL; internal pages do not.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = Number(process.env.OG_PORT ?? 4497); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '', SIGNUP_CODE: 'test-code' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
try {
  const image = `https://dulli.example/assets/brand/dulli-og-1200x630.png`;
  for (const path of ['/login', '/signup', '/join', '/app']) {
    const html = await (await fetch(base + path, { headers: { 'x-forwarded-host': 'dulli.example', 'x-forwarded-proto': 'https' } })).text();
    assert.ok(html.includes(`<meta property="og:image" content="${image}">`), `${path}: absolute og:image`);
    assert.equal((html.match(/property="og:image"/g) ?? []).length, 1, `${path}: og:image only once`);
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'), `${path}: twitter:card`);
    assert.ok(/property="og:title" content="[^"]+"/.test(html), `${path}: og:title`);
    assert.ok(/property="og:description" content="[^"]+"/.test(html), `${path}: og:description`);
  }
  for (const path of ['/styleguide']) assert.ok(!(await (await fetch(base + path)).text()).includes('og:image'), `${path}: internal page has no preview tags`);
  const png = await fetch(base + '/assets/brand/dulli-og-1200x630.png'); assert.equal(png.status, 200); assert.equal(png.headers.get('content-type'), 'image/png');
  console.log('og-image: preview tags on all public pages passed');
} finally { server.kill(); }
