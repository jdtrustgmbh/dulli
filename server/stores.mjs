// In-memory household stores: reminders, rewards/meals/school ledger and quick-capture parsing.
// --- reminders ---
export function createReminderStore() {
  const reminders = new Map();
  return {
    upsert({ id, kind, dueAt, offsetMinutes = 15, member = 'household' }) { const value = { id, kind, dueAt, offsetMinutes, member, dismissed: false }; reminders.set(id, value); return value; },
    dismiss(id) { const reminder = reminders.get(id); if (reminder) reminder.dismissed = true; return reminder; },
    snooze(id, minutes = 10) { const reminder = reminders.get(id); if (!reminder) return undefined; reminder.dueAt = new Date(new Date(reminder.dueAt).getTime() + minutes * 60000).toISOString(); reminder.dismissed = false; return reminder; },
    due(now = new Date()) { return [...reminders.values()].filter(reminder => !reminder.dismissed && new Date(reminder.dueAt) <= now); },
    all() { return [...reminders.values()]; }
  };
}

// --- optional-modules ---
export function createOptionalModules() {
  const rewardLedger = []; const meals = []; const school = [];
  const balance = member => rewardLedger.filter(entry => entry.member === member).reduce((total, entry) => total + entry.points, 0);
  return {
    award(member, points = 1, reason = 'completed responsibility', id = `reward-${Date.now()}-${rewardLedger.length}`) { const entry = { id, member, points: Number(points), reason, kind: 'earn', at: new Date().toISOString() }; rewardLedger.push(entry); return { ...entry, balance: balance(member) }; },
    leaderboard() { return [...new Set(rewardLedger.map(entry => entry.member))].map(member => ({ member, points: balance(member) })).sort((a, b) => b.points - a.points); },
    ledger() { return rewardLedger.map(entry => ({ ...entry, balance: balance(entry.member) })); },
    redeem(member, reward, cost, id = `redemption-${Date.now()}-${rewardLedger.length}`) { if (balance(member) < Number(cost)) throw new Error('INSUFFICIENT_REWARD_BALANCE'); const entry = { id, member, points: -Number(cost), reason: `redemption: ${reward}`, kind: 'redeem', status: 'pending_approval', at: new Date().toISOString() }; rewardLedger.push(entry); return { ...entry, balance: balance(member) }; },
    addMeal({ day, title, servings = 1, ingredients = '', notes = '' }) { const meal = { day, title, servings, ingredients, notes }; meals.push(meal); return meal; }, meals() { return [...meals]; },
    addSchoolEntry({ child, weekday = 'Monday', title, startsAt, room = '', recurring = false, id = `school-${Date.now()}-${school.length}` }) { const entry = { id, child, weekday, title, startsAt, room, recurring }; school.push(entry); return entry; }, school() { return [...school]; },
    updateSchoolEntry(id, patch) { const entry = school.find(item => item.id === id); if (!entry) return null; Object.assign(entry, patch); return entry; },
    deleteSchoolEntry(id) { const index = school.findIndex(item => item.id === id); if (index === -1) return false; school.splice(index, 1); return true; }
  };
}

// --- smart-capture ---
export function parseCapture(input) {
  const value = String(input ?? '').trim(); if (!value) return null;
  const lower = value.toLowerCase(); const type = lower.startsWith('buy ') || lower.includes(' einkaufen') ? 'List item' : lower.startsWith('event:') || lower.includes(' um ') ? 'Event' : 'Task';
  return { type, value: value.replace(/^event:\s*/i, '').trim(), confidence: type === 'Task' ? 0.62 : 0.82, requiresConfirmation: true };
}
