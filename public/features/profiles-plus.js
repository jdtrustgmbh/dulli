// Profiles: chosen color, optional photo and order per household member.
// extras.profiles = { [memberName]: { color:'#rrggbb', photo:'dataURL'|'', order:number } }
// window.jdMemberColor(name) honors chosen colors, so every existing screen picks them up.
(() => {
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const live = () => document.querySelector('#live-region');
  const profiles = () => window.jdExtras?.get('profiles', {}) ?? {};
  const baseColor = window.jdMemberColor ?? (() => '#2b8c87');
  const PALETTE = window.__jdMemberPalette ?? ['#2b8c87', '#e97962', '#8f7ac4', '#c9a227', '#4a7dbf', '#c25b8f', '#3fa66e', '#b25a3c', '#5a8fc9', '#a06fd1'];
  const colorOf = name => profiles()[(name ?? '').trim()]?.color || baseColor(name);
  window.jdMemberColor = colorOf;
  const photoOf = name => profiles()[(name ?? '').trim()]?.photo || '';
  const sorted = members => [...members].map((name, index) => ({ name, index })).sort((a, b) => (profiles()[a.name]?.order ?? 1000 + a.index) - (profiles()[b.name]?.order ?? 1000 + b.index)).map(item => item.name);
  const initial = name => (name ?? '').trim().slice(0, 1).toUpperCase() || '?';
  const avatarHTML = (name, className = 'jd-avatar') => { const photo = photoOf(name); return `<span class="${className}" data-i18n-skip style="background:${esc(colorOf(name))}${photo ? `;background-image:url('${esc(photo)}')` : ''}" title="${esc(name)}">${photo ? '' : esc(initial(name))}</span>`; };
  const guard = (fn) => (window.jdLock ? window.jdLock.guard('settings', fn) : fn());
  const saveProfiles = value => window.jdExtras.set('profiles', value);
  const patchProfile = (name, patch) => { const all = { ...profiles() }; all[name] = { ...(all[name] ?? {}), ...patch }; return saveProfiles(all); };
  const settings = () => ({ showTaskCounts: true, ...(window.jdExtras?.get('settings', {}) ?? {}) });

  // Header avatar row (replaces app.js renderAvatars so photos, colors, order and task counts show).
  async function renderAvatars() {
    const row = document.querySelector('.avatar-row'); if (!row) return;
    try {
      const household = await (await fetch('/api/household/demo')).json();
      const members = sorted(household?.members ?? []);
      let counts = {};
      let today = null; // due today per person, from the Tasks module (counts down to 0 as the day's tasks get done)
      if (settings().showTaskCounts) today = window.jdTasks?.todayCounts?.() ?? null;
      if (settings().showTaskCounts && !today) { try { const tasks = await (await fetch('/api/tasks?limit=200')).json(); if (Array.isArray(tasks)) for (const task of tasks) if (!task.completed) counts[task.owner] = (counts[task.owner] ?? 0) + 1; } catch { counts = {}; } }
      row.replaceChildren(...members.slice(0, 5).map(name => {
        const chip = document.createElement('span');
        chip.className = 'avatar-chip'; chip.dataset.i18nSkip = ''; chip.title = name;
        chip.style.background = colorOf(name);
        const photo = photoOf(name);
        if (photo) { chip.style.backgroundImage = `url("${photo}")`; chip.classList.add('has-photo'); } else chip.textContent = initial(name);
        chip.setAttribute('role', 'button'); chip.tabIndex = 0;
        const info = today?.[name];
        if (info && info.total > 0 && info.open === 0) { const badge = document.createElement('b'); badge.className = 'avatar-count done'; badge.textContent = '✓'; badge.setAttribute('aria-label', window.jdT?.('all tasks done today') ?? 'all tasks done today'); chip.append(badge); }
        else if ((info?.open ?? counts[name]) > 0) { const open = info?.open ?? counts[name]; const badge = document.createElement('b'); badge.className = 'avatar-count'; badge.textContent = String(open); badge.setAttribute('aria-label', `${open} ${window.jdT?.('open tasks today') ?? 'open tasks today'}`); chip.append(badge); }
        return chip;
      }));
    } catch { /* keep previous avatars */ }
  }
  window.renderAvatars = renderAvatars;
  window.addEventListener('jd-tasks-updated', () => renderAvatars());
  // Outside the calendar a tap on a profile opens that person's tasks (in the calendar the avatars filter the view, see shell.js).
  const calendarActive = () => Boolean(document.querySelector('.shell.shell-wide:not([hidden]) .cal-profile-chip'));
  const openTasks = event => { const chip = event.target.closest('.topbar .avatar-row .avatar-chip'); if (!chip || calendarActive()) return; window.jdTasks?.showMember?.(chip.title); };
  document.addEventListener('click', openTasks);
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.topbar .avatar-row .avatar-chip')) { event.preventDefault(); openTasks(event); } });

  // Downscale an image file to a square-ish thumbnail data URL (max 256px).
  const fileToDataUrl = (file, max = 256, quality = 0.85) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', quality)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
  window.jdImageToDataUrl = fileToDataUrl;

  // Profile manager rendered inside the Family panel (members-ui.js).
  function renderManager(host, { members = [], roles = {}, refresh } = {}) {
    const list = sorted(members);
    const roleLabel = role => role === 'child' ? '🧒 Child' : '🧑 Adult';
    host.innerHTML = `<ul class="member-list jd-profile-list">${list.map((name, index) => `<li draggable="true" data-profile="${esc(name)}" style="--ring:${esc(colorOf(name))}">
        <span class="jd-drag" aria-hidden="true">⋮⋮</span>${avatarHTML(name)}<span class="jd-profile-name" data-i18n-skip>${esc(name)}</span><small>${roleLabel(roles[name])}</small>
        <span class="jd-profile-move"><button type="button" class="jd-icon-btn" data-move="-1" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>${window.jdIcons?.up ?? '▲'}</button><button type="button" class="jd-icon-btn" data-move="1" aria-label="Move down" ${index === list.length - 1 ? 'disabled' : ''}>${window.jdIcons?.down ?? '▼'}</button></span>
        <button type="button" class="jd-icon-btn" data-profile-edit aria-expanded="false" aria-label="Edit profile">${window.jdIcons?.edit ?? '✎'}</button>
        <button type="button" class="jd-icon-btn danger" data-remove-member="${esc(name)}" aria-label="Remove">${window.jdIcons?.trash ?? '✕'}</button>
      </li>`).join('') || '<li class="empty-state">No members yet</li>'}</ul>`;
    const rerender = () => { refresh ? refresh() : renderManager(host, { members, roles, refresh }); window.renderAvatars?.(); window.jdRefreshCalendarWeek?.(); };
    const reorder = async next => { const all = { ...profiles() }; next.forEach((name, order) => { all[name] = { ...(all[name] ?? {}), order }; }); await saveProfiles(all); rerender(); };
    host.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => guard(() => {
      const name = button.closest('li').dataset.profile; const from = list.indexOf(name); const to = from + Number(button.dataset.move);
      const next = [...list]; next.splice(from, 1); next.splice(to, 0, name); return reorder(next);
    })));
    let dragged = null;
    host.querySelectorAll('li[draggable]').forEach(row => {
      row.addEventListener('dragstart', event => { dragged = row.dataset.profile; event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', event => { event.preventDefault(); });
      row.addEventListener('drop', event => { event.preventDefault(); const target = row.dataset.profile; if (!dragged || dragged === target) return; const next = list.filter(name => name !== dragged); next.splice(next.indexOf(target) + (list.indexOf(dragged) < list.indexOf(target) ? 1 : 0), 0, dragged); guard(() => reorder(next)); });
    });
    host.querySelectorAll('[data-profile-edit]').forEach(button => button.addEventListener('click', () => {
      const row = button.closest('li'); const name = row.dataset.profile;
      const open = row.nextElementSibling?.classList.contains('jd-profile-editor');
      host.querySelectorAll('.jd-profile-editor').forEach(el => el.remove()); host.querySelectorAll('[data-profile-edit]').forEach(el => el.setAttribute('aria-expanded', 'false'));
      if (open) return;
      button.setAttribute('aria-expanded', 'true');
      const editor = document.createElement('li'); editor.className = 'jd-profile-editor';
      const color = colorOf(name);
      editor.innerHTML = `<form class="jd-rename"><label class="jd-field">Name<input name="name" maxlength="60" required value="${esc(name)}" data-i18n-skip></label><button type="submit" class="jd-btn">Rename</button></form>
        <div class="jd-field"><span>Profile color</span><div class="jd-swatches">${PALETTE.map(swatch => `<button type="button" class="jd-swatch ${swatch === color ? 'selected' : ''}" data-color="${swatch}" style="background:${swatch}" aria-label="Color ${swatch}" aria-pressed="${swatch === color}"></button>`).join('')}<label class="jd-custom-color" title="Custom color"><input type="color" value="${esc(color)}" aria-label="Custom color"><span>＋ Custom</span></label></div></div>
        <div class="jd-field"><span>Profile photo</span><div class="jd-photo-row">${avatarHTML(name, 'jd-avatar large')}<label class="jd-btn jd-file">Upload photo<input type="file" accept="image/*" hidden></label>${photoOf(name) ? '<button type="button" class="jd-btn danger" data-photo-remove>Remove photo</button>' : ''}</div></div>`;
      row.after(editor);
      window.jdTranslate?.();
      editor.querySelectorAll('[data-color]').forEach(swatch => swatch.addEventListener('click', () => guard(async () => { await patchProfile(name, { color: swatch.dataset.color }); live().textContent = 'Profile color saved'; rerender(); })));
      editor.querySelector('input[type="color"]').addEventListener('change', event => { const value = event.target.value; guard(async () => { await patchProfile(name, { color: value }); live().textContent = 'Profile color saved'; rerender(); }); });
      editor.querySelector('input[type="file"]').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; guard(async () => { try { const photo = await fileToDataUrl(file); await patchProfile(name, { photo }); live().textContent = 'Profile photo saved'; rerender(); } catch { live().textContent = 'Photo could not be read'; } }); });
      editor.querySelector('[data-photo-remove]')?.addEventListener('click', () => guard(async () => { await patchProfile(name, { photo: '' }); rerender(); }));
      editor.querySelector('.jd-rename').addEventListener('submit', event => {
        event.preventDefault(); const next = new FormData(event.currentTarget).get('name')?.toString().trim();
        if (!next || next === name || members.includes(next)) return;
        guard(async () => {
          // No rename endpoint: add the new member with the same role, move profile data, then remove the old one.
          const added = await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next, role: roles[name] === 'child' ? 'child' : 'adult' }) });
          if (!added.ok) { live().textContent = 'Rename failed'; return; }
          await fetch(`/api/household/demo/members/${encodeURIComponent(name)}`, { method: 'DELETE' });
          const all = { ...profiles() }; all[next] = { ...(all[name] ?? {}), order: all[name]?.order ?? list.indexOf(name) }; delete all[name]; await saveProfiles(all);
          live().textContent = 'Profile renamed'; rerender(); window.updateGreeting?.();
        });
      });
    }));
    host.querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', () => guard(async () => {
      const name = button.dataset.removeMember;
      if (!window.confirm(`${window.jdT?.('Remove profile') ?? 'Remove profile'} ${name}?`)) return;
      const response = await fetch(`/api/household/demo/members/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (response.ok) { const all = { ...profiles() }; delete all[name]; await saveProfiles(all); live().textContent = 'Member removed'; rerender(); window.updateGreeting?.(); }
    })));
  }

  window.jdProfiles = { get: name => profiles()[name] ?? {}, color: colorOf, photo: photoOf, sorted, avatarHTML, renderManager, PALETTE };

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({ 'open tasks today': 'offene Aufgaben heute', 'all tasks done today': 'alle Aufgaben heute erledigt', 'Move up': 'Nach oben', 'Move down': 'Nach unten', 'Edit profile': 'Profil bearbeiten', 'Rename': 'Umbenennen', 'Profile color': 'Profilfarbe', 'Profile photo': 'Profilfoto', 'Custom color': 'Eigene Farbe', '＋ Custom': '＋ Eigene', 'Upload photo': 'Foto hochladen', 'Remove photo': 'Foto entfernen', 'Profile color saved': 'Profilfarbe gespeichert', 'Profile photo saved': 'Profilfoto gespeichert', 'Photo could not be read': 'Foto konnte nicht gelesen werden', 'Profile renamed': 'Profil umbenannt', 'Rename failed': 'Umbenennen fehlgeschlagen', 'Remove profile': 'Profil entfernen', 'open tasks': 'offene Aufgaben', '🧒 Child': '🧒 Kind', '🧑 Adult': '🧑 Erwachsener' });

  const refreshAll = () => { renderAvatars(); window.jdRefreshCalendarWeek?.(); };
  window.jdExtras?.subscribe('profiles', refreshAll);
  window.jdExtras?.subscribe('settings', () => renderAvatars());
  Promise.resolve(window.jdExtras?.ready?.()).then(refreshAll);
})();
