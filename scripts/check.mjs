// Syntax check (node --check) for every JavaScript file of the project.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
const files = ['server', 'public', 'tests', 'scripts'].flatMap(walk).filter(file => /\.(m?js)$/.test(file));
let failed = 0;
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status !== 0) { failed++; console.error(result.stderr); } }
console.log(failed ? `${failed} file(s) with syntax errors` : `check: ${files.length} files OK`);
process.exit(failed ? 1 : 0);
