// App shell: sidebar order/icons, clock title, topbar actions, sync + add FAB, default landing on Calendar.
(() => {
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14" r=".6"/><circle cx="12" cy="14" r=".6"/><circle cx="15.5" cy="14" r=".6"/>'),
    school: svg('<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.5M21.5 9.5V15"/>'),
    tasks: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r=".8"/>'),
    treasures: svg('<path d="M4 11V8a8 8 0 0 1 16 0v3"/><rect x="3" y="11" width="18" height="9" rx="2"/><path d="M3 14.5h18M12 13v4"/>'),
    meals: svg('<path d="M12 7.5c-1.2-1.3-3-1.6-4.6-.8C5 7.8 4 10.3 4.6 13c.6 2.8 2.4 5.5 4.4 5.5 1.2 0 1.7-.6 3-.6s1.8.6 3 .6c2 0 3.8-2.7 4.4-5.5.6-2.7-.4-5.2-2.8-6.3-1.6-.8-3.4-.5-4.6.8z"/><path d="M12 7.5c0-2 .8-3.4 2.4-4"/>'),
    lists: svg('<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3.5h6v3H9zM9 11h6M9 15h4"/>'),
    more: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
    sync: svg('<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5M20 20v-4.5h-4.5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20.5a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z"/>'),
    group: svg('<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5"/><circle cx="17" cy="10" r="2.3"/><path d="M16.5 14.6c2.3 0 3.6 1.2 4 3.6"/>')
  };
  const LABELS = { calendar: 'Calendar', school: 'School', tasks: 'Tasks', treasures: 'Treasures', meals: 'Meals', lists: 'Lists', more: 'Manage' };
  window.jdI18nExtend?.({ 'Treasures': 'Schätze', 'Meals': 'Essen', 'Manage': 'Verwalten' });

  // Connected calendars (Google/Outlook/ICS) are pulled on open, on the sync button and every 10 minutes while the app is visible.
  // One request at a time: callers that arrive while a sync is running wait for that same run and get its result.
  let inflight = null; let lastSync = 0;
  function syncProviders(force = false) {
    if (inflight) return inflight;
    if (!force && Date.now() - lastSync < 2 * 60 * 1000) return Promise.resolve(null);
    lastSync = Date.now();
    inflight = (async () => {
      try {
        const response = await fetch('/api/providers/sync-all', { method: 'POST' });
        if (!response.ok) return { error: true };
        const results = await response.json();
        window.jdRefreshCalendarWeek?.(); window.__jdSchedule?.();
        return { results };
      } catch { return { error: true, offline: true }; } finally { inflight = null; }
    })();
    return inflight;
  }
  setTimeout(() => syncProviders(), 1500);
  setInterval(() => { if (document.visibilityState === 'visible') syncProviders(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncProviders(); });

  let toastTimer = 0;
  function toast(text) {
    let el = document.querySelector('.jd-toast');
    if (!el) { el = document.createElement('div'); el.className = 'jd-toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = window.jdT?.(text) ?? text; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  const syncMessage = outcome => {
    if (!outcome || outcome.error) return outcome?.offline ? 'Offline - showing stored data' : 'Sync failed - try again';
    if (outcome.results.some(item => item.error === 'reauth_required')) return 'Calendar access expired - reconnect it in Settings';
    const failed = outcome.results.filter(item => item.error).length; const total = outcome.results.reduce((sum, item) => sum + (item.count ?? 0), 0);
    if (!outcome.results.length) return 'Up to date';
    return failed ? `${failed} of ${outcome.results.length} calendars could not be synced` : `Calendars updated · ${total} events`;
  };
  window.jdI18nExtend?.({ 'Calendar access expired - reconnect it in Settings': 'Kalender-Zugriff abgelaufen - in den Einstellungen neu verbinden', 'Up to date': 'Alles aktuell', 'Sync failed - try again': 'Abgleich fehlgeschlagen - bitte erneut versuchen', 'Offline - showing stored data': 'Offline - gespeicherte Daten werden angezeigt' });

  const toolButton = name => document.querySelector(`.tool-grid [data-tool="${name}"]`);
  const openTool = name => { const b = toolButton(name); if (b) b.click(); else document.querySelector('.tabs a[href="#more"]')?.click(); };
  const setActive = href => document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
  const syncBody = () => document.body.classList.toggle('jd-view-today', !location.hash || location.hash === '#today');

  function buildNav() {
    const tabs = document.querySelector('.tabs');
    if (!tabs || tabs.dataset.shell) return false;
    tabs.dataset.shell = '1';
    const anchor = key => tabs.querySelector(`a[href="#${key}"]`);
    const make = (key, tool) => {
      const a = document.createElement('a'); a.href = `#${key}`;
      a.innerHTML = '<span class="tab-icon" aria-hidden="true"></span><span class="tab-label"></span>';
      a.addEventListener('click', e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const today = document.querySelector('.today-grid'); if (today) today.hidden = true;
        const module = document.querySelector('.module-view'); if (module) module.hidden = true;
        document.querySelector('.shell')?.classList.remove('shell-wide');
        setActive(`#${key}`); history.replaceState(null, '', `#${key}`); openTool(tool); setTimeout(syncBody, 30);
        document.body.classList.remove('jd-view-today');
      }, true);
      return a;
    };
    const order = ['calendar', 'school', 'tasks', 'treasures', 'meals', 'lists', 'today', 'more'];
    const items = { treasures: anchor('treasures') ?? make('treasures', 'Rewards'), meals: anchor('meals') ?? make('meals', 'Meals') };
    for (const key of order) { const a = anchor(key) ?? items[key]; if (a) tabs.append(a); }
    for (const key of Object.keys(LABELS)) {
      const a = anchor(key) ?? items[key]; if (!a) continue;
      a.querySelector('.tab-icon').innerHTML = ICONS[key];
      a.querySelector('.tab-label').textContent = LABELS[key];
    }
    const spacer = document.createElement('div'); spacer.className = 'tabs-spacer';
    const sync = document.createElement('button'); sync.type = 'button'; sync.className = 'tabs-sync'; sync.setAttribute('aria-label', 'Refresh'); sync.innerHTML = ICONS.sync;
    const runSync = async () => {
      if (sync.classList.contains('spin')) return;
      sync.classList.add('spin'); sync.setAttribute('aria-busy', 'true');
      let outcome = null; const minSpin = new Promise(resolve => setTimeout(resolve, 900)); // fast syncs still show one full turn
      try { await fetch('/api/sync', { method: 'POST' }); outcome = await syncProviders(true); await window.jdExtras?.reload?.(); } catch { outcome = { error: true, offline: true }; }
      await minSpin; sync.classList.remove('spin'); sync.removeAttribute('aria-busy');
      window.jdRefreshCalendarWeek?.(); window.__jdSchedule?.();
      const text = syncMessage(outcome); const reauth = outcome?.results?.some(item => item.error === 'reauth_required'); const failedCount = outcome?.results?.filter(item => item.error).length ?? 0;
      if (reauth) { toast(text); return; }
      toast(text.includes('Calendars updated') && window.jdLanguage?.() === 'de' ? `Kalender aktualisiert · ${outcome.results.reduce((sum, item) => sum + (item.count ?? 0), 0)} Termine` : failedCount && window.jdLanguage?.() === 'de' ? `${failedCount} von ${outcome.results.length} Kalendern konnten nicht abgeglichen werden` : text);
    };
    sync.addEventListener('click', runSync); window.jdSyncNow = runSync;
    const fab = document.createElement('button'); fab.type = 'button'; fab.className = 'tabs-fab'; fab.setAttribute('aria-label', 'Add'); fab.innerHTML = '<span>+</span>';
    fab.addEventListener('click', () => document.querySelector('[data-open-capture]')?.click());
    tabs.append(spacer, sync, fab);
    return true;
  }

  let householdName = 'Familie';
  const updateClock = () => {
    const el = document.querySelector('.clock-title'); if (!el) return;
    const now = new Date(); const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    el.innerHTML = `<b>${t}</b><i>|</i><b data-i18n-skip></b>`; el.querySelector('[data-i18n-skip]').textContent = householdName;
  };

  function buildTopbar() {
    const top = document.querySelector('.topbar'); if (!top || top.dataset.shell) return false;
    top.dataset.shell = '1';
    const title = document.createElement('a'); title.className = 'clock-title'; title.href = '#today'; title.setAttribute('aria-label', 'Today');
    top.querySelector('.brand')?.after(title);
    const right = document.createElement('div'); right.className = 'topbar-right';
    const avatars = document.querySelector('.avatar-row'); if (avatars) right.append(avatars);
    const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'topbar-icon'; gear.setAttribute('aria-label', 'Settings'); gear.innerHTML = ICONS.gear; gear.addEventListener('click', () => openTool('Settings'));
    right.append(gear); top.append(right);
    title.addEventListener('click', e => { e.preventDefault(); document.querySelector('.tabs a[href="#today"]')?.click(); });
    fetch('/api/household/demo').then(r => r.json()).then(h => { if (h?.name) householdName = h.name; updateClock(); }).catch(() => {});
    updateClock(); setInterval(updateClock, 20000);
    return true;
  }

  document.addEventListener('click', e => { if (e.target.closest('.tabs a, .clock-title')) setTimeout(syncBody, 30); }, true);

  // Calendar: header avatars act as the profile filter (the toolbar chips stay as hidden state holders).
  const calendarActive = () => Boolean(document.querySelector('.shell.shell-wide:not([hidden]) .cal-profile-chip'));
  const syncAvatarFilter = () => {
    const chips = document.querySelectorAll('.topbar .avatar-row .avatar-chip');
    const on = calendarActive();
    chips.forEach(chip => {
      const state = on ? document.querySelector(`.cal-profile-chip[data-member="${CSS.escape(chip.title)}"]`) : null;
      chip.classList.toggle('is-off', Boolean(state) && state.getAttribute('aria-pressed') === 'false');
      if (on) chip.setAttribute('aria-pressed', String(!chip.classList.contains('is-off')));
      else chip.removeAttribute('aria-pressed');
    });
  };
  document.addEventListener('click', e => {
    const chip = e.target.closest('.topbar .avatar-row .avatar-chip');
    if (!chip || !calendarActive()) return;
    document.querySelector(`.cal-profile-chip[data-member="${CSS.escape(chip.title)}"]`)?.click();
    setTimeout(syncAvatarFilter, 50);
  });
  setInterval(syncAvatarFilter, 600);

  let landed = false;
  const init = () => {
    const navDone = buildNav(); const topDone = buildTopbar();
    if (!landed && document.querySelector('.tabs a[href="#calendar"]')) {
      landed = true;
      let first = true; try { first = !sessionStorage.getItem('jd-landed'); sessionStorage.setItem('jd-landed', '1'); } catch { /* storage blocked */ }
      const hash = location.hash || '#today';
      const target = hash === '#today' ? (first ? '#calendar' : null) : (['#calendar', '#tasks', '#lists', '#school'].includes(hash) ? hash : null);
      if (target) {
        let tries = 0; const go = () => { if (window.jdOpenCalendarWeek || tries++ > 40) document.querySelector(`.tabs a[href="${target}"]`)?.click(); else setTimeout(go, 100); }; go();
      }
      syncBody();
    }
    return navDone || topDone;
  };
  init();
  if (window.__jdRegisterEnhancer) window.__jdRegisterEnhancer(init); else setTimeout(init, 300);
})();

// Night mode: keep open tabs in sync when the setting changes elsewhere (API: window.jdTheme, inline head script).
window.addEventListener('storage', event => { if (event.key === 'jd-theme') window.jdTheme?.apply?.(); });
