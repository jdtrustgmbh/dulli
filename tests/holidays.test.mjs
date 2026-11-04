// Known-date checks for public/features/holidays.js (offline German/Austrian public holiday calculation).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sandbox = { window: {} };
vm.runInNewContext(await readFile(new URL('../public/features/holidays.js', import.meta.url), 'utf8'), sandbox);
const { forRange, easter } = sandbox.window.jdHolidays;
const year = (code, y = 2026) => forRange(`${y}-01-01`, `${y + 1}-01-01`, code);
const has = (code, date, name) => year(code, Number(date.slice(0, 4))).some(item => item.date === date && (!name || item.name === name));

for (const [y, date] of [[2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2030, '2030-04-21']]) assert.equal(easter(y), date, `Easter ${y}`);

assert.ok(has('BY', '2026-04-03', 'Karfreitag'));
assert.ok(has('BY', '2026-04-06', 'Ostermontag'));
assert.ok(has('BY', '2026-05-14', 'Christi Himmelfahrt'));
assert.ok(has('BY', '2026-05-25', 'Pfingstmontag'));
assert.ok(has('BB', '2026-05-24', 'Pfingstsonntag'));
assert.ok(!has('BY', '2026-05-24'), 'Whit Sunday is only a public holiday in Brandenburg');

const corpusChristi = ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'];
for (const code of Object.keys(sandbox.window.jdHolidays.states).filter(c => c !== 'AT')) {
  assert.equal(has(code, '2026-06-04', 'Fronleichnam'), corpusChristi.includes(code), `Fronleichnam in ${code}`);
  assert.equal(has(code, '2026-10-31', 'Reformationstag'), ['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(code), `Reformationstag in ${code}`);
  assert.ok(has(code, '2026-10-03', 'Tag der Deutschen Einheit'), `Unity day in ${code}`);
}
assert.ok(has('SN', '2026-11-18', 'Buß- und Bettag'));
assert.ok(has('NW', '2017-10-31', 'Reformationstag'), '2017: Reformation Day was nationwide');
assert.ok(has('BE', '2026-03-08', 'Internationaler Frauentag'));
assert.ok(has('TH', '2026-09-20', 'Weltkindertag'));
assert.ok(has('AT', '2026-10-26', 'Nationalfeiertag'));
assert.ok(has('AT', '2026-12-08', 'Mariä Empfängnis'));
assert.equal(forRange('2026-01-01', '2027-01-01', '').length, 0, 'no region -> no holidays');
assert.equal(forRange('2026-12-24', '2027-01-02', 'BY').map(item => item.date).join(), '2026-12-25,2026-12-26,2027-01-01', 'range spans years');
assert.equal(forRange('2026-12-24', '2026-12-25', 'BY').length, 0, 'range end is exclusive');
assert.equal(forRange(new Date(2026, 3, 1), new Date(2026, 3, 30), 'BY', { lang: 'en' })[0].name, 'Good Friday');
console.log(`holidays: Easter, national and state-specific holidays passed (BY 2026: ${year('BY').length} days)`);
