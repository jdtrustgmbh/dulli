// Encryption at rest for calendar credentials (OAuth refresh tokens, CalDAV passwords, ICS URLs that may be secret links).
// AES-256-GCM. The key comes from CREDENTIALS_KEY, or from a random key file next to the state file (data volume), so a
// copy of the database alone does not reveal the credentials. The IV is derived from the plaintext (HMAC), which keeps
// serialization deterministic: unchanged households are not rewritten on every save.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PREFIX = 'enc:v1:';
let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;
  if (process.env.CREDENTIALS_KEY) { cachedKey = createHash('sha256').update(process.env.CREDENTIALS_KEY).digest(); return cachedKey; }
  const file = resolve(dirname(resolve(process.env.STATE_FILE || 'data/state.json')), 'credentials.key');
  if (existsSync(file)) cachedKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  if (!cachedKey || cachedKey.length !== 32) {
    cachedKey = randomBytes(32);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, cachedKey.toString('base64'), { mode: 0o600 });
  }
  return cachedKey;
}

export function sealCredential(value) {
  if (value === undefined || value === null) return value;
  const key = loadKey(); const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const iv = createHmac('sha256', key).update(plain).digest().subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

// Plaintext values (saved before encryption existed) pass through unchanged and are encrypted on the next save.
export function openCredential(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
}
