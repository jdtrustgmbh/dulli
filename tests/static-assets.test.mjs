// Static files: compressed when the browser accepts it, identical after decoding, revalidated with ETag (304).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import http from 'node:http';
import vm from 'node:vm';

const port = Number(process.env.STATIC_ASSETS_PORT ?? 4498);
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
// raw http request: fetch() would decode and hide the Content-Encoding
const get = (path, headers = {}) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path, headers }, res => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); }).on('error', reject));
for (let i = 0; i < 50; i++) { try { await get('/api/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
try {
  const original = readFileSync('public/features/tasks-plus.js');
  const plain = await get('/features/tasks-plus.js');
  assert.equal(plain.status, 200); assert.equal(plain.headers['content-encoding'], undefined, 'no compression unless the browser asks for it');
  assert.deepEqual(plain.body, original);
  const br = await get('/features/tasks-plus.js', { 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(br.headers['content-encoding'], 'br'); assert.deepEqual(brotliDecompressSync(br.body), original);
  assert.ok(br.body.length < original.length / 2, `brotli is much smaller: ${br.body.length} vs ${original.length}`);
  const gz = await get('/features/tasks-plus.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip'); assert.deepEqual(gunzipSync(gz.body), original);
  assert.equal(br.headers['cache-control'], 'no-cache'); assert.match(br.headers.vary ?? '', /Accept-Encoding/i);
  const again = await get('/features/tasks-plus.js', { 'Accept-Encoding': 'br', 'If-None-Match': br.headers.etag });
  assert.equal(again.status, 304, 'an unchanged file is answered with 304'); assert.equal(again.body.length, 0);
  const other = await get('/features/tasks-plus.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': br.headers.etag });
  assert.equal(other.status, 200, 'the ETag differs per encoding');
  const png = await get('/assets/brand/dulli-app-icon-192.png', { 'Accept-Encoding': 'br' });
  assert.equal(png.headers['content-encoding'], undefined, 'images are not compressed again');
  // the whole design ships as one stylesheet and one script, glued from the source files
  const css = await get('/dulli.css'); const js = await get('/dulli.js');
  assert.equal(css.status, 200); assert.equal(js.status, 200);
  const cssText = css.body.toString('utf8'); const jsText = js.body.toString('utf8');
  assert.ok(cssText.includes('/* css/foundation.css */') && cssText.includes('/* css/dark.css */') && cssText.indexOf('css/foundation.css') < cssText.indexOf('css/dark.css'), 'stylesheet holds every source in cascade order');
  assert.ok(jsText.includes('/* features/theme-extras.js */') && jsText.includes('/* js/i18n-ui.js */'), 'script holds core and feature files');
  assert.doesNotThrow(() => new vm.Script(jsText), 'the glued script parses');
  const html = readFileSync('public/index.html', 'utf8');
  assert.equal((html.match(/<link rel="stylesheet"/g) ?? []).length, 1, 'index.html links exactly one stylesheet');
  assert.ok(!html.includes('loader.js'), 'no runtime loader any more');
  console.log('static assets: brotli/gzip, ETag and 304 passed');
} finally { server.kill(); }
