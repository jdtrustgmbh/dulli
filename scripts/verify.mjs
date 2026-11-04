// Fast confidence check before a commit: syntax, unit tests, HTTP API, core flows and the static contracts below.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const need = (file, ...parts) => { const text = readFileSync(file, 'utf8'); for (const part of parts) if (!text.includes(part)) throw new Error(`${file} is missing "${part}"`); };
need('docker-compose.yml', 'POSTGRES_PASSWORD', 'postgres:16', 'DATABASE_URL: postgresql://');
need('.env.example', 'POSTGRES_PASSWORD=', 'CREDENTIALS_KEY=');
need('public/display.html', '/api/calendar/events', '/api/tasks');
need('public/js/navigation.js', 'history.replaceState', 'data-open-capture');
if (readFileSync('public/js/calendar-ui.js', 'utf8').includes('setInterval(enhance')) throw new Error('calendar UI must not poll the DOM continuously');

const steps = ['check', 'test', 'test:http', 'test:lists', 'test:rewards', 'test:a11y', 'test:persistence', 'test:deletion', 'test:performance'];
for (const step of steps) {
  console.log(`\n=== npm run ${step} ===`);
  if (spawnSync(`npm run ${step}`, { stdio: 'inherit', shell: true }).status !== 0) throw new Error(`${step} failed`);
}
console.log('\nverify: all checks passed');
