import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginCookie } from './helpers/auth.mjs';
const port = 4326;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
try {
  for (let attempt = 0; attempt < 30; attempt++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  const cookie = await loginCookie(`http://127.0.0.1:${port}`);
  const req = (path, opts = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...opts, headers: { ...(opts.headers ?? {}), Cookie: cookie } });
  const create = await req('/api/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Errands' }) }); assert.equal(create.status, 201);
  const lists = await (await req('/api/lists')).json(); assert.ok(lists.some(list => list.name === 'Errands'));
  const item = await req('/api/lists/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Pick up parcel', listName: 'Errands' }) }); assert.equal(item.status, 201); const created = await item.json(); assert.equal(created.listName, 'Errands');
  const filtered = await (await req('/api/lists/items?list=Errands')).json(); assert.ok(filtered.some(value => value.id === created.id));
  const other = await (await req('/api/lists/items?list=Weekend%20groceries')).json(); assert.equal(other.some(value => value.id === created.id), false);
  console.log('lists: named list creation, assignment and filtering passed');
} finally { server.kill(); }
