(() => {
  // i18n-ui.js is loaded later than this script, so the translator may not exist yet when the first render runs.
  const T = text => window.jdT?.(text) ?? text;
  // CalDAV connect dialog (password field, so not a window.prompt). Resolves true when a calendar was connected.
  window.jdConnectCaldav = () => new Promise(resolve => {
    const tr = text => window.jdT?.(text) ?? text;
    const dialog = document.createElement('dialog'); dialog.className = 'jd-caldav-dialog';
    dialog.innerHTML = `<form method="dialog" class="jd-caldav-form"><h3>${tr('Connect CalDAV calendar')}</h3>
      <p class="muted jd-small">${tr('Works with iCloud, Nextcloud, Fastmail, Synology and other CalDAV servers. Dulli only reads events. For iCloud use an app-specific password.')}</p>
      <label class="jd-field">${tr('Server or calendar URL')}<input name="url" type="url" required placeholder="https://caldav.icloud.com" autocomplete="off" data-i18n-skip></label>
      <label class="jd-field">${tr('User name')}<input name="username" required autocomplete="off" data-i18n-skip></label>
      <label class="jd-field">${tr('Password')}<input name="password" type="password" required autocomplete="new-password" data-i18n-skip></label>
      <label class="jd-field">${tr('Name (optional)')}<input name="label" maxlength="60" autocomplete="off" data-i18n-skip></label>
      <p class="jd-caldav-error" role="alert" hidden></p>
      <div class="jd-actions"><button type="button" class="outline-button" data-cancel>${tr('Cancel')}</button><button type="submit" class="primary-button">${tr('Connect')}</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'); const error = dialog.querySelector('.jd-caldav-error'); const submit = form.querySelector('[type=submit]');
    const close = result => { dialog.close(); dialog.remove(); resolve(result); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    form.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true; submit.disabled = true; submit.textContent = tr('Connecting …');
      const data = Object.fromEntries(new FormData(form));
      const response = await fetch('/api/providers/caldav/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => null);
      const body = response ? await response.json().catch(() => ({})) : {};
      if (response?.ok) { const live = document.querySelector('#live-region'); if (live) live.textContent = `CalDAV · ${body.count} ${tr('events imported')}`; close(true); return; }
      const messages = { caldav_auth_failed: 'Login failed. Check user name and password.', caldav_no_calendars: 'No calendars found at this address.', caldav_https_required: 'The address must start with https://', invalid_caldav_url: 'This address is not valid.', owner_only: 'Only the household owner can connect calendars.', too_many_attempts: 'Too many attempts. Try again later.' };
      error.textContent = tr(messages[body.error] ?? 'Could not connect. Check the address and try again.'); error.hidden = false; submit.disabled = false; submit.textContent = tr('Connect');
    });
    dialog.showModal(); form.querySelector('[name=url]').focus();
  });
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const enhance = () => {
    const grid = document.querySelector('.tool-grid'); if (!grid || grid.querySelector('[data-provider-grid]')) return;
    const panel = document.createElement('div'); panel.dataset.providerGrid = 'true'; panel.className = 'provider-grid'; grid.append(panel);
    let providers = [];
    const render = async () => {
      let connections;
      let members = [];
      [providers, connections, members] = await Promise.all([fetch('/api/providers').then(r => r.json()), fetch('/api/provider-connections').then(r => r.json()), fetch('/api/household/demo').then(r => (r.ok ? r.json() : {})).then(h => h?.members ?? []).catch(() => [])]);
      const live = document.querySelector('#live-region');
      panel.innerHTML = providers.map(provider => {
        const own = connections.filter(item => item.provider === provider.id);
        const setUp = provider.auth !== 'oauth' || provider.configured;
        const rows = own.map(connection => { const seedColor = connection.color || (window.jdMemberColor ? window.jdMemberColor(connection.label) : '#00A6A9'); return `<div class="provider-connection" data-connection-id="${esc(connection.id)}"><span data-i18n-skip>${esc(connection.label)}</span><div class="provider-actions"><label class="provider-owner" title="${esc(T('Whose calendar is this?'))}"><span>${esc(T('Belongs to'))}</span><select data-owner="${esc(connection.id)}" aria-label="${esc(T('Whose calendar is this?'))}"><option value="Shared"${(connection.owner ?? 'Shared') === 'Shared' ? ' selected' : ''}>${esc(T('Shared'))}</option>${members.map(name => `<option value="${esc(name)}"${connection.owner === name ? ' selected' : ''} data-i18n-skip>${esc(name)}</option>`).join('')}</select></label><input type="color" class="provider-color" data-color="${esc(connection.id)}" value="${esc(seedColor)}" aria-label="Calendar color" title="Calendar color"><label class="provider-private" title="Private: only busy times are shown, without title or details"><input type="checkbox" data-private="${esc(connection.id)}"${connection.private ? ' checked' : ''}>Private</label>${connection.status === 'reauth_required' && connection.provider === 'caldav' ? `<span class="provider-status" role="status">Login failed</span><button type="button" class="primary-button" data-caldav-relogin="${esc(connection.id)}">Reconnect</button>` : connection.status === 'reauth_required' && connection.provider === 'google' ? `<span class="provider-status" role="status">Access expired</span><button type="button" class="primary-button" data-reconnect="${esc(connection.id)}" data-provider="${esc(connection.provider)}">Reconnect</button>` : ''}<button type="button" class="outline-button" data-sync="${esc(connection.id)}">Sync now</button><button type="button" data-disconnect="${esc(connection.id)}">Disconnect</button></div></div>`; }).join('');
        const addLabel = own.length ? 'Connect another' : 'Connect';
        return `<article class="provider-card"><strong>${provider.label}</strong><small>${provider.read ? 'Read' : 'No read'} · ${provider.write ? 'Write' : 'Read-only'} · ${provider.recurrence ? 'Recurrence' : 'No recurrence'}</small>${rows || '<span class="provider-status">Not connected</span>'}<div class="provider-actions">${setUp ? `<button type="button" data-connect="${provider.id}" data-auth="${provider.auth}">${addLabel}</button>` : '<span class="provider-status">Not set up yet</span>'}</div></article>`;
      }).join('');

      panel.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', async () => {
        const id = button.dataset.connect;
        const provider = providers.find(item => item.id === id);
        if (button.dataset.auth === 'oauth') {
          if (!provider?.configured) { if (live) live.textContent = T('This calendar is not set up yet. Ask an admin to add the connection details.'); return; }
          window.location.href = `/api/providers/${id}/connect`;
          return;
        }
        if (id === 'caldav') { if (await window.jdConnectCaldav()) { window.updateAttentionBanner?.(); render(); } return; }
        const url = window.prompt(T('Paste the ICS calendar URL'));
        if (!url?.trim()) return;
        const label = window.prompt(T('Name this calendar (optional)')) ?? '';
        try {
          const response = await fetch(`/api/providers/${id}/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), label: label.trim() }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'connect_failed');
          if (live) live.textContent = `${id} connected · ${data.count} events imported`;
        } catch { if (live) live.textContent = `${id} could not be connected; check the URL and try again`; }
        window.updateAttentionBanner?.();
        render();
      }));
      panel.querySelectorAll('[data-caldav-relogin]').forEach(button => button.addEventListener('click', async () => { await fetch(`/api/providers/connections/${button.dataset.caldavRelogin}/disconnect`, { method: 'POST' }); if (await window.jdConnectCaldav()) window.updateAttentionBanner?.(); render(); }));
      panel.querySelectorAll('[data-reconnect]').forEach(button => button.addEventListener('click', () => { window.location.href = `/api/providers/${button.dataset.provider}/connect?connection=${encodeURIComponent(button.dataset.reconnect)}`; }));
      panel.querySelectorAll('[data-color]').forEach(input => input.addEventListener('change', async () => {
        const connectionId = input.dataset.color;
        try { await fetch(`/api/providers/connections/${connectionId}/color`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: input.value }) }); if (live) live.textContent = 'Calendar color updated'; } catch { if (live) live.textContent = 'Calendar color could not be saved'; }
      }));
      panel.querySelectorAll('[data-owner]').forEach(select => select.addEventListener('change', async () => {
        const response = await fetch(`/api/providers/connections/${select.dataset.owner}/owner`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: select.value }) }).catch(() => null);
        if (live) live.textContent = T(response?.ok ? 'Calendar owner saved' : 'Calendar owner could not be saved');
        window.jdRefreshCalendarWeek?.();
      }));
      panel.querySelectorAll('[data-private]').forEach(input => input.addEventListener('change', async () => {
        const response = await fetch(`/api/providers/connections/${input.dataset.private}/privacy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ private: input.checked }) }).catch(() => null);
        if (live) live.textContent = response?.ok ? (input.checked ? 'Calendar is private: only busy times are shown' : 'Calendar details are shown again') : 'Privacy setting could not be saved';
        window.jdRefreshCalendarWeek?.();
      }));
      panel.querySelectorAll('[data-sync]').forEach(button => button.addEventListener('click', async () => {
        const connectionId = button.dataset.sync;
        try {
          const response = await fetch(`/api/providers/connections/${connectionId}/sync`, { method: 'POST' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'sync_failed');
          if (live) live.textContent = `synced · ${data.count} events`;
        } catch { if (live) live.textContent = 'sync unavailable; retry later'; }
      }));
      panel.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => {
        const connectionId = button.dataset.disconnect;
        await fetch(`/api/providers/connections/${connectionId}/disconnect`, { method: 'POST' });
        if (live) live.textContent = 'disconnected';
        window.updateAttentionBanner?.();
        render();
      }));
    };
    render();
    const params = new URLSearchParams(window.location.search); const connectedParam = params.get('connected'); const errorParam = params.get('providerError'); if (connectedParam || errorParam) { const live = document.querySelector('#live-region'); if (live) live.textContent = connectedParam ? `${connectedParam} connected` : `${errorParam} could not be connected`; window.history.replaceState(null, '', window.location.pathname + window.location.hash); }
  };
  window.__jdRegisterEnhancer(enhance);
})();
