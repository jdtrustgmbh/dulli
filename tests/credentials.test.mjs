// Stored calendar credentials are encrypted at rest (AES-256-GCM) and plaintext from older saves still loads.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jd-secrets-'));
process.env.STATE_FILE = join(dir, 'state.json'); delete process.env.CREDENTIALS_KEY;

// --- encryption ---
const { sealCredential, openCredential } = await import('../server/secrets.mjs');
const { createHouseholdBundle, serializeBundle, deserializeBundle } = await import('../server/tenancy.mjs');
const bundle = createHouseholdBundle('h1');
bundle.providerTokens.set('c1', { caldav: true, url: 'https://caldav.example.com', username: 'anna', password: 'hunter2-secret' });
bundle.providerTokens.set('c2', { accessToken: 'ya29.access', refreshToken: '1//refresh-token-secret', expiresAt: 1 });
bundle.providerIcsUrls.set('c3', 'https://calendar.example.com/private/abc123secret.ics');
const saved = JSON.parse(JSON.stringify(serializeBundle(bundle)));
const text = JSON.stringify(saved);
for (const secret of ['hunter2-secret', 'ya29.access', 'refresh-token-secret', 'abc123secret']) assert.ok(!text.includes(secret), `${secret} must not appear in the saved payload`);
assert.ok(saved.providerTokens[0][1].startsWith('enc:v1:'));
assert.equal(JSON.stringify(serializeBundle(bundle)), JSON.stringify(serializeBundle(bundle)), 'serialization is deterministic (no needless rewrites)');
const restored = deserializeBundle('h1', saved);
assert.equal(restored.providerTokens.get('c1').password, 'hunter2-secret'); assert.equal(restored.providerTokens.get('c2').refreshToken, '1//refresh-token-secret'); assert.equal(restored.providerIcsUrls.get('c3'), 'https://calendar.example.com/private/abc123secret.ics');
const legacy = deserializeBundle('h2', { providerTokens: [['x', { accessToken: 'plain' }]], providerIcsUrls: [['y', 'https://old.example.com/a.ics']] });
assert.equal(legacy.providerTokens.get('x').accessToken, 'plain', 'plaintext saved before encryption still loads');
assert.equal(legacy.providerIcsUrls.get('y'), 'https://old.example.com/a.ics');
const sealed = sealCredential('hello'); const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
assert.throws(() => openCredential(tampered), 'tampered ciphertext is rejected');
assert.match(readFileSync(join(dir, 'credentials.key'), 'utf8').trim(), /^[A-Za-z0-9+/=]{44}$/, 'a key file is created next to the state file');

console.log('credentials: credentials encrypted at rest passed');
