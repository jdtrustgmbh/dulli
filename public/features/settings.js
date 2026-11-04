// Settings panel (More -> Settings) and the household settings store.
// extras.settings = { hideDoneTasks, showSchool, showTaskCounts, generalTaskList, defaultCalendarView, idleMinutes,
//   quietStart, quietEnd, photoIntervalMin, stateCode, language, timeZone }. Other features read it with defaults:
//   window.jdSettings.get() or ({ ...window.jdSettings.DEFAULTS, ...jdExtras.get('settings', {}) }).
(() => {
  const APP_VERSION = '0.1.0';
  const DEFAULTS = { hideDoneTasks: false, showSchool: true, showTaskCounts: true, generalTaskList: false, defaultCalendarView: 'week', idleMinutes: 15, quietStart: '', quietEnd: '', photoIntervalMin: 5, stateCode: '', language: 'de' };
  const STATES = [['', 'No region (no public holidays)'], ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'], ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'], ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'], ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen']];
  const VIEWS = [['week', 'Week', 'Woche'], ['month', 'Month', 'Monat'], ['5day', '5 days', '5 Tage'], ['day', 'Day', 'Tag'], ['profiles', 'Profiles', 'Profile']];
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const t = text => window.jdT?.(text) ?? text;
  const live = text => { const region = document.querySelector('#live-region'); if (region) region.textContent = t(text); };
  const get = () => ({ ...DEFAULTS, ...(window.jdExtras?.get('settings', {}) ?? {}) });

  // ---- apply settings that this module owns visually ----
  function apply() {
    const value = get();
    document.body.classList.toggle('jd-no-school', value.showSchool === false);
    document.body.classList.toggle('jd-hide-done', Boolean(value.hideDoneTasks));
  }

  let panel;
  async function save(patch) {
    const run = async () => { await window.jdExtras.set('settings', { ...get(), ...patch }); apply(); live('Settings saved'); };
    if (window.jdLock?.isLocked('settings')) { render(); await window.jdLock.guard('settings', run); render(); return; }
    await run();
  }
  const guardSettings = fn => (window.jdLock ? window.jdLock.guard('settings', fn) : fn());

  const sw = (key, label, hint = '') => `<label class="jd-switch"><span><strong>${label}</strong>${hint ? `<small class="muted">${hint}</small>` : ''}</span><input type="checkbox" role="switch" data-setting="${key}" ${get()[key] ? 'checked' : ''}></label>`;
  const select = (key, label, options, value = get()[key]) => `<label class="jd-field">${label}<select data-setting="${key}">${options.map(([v, text]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const timeZones = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [Intl.DateTimeFormat().resolvedOptions().timeZone]; } };

  function render() {
    if (!panel) return;
    const value = get();
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = value.timeZone || deviceZone;
    const moonOn = window.jdMoonEnabled ? window.jdMoonEnabled() : true;
    panel.innerHTML = `<div class="card-heading"><div><p class="eyebrow">SETTINGS</p><h2>Make Dulli fit your home</h2><p class="muted">Changes apply to every device in the household.</p></div><button type="button" class="text-link" data-back-to-more="">‹ More</button></div>
      <div class="jd-settings-grid">
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="sky" aria-hidden="true">${window.jdIcons?.globe ?? ''}</span><span>General</span></h3>
        <label class="jd-field">Language<select data-setting="language"><option value="de" ${window.jdLanguage?.() === 'de' ? 'selected' : ''}>Deutsch</option><option value="en" ${window.jdLanguage?.() === 'en' ? 'selected' : ''}>English</option></select></label>
        <label class="jd-field">Time zone<select data-setting="timeZone">${timeZones().map(name => `<option ${name === zone ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
        <p class="muted jd-small"><span>Device time zone</span>: <span data-i18n-skip>${esc(deviceZone)}</span> · <span data-i18n-skip>${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: zone })}</span></p>
        <label class="jd-switch"><span><strong>Show full and new moon</strong></span><input type="checkbox" role="switch" data-moon ${moonOn ? 'checked' : ''}></label>
        <label class="jd-switch"><span><strong>Night mode</strong><small class="muted">Dark colours for the evening. Applies to this device only.</small></span><input type="checkbox" role="switch" data-night ${window.jdTheme?.get?.() === 'dark' ? 'checked' : ''}></label>
      </section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="rose" aria-hidden="true">${window.jdIcons?.family ?? ''}</span><span>Profiles</span></h3><p class="muted">Name, color, photo and order of each family member.</p>
        <div class="jd-settings-avatars">${(window.jdProfiles ? '<span class="jd-avatars-host"></span>' : '')}</div>
        <button type="button" class="jd-btn" data-open-tool="Family">Manage profiles</button></section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="peach" aria-hidden="true">${window.jdIcons?.palette ?? ''}</span><span>Customize</span></h3>
        ${sw('hideDoneTasks', 'Hide completed tasks')}${sw('showSchool', 'Show school option', 'Shows the School tab.')}${sw('showTaskCounts', 'Show task count per profile')}${sw('generalTaskList', 'General task list', 'Tasks that belong to nobody in particular.')}
        ${select('defaultCalendarView', 'Default calendar view', VIEWS.map(([v, en, de]) => [v, window.jdLanguage?.() === 'de' ? de : en]))}
        ${select('stateCode', 'Region for public holidays', STATES)}
      </section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="lav" aria-hidden="true">${window.jdIcons?.moon ?? ''}</span><span>Quiet times</span></h3>
        ${select('idleMinutes', 'Start after inactivity', [[0, 'Never (off)'], [1, '1 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '60 min']])}
        <div class="jd-row"><label class="jd-field">Quiet window from<input type="time" data-setting="quietStart" value="${esc(value.quietStart)}"></label><label class="jd-field">Quiet window until<input type="time" data-setting="quietEnd" value="${esc(value.quietEnd)}"></label></div>
        <p class="muted jd-small">During the quiet window the screen sleeps (dark, clock only). Touch wakes it.</p>
        ${select('photoIntervalMin', 'Picture mode: change photo every', [[0.25, '15 s'], [1, '1 min'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']])}
        <div class="jd-actions"><button type="button" class="jd-btn primary" data-frame="picture">▶ Start picture mode</button><button type="button" class="jd-btn" data-frame="sleep">☾ Sleep</button><button type="button" class="jd-btn" data-open-tool="Photos">Manage photos</button></div>
      </section>
      <section class="jd-card jd-child-lock-host"><h3><span class="jd-tile-ic" data-tone="sun" aria-hidden="true">${window.jdIcons?.lock ?? ''}</span><span>Child lock</span></h3><div data-child-lock></div></section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="teal" aria-hidden="true">${window.jdIcons?.users ?? ''}</span><span>Who has access?</span></h3><ul class="jd-access-list"><li class="muted">Loading…</li></ul>
        <div class="jd-invite-host" hidden><div class="jd-row"><label class="jd-field">Invite by e-mail (optional)<input type="email" data-invite-email autocomplete="off" placeholder="name@example.com"></label></div>
          <div class="jd-actions"><button type="button" class="jd-btn primary" data-invite>Invite a person</button></div>
          <p class="jd-invite-result" data-invite-result role="status" data-i18n-skip hidden></p></div>
        <p class="muted jd-small" data-access-note>Everyone with an account here sees the same household. Other families' data is kept completely separate.</p>
        <div class="jd-actions"><button type="button" class="jd-btn" data-signout>Sign out on this device</button><button type="button" class="jd-btn" data-signout-all>Sign out on all devices</button></div></section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="mint" aria-hidden="true">${window.jdIcons?.data ?? ''}</span><span>Data</span></h3>
        <div class="jd-actions"><button type="button" class="jd-btn" data-export>Export household data</button><button type="button" class="jd-btn danger" data-reset>Delete data and reset</button></div>
        <p class="muted jd-small"><strong>Delete account:</strong> <span>Permanently deletes your login. As the household owner this also deletes all household data. Other accounts must be removed first.</span></p>
        <div class="jd-actions"><button type="button" class="jd-btn danger" data-delete-account>Delete account</button></div><p class="muted jd-small" data-account-status role="status"></p></section>
      <section class="jd-card"><h3><span class="jd-tile-ic" data-tone="grey" aria-hidden="true">${window.jdIcons?.info ?? ''}</span><span>Software</span></h3><p><span>Version</span> <strong data-i18n-skip>${APP_VERSION}</strong> <small class="muted" data-build data-i18n-skip></small></p>
        <div class="jd-actions"><button type="button" class="jd-btn" data-sync-now>Sync calendars now</button><button type="button" class="jd-btn" data-update>Check for updates</button></div><p class="muted jd-small" data-update-status role="status"></p></section>
      </div>`;
    wire();
    window.jdTranslate?.();
  }

  function wire() {
    panel.querySelector('[data-back-to-more]').addEventListener('click', () => { panel.hidden = true; document.querySelector('.tool-grid')?.closest('.card')?.removeAttribute('hidden'); });
    panel.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.setting;
      let value = input.type === 'checkbox' ? input.checked : input.value;
      if (['idleMinutes', 'photoIntervalMin'].includes(key)) value = Number(value);
      if (key === 'language') {
        const apply = () => { try { localStorage.setItem('jd-language', value); } catch { /* ignore */ } const languageSelect = document.querySelector('#language-select'); if (languageSelect) { languageSelect.value = value; languageSelect.dispatchEvent(new Event('change')); } };
        if (window.jdLock?.isLocked('settings')) { render(); window.jdLock.guard('settings', async () => { apply(); await window.jdExtras.set('settings', { ...get(), language: value }); render(); }); return; }
        apply(); save({ language: value }).then(render); return;
      }
      save({ [key]: value });
    }));
    panel.querySelector('[data-night]')?.addEventListener('change', event => { window.jdTheme?.set?.(event.target.checked ? 'dark' : 'light'); });
    panel.querySelector('[data-moon]').addEventListener('change', event => {
      const on = event.target.checked; event.target.checked = !on;
      guardSettings(() => { try { localStorage.setItem('jd-moon', on ? 'on' : 'off'); } catch { /* ignore */ } const moon = document.querySelector('#moon-toggle'); if (moon) moon.checked = on; window.jdRefreshCalendarWeek?.(); event.target.checked = on; });
    });
    panel.querySelectorAll('[data-open-tool]').forEach(button => button.addEventListener('click', () => { panel.hidden = true; document.querySelector(`[data-tool="${button.dataset.openTool}"]`)?.click(); }));
    panel.querySelectorAll('[data-frame]').forEach(button => button.addEventListener('click', () => window.jdPhotoFrame?.start(button.dataset.frame)));
    const avatars = panel.querySelector('.jd-avatars-host');
    if (avatars) fetch('/api/household/demo').then(r => r.json()).then(household => { avatars.innerHTML = window.jdProfiles.sorted(household?.members ?? []).map(name => window.jdProfiles.avatarHTML(name)).join('') || `<span class="muted">${t('No members yet')}</span>`; }).catch(() => {});
    const lockHost = panel.querySelector('[data-child-lock]');
    if (window.jdLock?.renderSettings) window.jdLock.renderSettings(lockHost); else lockHost.textContent = t('Child lock unavailable');
    // Accounts with access to this household (server scopes everything to the signed-in household).
    const accountStatus = panel.querySelector('[data-account-status]');
    const ERRORS = { members_remain: 'Remove the other accounts first.', invalid_password: 'Wrong password.', password_required: 'Set a password first.', owner_only: 'Only the household owner can do this.', too_many_attempts: 'Too many attempts. Try again later.' };
    const failure = async response => { const data = await response.json().catch(() => ({})); return t(ERRORS[data.error] ?? 'That did not work. Try again.'); };
    const loadAccess = () => fetch('/api/access').then(r => (r.ok ? r.json() : null)).then(access => {
      const list = panel.querySelector('.jd-access-list');
      if (!access) { list.innerHTML = `<li class="muted">${t('Not signed in')}</li>`; return; }
      const owner = access.role === 'owner';
      panel.querySelector('.jd-invite-host').hidden = !owner;
      const rows = access.accounts.map(item => `<li><span class="jd-avatar" style="background:var(--ink)">${esc((item.email ?? '?').slice(0, 1).toUpperCase())}</span><span data-i18n-skip>${esc(item.email)}</span><small class="jd-chip">${item.you ? `${t('This device')} · ` : ''}${t(item.role === 'owner' ? 'Owner' : 'Member')}</small>${owner && !item.you && item.role !== 'owner' ? `<button type="button" class="jd-btn danger" data-remove-access="${esc(item.id)}">${t('Remove access')}</button>` : ''}</li>`);
      const open = access.invites.map(item => `<li class="muted"><span>${t('Open invitation')}</span><span data-i18n-skip>${esc(item.email ?? '')}</span><button type="button" class="jd-btn" data-revoke-invite="${esc(item.id)}">${t('Revoke')}</button></li>`);
      list.innerHTML = [...rows, ...open].join('');
      list.querySelectorAll('[data-remove-access]').forEach(button => button.addEventListener('click', () => guardSettings(async () => {
        if (!window.confirm(t('Remove this account’s access? They will no longer be able to sign in.'))) return;
        const response = await fetch(`/api/access/${encodeURIComponent(button.dataset.removeAccess)}`, { method: 'DELETE' }).catch(() => null);
        if (!response?.ok) { live(response ? await failure(response) : 'That did not work. Try again.'); return; }
        live('Access removed'); loadAccess();
      })));
      list.querySelectorAll('[data-revoke-invite]').forEach(button => button.addEventListener('click', async () => { await fetch(`/api/access/invites/${encodeURIComponent(button.dataset.revokeInvite)}`, { method: 'DELETE' }).catch(() => {}); loadAccess(); }));
    }).catch(() => {});
    loadAccess();
    panel.querySelector('[data-invite]').addEventListener('click', () => guardSettings(async () => {
      const email = panel.querySelector('[data-invite-email]').value.trim(); const result = panel.querySelector('[data-invite-result]');
      const response = await fetch('/api/access/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
      if (!response?.ok) { live(response ? await failure(response) : 'That did not work. Try again.'); return; }
      const invite = await response.json();
      result.hidden = false; result.textContent = `${t('Invitation link (valid 7 days, single use):')} ${invite.joinUrl}`;
      try { await navigator.clipboard.writeText(invite.joinUrl); live('Invitation link copied'); } catch { /* user can copy it from the text */ }
      panel.querySelector('[data-invite-email]').value = ''; loadAccess();
    }));
    panel.querySelector('[data-signout]').addEventListener('click', async () => { if (!window.confirm(t('Sign out on this device?'))) return; await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; });
    panel.querySelector('[data-signout-all]').addEventListener('click', async () => { if (!window.confirm(t('Sign out on all devices? This device stays signed in.'))) return; const response = await fetch('/api/auth/logout-all', { method: 'POST' }).catch(() => null); live(response?.ok ? 'Signed out on all other devices' : 'That did not work. Try again.'); });
    panel.querySelector('[data-delete-account]').addEventListener('click', () => guardSettings(async () => {
      if (!window.confirm(t('Delete your account permanently? As the household owner this also deletes all household data.'))) return;
      const password = window.prompt(t('Enter your password to confirm.')); if (!password) return;
      const response = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
      if (!response?.ok) { accountStatus.textContent = response ? await failure(response) : t('That did not work. Try again.'); return; }
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
      location.replace('/');
    }));
    panel.querySelector('[data-export]').addEventListener('click', async () => {
      try {
        const [data, extras] = await Promise.all([fetch('/api/household/demo/export').then(r => r.json()), fetch('/api/extras').then(r => r.json())]);
        const blob = new Blob([JSON.stringify({ ...data, extras }, null, 2)], { type: 'application/json' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `jd-planning-export-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        live('Export downloaded');
      } catch { live('Export failed; try again when connected'); }
    });
    panel.querySelector('[data-reset]').addEventListener('click', () => guardSettings(async () => {
      if (!window.confirm(t('Delete all household data (events, tasks, lists, profiles, photos, settings)?'))) return;
      if (!window.confirm(t('This cannot be undone. Really delete everything and reset?'))) return;
      const response = await fetch('/api/household/demo', { method: 'DELETE' }).catch(() => null);
      if (!response?.ok) { live('Reset failed; try again when connected'); return; }
      try { for (const key of Object.keys(localStorage)) if (key.startsWith('jd-') && key !== 'jd-language') localStorage.removeItem(key); sessionStorage.clear(); } catch { /* ignore */ }
      live('Household data deleted'); location.replace('/app');
    }));
    panel.querySelector('[data-sync-now]').addEventListener('click', () => window.jdSyncNow?.());
    panel.querySelector('[data-update]').addEventListener('click', async () => {
      const status = panel.querySelector('[data-update-status]'); status.textContent = t('Checking…');
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (!registration) { status.textContent = t('No offline cache installed. Reloading loads the latest version.'); return; }
        await registration.update();
        if (registration.installing || registration.waiting) { status.innerHTML = `${esc(t('Update found.'))} <button type="button" class="text-link" data-reload>${esc(t('Reload now'))}</button>`; status.querySelector('[data-reload]').addEventListener('click', () => location.reload()); }
        else status.textContent = t('You are up to date.');
      } catch { status.textContent = t('Update check failed; try again when connected.'); }
    });
    caches?.keys?.().then(keys => { const build = keys.find(key => key.startsWith('jd-planning-shell')); const el = panel.querySelector('[data-build]'); if (build && el) el.textContent = `(${build.replace('jd-planning-shell-', 'build ')})`; }).catch(() => {});
  }

  // ---- More tool button + panel visibility ----
  const PANEL_SELECTOR = '.school-panel, .calendar-week-panel, .rewards-panel, .meals-panel, .photos-panel, .members-panel, .routines-panel';
  function open() {
    document.querySelector('.tool-grid')?.closest('.card')?.setAttribute('hidden', '');
    document.querySelectorAll(PANEL_SELECTOR).forEach(el => { el.hidden = true; });
    document.querySelectorAll('.shell > section.card[class*="-panel"]').forEach(el => { if (el !== panel) el.hidden = true; });
    document.querySelector('.today-grid')?.setAttribute('hidden', '');
    if (!panel) { panel = document.createElement('section'); panel.className = 'card settings-panel'; document.querySelector('.shell')?.append(panel); }
    panel.hidden = false; render(); panel.scrollIntoView?.({ block: 'start' });
  }
  window.addEventListener('click', event => {
    const tool = event.target.closest?.('[data-tool]');
    if (tool?.dataset.tool === 'Settings') { event.preventDefault(); event.stopImmediatePropagation(); open(); live('Settings opened'); return; }
    if (panel && (tool || event.target.closest?.('.tabs a'))) panel.hidden = true;
  }, true);
  const placeButton = () => {
    const grid = document.querySelector('.tool-grid');
    if (!grid || grid.querySelector('[data-tool="Settings"]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.tool = 'Settings'; button.textContent = '⚙️ Settings';
    grid.append(button); window.jdTranslate?.();
  };
  window.__jdRegisterEnhancer ? window.__jdRegisterEnhancer(placeButton) : placeButton();

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({
    'General': 'Allgemein', 'Customize': 'Anpassen', 'Quiet times': 'Ruhephasen', 'Who has access?': 'Wer hat Zugriff?', 'Data': 'Daten',
    '⚙️ Settings': '⚙️ Einstellungen','SETTINGS': 'EINSTELLUNGEN', 'Make Dulli fit your home': 'Dulli an euer Zuhause anpassen', 'Changes apply to every device in the household.': 'Änderungen gelten für alle Geräte im Haushalt.',
    '🌐 General': '🌐 Allgemein', 'Time zone': 'Zeitzone', 'Device time zone': 'Zeitzone des Geräts', '👪 Profiles': '👪 Profile', 'Name, color, photo and order of each family member.': 'Name, Farbe, Foto und Reihenfolge jedes Familienmitglieds.',
    'Manage profiles': 'Profile verwalten', '🎨 Customize': '🎨 Anpassen', 'Night mode': 'Nachtmodus', 'Dark colours for the evening. Applies to this device only.': 'Dunkle Farben für den Abend. Gilt nur für dieses Gerät.', 'Hide completed tasks': 'Erledigte Aufgaben verstecken', 'Show school option': 'Schule-Option anzeigen', 'Shows the School tab.': 'Zeigt den Tab Schule.',
    'Show task count per profile': 'Anzahl Aufgaben bei Profilen anzeigen', 'General task list': 'Allgemeine Aufgabenliste', 'Tasks that belong to nobody in particular.': 'Aufgaben, die niemandem speziell gehören.',
    'Default calendar view': 'Standard-Kalenderansicht', 'Region for public holidays': 'Bundesland für Feiertage', 'No region (no public holidays)': 'Keine Region (keine Feiertage)',
    '🌙 Quiet times': '🌙 Ruhephasen', 'Start after inactivity': 'Start nach Inaktivität', 'Never (off)': 'Nie (aus)', 'Quiet window from': 'Ruhezeit von', 'Quiet window until': 'Ruhezeit bis',
    'During the quiet window the screen sleeps (dark, clock only). Touch wakes it.': 'In der Ruhezeit schläft der Bildschirm (dunkel, nur Uhr). Berühren weckt ihn.',
    'Picture mode: change photo every': 'Bildermodus: Foto wechseln alle', 'Manage photos': 'Fotos verwalten', '🔒 Child lock': '🔒 Kindersicherung', 'Child lock unavailable': 'Kindersicherung nicht verfügbar',
    '👥 Who has access?': '👥 Wer hat Zugriff?', 'This device': 'Dieses Gerät', 'Not signed in': 'Nicht angemeldet',
    "Everyone with an account here sees the same household. Other families' data is kept completely separate.": 'Alle Konten hier sehen denselben Haushalt. Die Daten anderer Familien sind vollständig getrennt.',
    'Invite by e-mail (optional)': 'Per E-Mail einladen (optional)', 'Invite a person': 'Person einladen', 'Owner': 'Inhaber', 'Member': 'Mitglied', 'Remove access': 'Zugriff entziehen', 'Open invitation': 'Offene Einladung', 'Revoke': 'Widerrufen',
    'Remove this account’s access? They will no longer be able to sign in.': 'Zugriff dieses Kontos entziehen? Die Person kann sich danach nicht mehr anmelden.', 'Access removed': 'Zugriff entzogen',
    'Invitation link (valid 7 days, single use):': 'Einladungslink (7 Tage gültig, einmal nutzbar):', 'Invitation link copied': 'Einladungslink kopiert',
    'Sign out on all devices': 'Auf allen Geräten abmelden', 'Sign out on all devices? This device stays signed in.': 'Auf allen Geräten abmelden? Dieses Gerät bleibt angemeldet.', 'Signed out on all other devices': 'Auf allen anderen Geräten abgemeldet',
    'Delete account': 'Konto löschen', 'Delete your account permanently? As the household owner this also deletes all household data.': 'Konto endgültig löschen? Als Inhaber werden dabei auch alle Haushaltsdaten gelöscht.', 'Enter your password to confirm.': 'Passwort zur Bestätigung eingeben.',
    'Remove the other accounts first.': 'Entferne zuerst die anderen Konten.', 'Wrong password.': 'Falsches Passwort.', 'Set a password first.': 'Lege zuerst ein Passwort fest.', 'Only the household owner can do this.': 'Das kann nur der Haushaltsinhaber.', 'Too many attempts. Try again later.': 'Zu viele Versuche. Später erneut versuchen.', 'That did not work. Try again.': 'Das hat nicht geklappt. Bitte erneut versuchen.',
    'Sync calendars now': 'Kalender jetzt abgleichen', 'Privacy policy': 'Datenschutzerklärung', 'Terms of service': 'Nutzungsbedingungen', 'Legal notice': 'Impressum', 'Sign out on this device': 'Auf diesem Gerät abmelden', 'Sign out on this device?': 'Auf diesem Gerät abmelden?', '💾 Data': '💾 Daten', 'Export household data': 'Haushaltsdaten exportieren', 'Delete data and reset': 'Daten löschen und zurücksetzen',
    'Delete account:': 'Konto löschen:', 'Permanently deletes your login. As the household owner this also deletes all household data. Other accounts must be removed first.': 'Löscht dein Login endgültig. Als Inhaber werden auch alle Haushaltsdaten gelöscht. Andere Konten müssen vorher entfernt werden.',
    'ℹ️ Software': 'ℹ️ Software', 'Version': 'Version', 'Check for updates': 'Nach Updates suchen', 'Checking…': 'Wird geprüft…', 'No offline cache installed. Reloading loads the latest version.': 'Kein Offline-Cache installiert. Neu laden lädt die neueste Version.',
    'Update found.': 'Update gefunden.', 'Reload now': 'Jetzt neu laden', 'You are up to date.': 'Alles aktuell.', 'Update check failed; try again when connected.': 'Update-Prüfung fehlgeschlagen; bitte mit Verbindung erneut versuchen.',
    'Settings saved': 'Einstellungen gespeichert', 'Settings opened': 'Einstellungen geöffnet', 'Export downloaded': 'Export heruntergeladen', 'Export failed; try again when connected': 'Export fehlgeschlagen; bitte mit Verbindung erneut versuchen',
    'Delete all household data (events, tasks, lists, profiles, photos, settings)?': 'Alle Haushaltsdaten löschen (Termine, Aufgaben, Listen, Profile, Fotos, Einstellungen)?',
    'This cannot be undone. Really delete everything and reset?': 'Das kann nicht rückgängig gemacht werden. Wirklich alles löschen und zurücksetzen?', 'Household data deleted': 'Haushaltsdaten gelöscht', 'Reset failed; try again when connected': 'Zurücksetzen fehlgeschlagen; bitte mit Verbindung erneut versuchen'
  });

  window.jdSettings = { DEFAULTS, STATES, get, save, open };
  window.jdExtras?.subscribe('settings', () => { apply(); });
  Promise.resolve(window.jdExtras?.ready?.()).then(() => {
    apply();
    // First device without a stored language picks up the household language.
    try { const stored = window.jdExtras.get('settings', {})?.language; if (stored && !localStorage.getItem('jd-language')) { localStorage.setItem('jd-language', stored); const languageSelect = document.querySelector('#language-select'); if (languageSelect) { languageSelect.value = stored; languageSelect.dispatchEvent(new Event('change')); } } } catch { /* ignore */ }
  });
})();
