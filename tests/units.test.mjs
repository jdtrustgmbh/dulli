// Unit tests for the small in-memory server modules (no server, no browser).
import assert from 'node:assert/strict';
import { createReminderStore, createOptionalModules, parseCapture } from '../server/stores.mjs';
import { providerCapabilities } from '../server/calendar-providers.mjs';

const reminders = createReminderStore();
reminders.upsert({ id: 'r1', kind: 'task', dueAt: new Date(0).toISOString() });
assert.equal(reminders.due(new Date(1)).length, 1);
reminders.dismiss('r1');
assert.equal(reminders.due(new Date(1)).length, 0);
console.log('units: reminder lifecycle passed');

assert.equal(parseCapture('Buy oat milk').type, 'List item');
assert.equal(providerCapabilities('google').write, true);
assert.equal(providerCapabilities('ics').write, false);
assert.equal(providerCapabilities('unknown').auth, 'none');
console.log('units: smart capture and provider capability matrix passed');

const optional = createOptionalModules();
optional.award('Alex', 2, 'task', 'reward-1');
optional.award('Jordan', 10, 'task', 'reward-2');
const redemption = optional.redeem('Jordan', 'Movie night', 5, 'redeem-1');
assert.equal(redemption.balance, 5);
assert.equal(optional.ledger().length, 3);
assert.throws(() => optional.redeem('Alex', 'Too expensive', 50), /INSUFFICIENT_REWARD_BALANCE/);
console.log('units: reward ledger passed');
