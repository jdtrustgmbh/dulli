// Runs every test script (npm run test:*) one after another and prints a summary. Needs: npm ci && npx playwright install chromium
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts).filter(name => name.startsWith('test:') && !['test:all', 'test:postgres', 'test:postgres-tenancy'].includes(name));
const failed = [];
for (const name of scripts) {
  console.log(`\n=== npm run ${name} ===`);
  const result = spawnSync(`npm run ${name}`, { stdio: 'inherit', shell: true });
  if (result.status !== 0) failed.push(name);
}
console.log(failed.length ? `\n${failed.length} of ${scripts.length} test groups failed: ${failed.join(', ')}` : `\nAll ${scripts.length} test groups passed.`);
process.exit(failed.length ? 1 : 0);
