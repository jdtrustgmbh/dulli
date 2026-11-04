(() => {
  const live = document.querySelector('#live-region');
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const de = () => window.jdLanguage?.() === 'de';
  const roleLabel = role => role === 'child' ? (de() ? '🧒 Kind' : '🧒 Child') : (de() ? '🧑 Erwachsener' : '🧑 Adult');

  function hideSiblingPanels() { document.querySelector('.tool-grid')?.closest('.card')?.setAttribute('hidden', ''); document.querySelectorAll('.school-panel, .calendar-week-panel, .rewards-panel, .meals-panel, .photos-panel, .routines-panel').forEach(el => { el.hidden = true; }); }

  async function showMembers() {
    hideSiblingPanels();
    let panel = document.querySelector('.members-panel');
    if (!panel) { panel = document.createElement('section'); panel.className = 'card members-panel'; document.querySelector('.shell').append(panel); }
    panel.hidden = false;
    const household = await (await fetch('/api/household/demo')).json();
    const members = household?.members ?? [];
    const roles = household?.memberRoles ?? {};

    panel.innerHTML = `<div class="card-heading"><div><p class="eyebrow">FAMILY</p><h2>Who's in your household</h2></div><button type="button" class="text-link" data-back-to-more="">‹ More</button></div>
      <ul class="member-list">${members.map(name => `<li><span class="owner-dot" style="background:${window.jdMemberColor ? window.jdMemberColor(name) : '#00A6A9'}"></span><span data-i18n-skip>${esc(name)}</span><small data-i18n-skip>${roleLabel(roles[name])}</small><button type="button" data-remove-member="${esc(name)}" aria-label="Remove">✕</button></li>`).join('') || '<li class="empty-state">No members yet</li>'}</ul>
      <form class="member-form"><input name="name" maxlength="60" required placeholder="e.g. Alex"><select name="role" aria-label="Role"><option value="adult">${de() ? 'Erwachsener' : 'Adult'}</option><option value="child">${de() ? 'Kind' : 'Child'}</option></select><button class="primary-button" type="submit">Add member</button></form>`;

    panel.querySelector('[data-back-to-more]').addEventListener('click', () => { panel.hidden = true; document.querySelector('.tool-grid')?.closest('.card')?.removeAttribute('hidden'); });
    // Profile manager (color, photo, order, rename) from public/features/profiles-plus.js replaces the plain list when loaded.
    if (window.jdProfiles?.renderManager) { const host = document.createElement('div'); host.className = 'jd-profile-manager'; panel.querySelector('.member-list').replaceWith(host); window.jdProfiles.renderManager(host, { members, roles, refresh: showMembers }); }
    else panel.querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', async () => {
      const response = await fetch(`/api/household/demo/members/${encodeURIComponent(button.dataset.removeMember)}`, { method: 'DELETE' });
      if (response.ok) { live.textContent = 'Member removed'; showMembers(); window.renderAvatars?.(); window.updateGreeting?.(); }
    }));
    panel.querySelector('.member-form').addEventListener('submit', async event => {
      event.preventDefault();
      const value = Object.fromEntries(new FormData(event.currentTarget));
      if (!value.name?.trim()) return;
      const response = await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value.name.trim(), role: value.role === 'child' ? 'child' : 'adult' }) });
      if (response.ok) { live.textContent = 'Member added'; showMembers(); window.renderAvatars?.(); }
    });
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-tool="Family"]'); if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { await showMembers(); button.textContent = '✓ Family ready'; live.textContent = 'Family opened'; } catch { live.textContent = 'Family unavailable; try again when connected'; }
  }, true);
})();
