import { sealCredential, openCredential } from './secrets.mjs';
import { createReminderStore } from './stores.mjs';
import { createOptionalModules } from './stores.mjs';

export function createHouseholdBundle(id, overrides = {}) {
  return {
    household: { id, name: null, members: [], sync: 'healthy', version: 1, updatedAt: new Date().toISOString(), ...overrides },
    invites: [],
    captures: [],
    tasks: [],
    listItems: [],
    photos: [],
    extras: {},
    listNames: new Set(),
    events: new Map(),
    reminders: createReminderStore(),
    optionalModules: createOptionalModules(),
    idempotentCaptures: new Map(),
    idempotentReminders: new Map(),
    idempotentTasks: new Map(),
    idempotentLists: new Map(),
    idempotentEvents: new Map(),
    idempotentRewards: new Map(),
    calendarConnections: [],
    providerTokens: new Map(),
    providerIcsUrls: new Map(),
    oauthStates: new Map(),
    lastClearedListItems: []
  };
}

export function serializeBundle(bundle) {
  return {
    household: bundle.household,
    invites: bundle.invites,
    captures: bundle.captures,
    tasks: bundle.tasks,
    listItems: bundle.listItems,
    photos: bundle.photos,
    extras: bundle.extras,
    school: bundle.optionalModules.school(),
    listNames: [...bundle.listNames],
    events: [...bundle.events],
    calendarConnections: bundle.calendarConnections,
    providerTokens: [...bundle.providerTokens].map(([key, token]) => [key, sealCredential(token)]),
    providerIcsUrls: [...bundle.providerIcsUrls].map(([key, url]) => [key, sealCredential(url)])
  };
}

export function deserializeBundle(id, saved) {
  const bundle = createHouseholdBundle(id, saved.household ?? {});
  bundle.invites.push(...(saved.invites ?? []));
  bundle.captures.push(...(saved.captures ?? []));
  bundle.tasks.push(...(saved.tasks ?? []));
  bundle.listItems.push(...(saved.listItems ?? []));
  bundle.photos.push(...(saved.photos ?? []));
  Object.assign(bundle.extras, saved.extras ?? {});
  bundle.optionalModules.restoreSchool(saved.school);
  (saved.listNames ?? []).forEach(name => bundle.listNames.add(name));
  for (const [key, event] of saved.events ?? []) bundle.events.set(key, event);
  bundle.calendarConnections.push(...(saved.calendarConnections ?? []));
  for (const [key, token] of saved.providerTokens ?? []) bundle.providerTokens.set(key, openCredential(token));
  for (const [key, url] of saved.providerIcsUrls ?? []) bundle.providerIcsUrls.set(key, openCredential(url));

  // Pre-multi-connection saves stored one token/url per provider keyed by the bare provider
  // name ('google'/'outlook'/'ics') and had no calendarConnections list at all. Reusing that
  // bare name as the connection id here means existing event providerIds (already prefixed
  // "google-..." etc) line up with the new "${connectionId}-..." scheme with no rewrite needed.
  const legacyLabels = { google: 'Google Calendar', outlook: 'Outlook Calendar', ics: 'ICS calendar' };
  for (const provider of ['google', 'outlook', 'ics']) {
    if (bundle.calendarConnections.some(connection => connection.id === provider)) continue;
    const hasToken = bundle.providerTokens.has(provider);
    const hasIcsUrl = bundle.providerIcsUrls.has(provider);
    if (!hasToken && !hasIcsUrl) continue;
    bundle.calendarConnections.push({ id: provider, provider, label: legacyLabels[provider], status: 'connected', connectedAt: new Date().toISOString() });
  }
  return bundle;
}
