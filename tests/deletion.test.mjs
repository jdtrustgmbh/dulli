import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginCookie } from './helpers/auth.mjs';

const port = 4324;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const waitForHealth = async () => { for (let attempt = 0; attempt < 40; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('deletion smoke server did not start'); };
try {
  await waitForHealth();
  const cookie = await loginCookie(base);
  const req = (path, opts = {}) => fetch(`${base}${path}`, { ...opts, headers: { ...(opts.headers ?? {}), Cookie: cookie } });
  const task = await req('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'delete-me' }) });
  assert.equal(task.status, 201);
  const exportResponse = await req('/api/household/demo/export');
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  assert.ok(exported.tasks.some(item => item.title === 'delete-me'));
  assert.ok(Array.isArray(exported.listNames));
  assert.equal((await req('/api/household/demo', { method: 'DELETE' })).status, 200);
  assert.equal((await (await req('/api/tasks')).json()).length, 0);
  assert.equal((await fetch(`${base}/api/household/demo`)).status, 401);
  console.log('deletion: household data deletion and access revocation passed');
} finally { server.kill(); }
