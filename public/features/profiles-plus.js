// Profiles: chosen color, optional photo and order per household member.
// extras.profiles = { [memberName]: { color:'#rrggbb', color2:'#rrggbb'|'' (gradient), emoji:'🦊'|'', photo:'dataURL'|'', frame:'bronze'|..|'',
//                     bestStreak:number, wishes:[{id,name}], order:number } }
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
  // Personalisation for kids: emoji avatar, gradient, frames and badges unlocked by streaks and earned coins, wish list.
  const EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐶', '🐱', '🐰', '🐻', '🐵', '🦋', '🐢', '🐬', '🦖', '🐴', '🐎', '🐮', '🐷', '🐑', '🐐', '🐔', '🐥', '🦆', '🦉', '🦅', '🐧', '🐺', '🐗', '🦌', '🐹', '🐭', '🐿️', '🦔', '🦝', '🦒', '🐘', '🦓', '🦘', '🐨', '🦥', '🐊', '🐍', '🐳', '🦈', '🐠', '🐝', '🐞', '🦜', '🚀', '⚽', '🎨', '🌈', '⭐', '🍕', '🤖', '👻'];
  const FRAMES = [{ key: 'bronze', days: 3 }, { key: 'silver', days: 7 }, { key: 'gold', days: 14 }, { key: 'rainbow', days: 30 }];
  const emojiOf = name => profiles()[(name ?? '').trim()]?.emoji || '';
  const fillOf = name => { const second = profiles()[(name ?? '').trim()]?.color2; return second ? `linear-gradient(135deg,${colorOf(name)},${second})` : colorOf(name); };
  const storedBest = name => Math.max(Number(window.jdExtras?.get('streaks', {})?.[name]) || 0, Number(profiles()[name]?.bestStreak) || 0);
  const bestStreakOf = name => Math.max(storedBest(name), window.jdTasks?.streakOf?.(name) || 0);
  const frameOf = name => { const frame = FRAMES.find(item => item.key === profiles()[name]?.frame); return frame && bestStreakOf(name) >= frame.days ? frame.key : ''; };
  const coinsEarnedBy = name => { const ledger = window.jdExtras?.get('coins', []); return Array.isArray(ledger) ? ledger.filter(entry => entry.member === name && entry.reason === 'task').reduce((sum, entry) => sum + (Number(entry.delta) || 0), 0) : 0; };
  const BADGES = [
    { key: 'streak3', icon: '🔥', label: '3-day streak', test: s => s.streak >= 3 }, { key: 'streak7', icon: '⭐', label: '7-day streak', test: s => s.streak >= 7 },
    { key: 'streak14', icon: '🏅', label: '14-day streak', test: s => s.streak >= 14 }, { key: 'streak30', icon: '👑', label: '30-day streak', test: s => s.streak >= 30 },
    { key: 'coins50', icon: '🪙', label: '50 coins earned', test: s => s.coins >= 50 }, { key: 'coins100', icon: '💰', label: '100 coins earned', test: s => s.coins >= 100 }, { key: 'coins250', icon: '💎', label: '250 coins earned', test: s => s.coins >= 250 }
  ];
  const badgesOf = name => { const state = { streak: bestStreakOf(name), coins: coinsEarnedBy(name) }; return BADGES.map(badge => ({ ...badge, earned: badge.test(state) })); };
  const initial = name => (name ?? '').trim().slice(0, 1).toUpperCase() || '?';
  const avatarHTML = (name, className = 'jd-avatar') => { const photo = photoOf(name); const frame = frameOf(name); return `<span class="${className}${frame ? ` jd-has-frame jd-ring-${frame}` : ''}" data-i18n-skip style="background:${esc(fillOf(name))}${photo ? `;background-image:url('${esc(photo)}')` : ''}" title="${esc(name)}">${photo ? '' : esc(emojiOf(name) || initial(name))}</span>`; };
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
        chip.style.background = fillOf(name);
        const photo = photoOf(name); const frame = frameOf(name); if (frame) chip.classList.add('jd-has-frame', `jd-ring-${frame}`);
        if (photo) { chip.style.backgroundImage = `url("${photo}")`; chip.classList.add('has-photo'); } else chip.textContent = emojiOf(name) || initial(name);
        chip.setAttribute('role', 'button'); chip.tabIndex = 0;
        const info = today?.[name];
        if (info && info.total > 0 && info.open === 0) { const badge = document.createElement('b'); badge.className = 'avatar-count done'; badge.textContent = '✓'; badge.setAttribute('aria-label', window.jdT?.('all tasks done today') ?? 'all tasks done today'); chip.append(badge); }
        else if ((info?.open ?? counts[name]) > 0) { const open = info?.open ?? counts[name]; const badge = document.createElement('b'); badge.className = 'avatar-count'; badge.textContent = String(open); badge.setAttribute('aria-label', `${open} ${window.jdT?.('open tasks today') ?? 'open tasks today'}`); chip.append(badge); }
        return chip;
      }));
    } catch { /* keep previous avatars */ }
  }
  window.renderAvatars = renderAvatars;
  let bestTimer = 0;
  const syncBestStreaks = () => { clearTimeout(bestTimer); bestTimer = setTimeout(() => {
    // Best streaks live in their own extras key so saving them does not re-render screens that watch the profiles.
    const all = { ...(window.jdExtras?.get('streaks', {}) ?? {}) }; let changed = false;
    for (const name of Object.keys(window.jdTasks?.todayCounts?.() ?? {})) { const streak = window.jdTasks.streakOf(name); if (streak > storedBest(name)) { all[name] = streak; changed = true; } }
    if (changed) window.jdExtras.set('streaks', all);
  }, 600); };
  window.addEventListener('jd-tasks-updated', () => { renderAvatars(); syncBestStreaks(); });
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
    // The editor opens as a modal dialog over the page: always fully visible, closes with x, Done, Esc or a click outside.
    host.querySelectorAll('[data-profile-edit]').forEach(button => button.addEventListener('click', () => {
      const name = button.closest('li').dataset.profile;
      document.querySelectorAll('dialog.jd-profile-dialog').forEach(el => el.remove());
      const dialog = document.createElement('dialog'); dialog.className = 'jd-profile-dialog';
      dialog.setAttribute('aria-label', 'Edit profile');
      const editor = document.createElement('div'); editor.className = 'jd-profile-editor'; dialog.append(editor);
      const close = () => { if (dialog.open) dialog.close(); dialog.remove(); button.focus?.(); };
      const build = () => {
        const color = colorOf(name);
        editor.innerHTML = `<header class="jd-profile-dialog-head"><h3 data-i18n-skip>${esc(name)}</h3><button type="button" class="jd-icon-btn" data-profile-close aria-label="Close">✕</button></header>
        <form class="jd-rename"><label class="jd-field">Name<input name="name" maxlength="60" required value="${esc(name)}" data-i18n-skip></label><button type="submit" class="jd-btn">Rename</button></form>
        <div class="jd-field"><span>Profile color</span><div class="jd-swatches">${PALETTE.map(swatch => `<button type="button" class="jd-swatch ${swatch === color ? 'selected' : ''}" data-color="${swatch}" style="background:${swatch}" aria-label="Color ${swatch}" aria-pressed="${swatch === color}"></button>`).join('')}<label class="jd-custom-color" title="Custom color"><input type="color" value="${esc(color)}" aria-label="Custom color"><span>＋ Custom</span></label></div></div>
        <div class="jd-field"><span>Profile photo</span><div class="jd-photo-row">${avatarHTML(name, 'jd-avatar large')}<label class="jd-btn jd-file">Upload photo<input type="file" accept="image/*" hidden></label>${photoOf(name) ? '<button type="button" class="jd-btn danger" data-photo-remove>Remove photo</button>' : ''}</div></div>
        <div class="jd-field"><span>Avatar</span><div class="jd-emoji-grid" role="group" aria-label="Avatar">${EMOJIS.map(emoji => `<button type="button" class="jd-emoji${emoji === emojiOf(name) ? ' selected' : ''}" data-emoji="${emoji}" aria-pressed="${emoji === emojiOf(name)}" data-i18n-skip>${emoji}</button>`).join('')}<button type="button" class="jd-emoji jd-emoji-none${emojiOf(name) ? '' : ' selected'}" data-emoji="" aria-pressed="${!emojiOf(name)}">Initial</button></div></div>
        <div class="jd-field"><span>Gradient (second color)</span><div class="jd-swatches"><button type="button" class="jd-swatch jd-swatch-none${profiles()[name]?.color2 ? '' : ' selected'}" data-color2="" aria-label="No gradient" aria-pressed="${!profiles()[name]?.color2}">∅</button>${PALETTE.map(swatch => `<button type="button" class="jd-swatch ${swatch === profiles()[name]?.color2 ? 'selected' : ''}" data-color2="${swatch}" style="background:${swatch}" aria-label="Gradient color ${swatch}" aria-pressed="${swatch === profiles()[name]?.color2}"></button>`).join('')}</div></div>
        <div class="jd-field"><span>Badges</span><div class="jd-badges">${badgesOf(name).map(badge => `<span class="jd-badge${badge.earned ? '' : ' locked'}" data-badge="${badge.key}"><b aria-hidden="true">${badge.earned ? badge.icon : '🔒'}</b><small>${badge.label}</small></span>`).join('')}</div></div>
        <div class="jd-field"><span>Wish list</span><ul class="jd-wishes">${(profiles()[name]?.wishes ?? []).map(wish => `<li data-wish="${esc(wish.id)}"><span data-i18n-skip>🎁 ${esc(wish.name)}</span><input type="number" min="1" max="999" value="20" data-wish-price aria-label="Price in coins"><button type="button" class="jd-btn" data-wish-treasure>Make it a treasure</button><button type="button" class="jd-icon-btn" data-wish-remove aria-label="Remove">✕</button></li>`).join('')}</ul><form class="jd-wish-form"><input name="wish" maxlength="60" placeholder="I wish for ..." aria-label="Wish"><button type="submit" class="jd-btn">Add</button></form></div>
        <div class="jd-profile-dialog-actions"><button type="button" class="primary-button" data-profile-close>Done</button></div>`;
        window.jdTranslate?.();
        editor.querySelectorAll('[data-profile-close]').forEach(el => el.addEventListener('click', close));
        function saved(message) { live().textContent = message; rerender(); build(); }
        const choose = (selector, key) => editor.querySelectorAll(selector).forEach(el => el.addEventListener('click', () => guard(async () => { await patchProfile(name, { [key]: el.dataset[key] }); saved('Profile saved'); })));
        choose('[data-emoji]', 'emoji'); choose('[data-color2]', 'color2');
        editor.querySelector('.jd-wish-form').addEventListener('submit', event => { event.preventDefault(); const text = new FormData(event.currentTarget).get('wish')?.toString().trim(); const wishes = profiles()[name]?.wishes ?? []; if (!text || wishes.length >= 8) return; guard(async () => { await patchProfile(name, { wishes: [...wishes, { id: `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: text }] }); saved('Wish added'); }); });
        editor.querySelectorAll('[data-wish-remove]').forEach(el => el.addEventListener('click', () => guard(async () => { const id = el.closest('li').dataset.wish; await patchProfile(name, { wishes: (profiles()[name]?.wishes ?? []).filter(wish => wish.id !== id) }); saved('Wish removed'); })));
        editor.querySelectorAll('[data-wish-treasure]').forEach(el => el.addEventListener('click', () => guard(async () => {
          const row = el.closest('li'); const wish = (profiles()[name]?.wishes ?? []).find(item => item.id === row.dataset.wish); if (!wish) return;
          const price = Math.max(1, Math.min(999, Math.round(Number(row.querySelector('[data-wish-price]').value) || 20)));
          const treasures = window.jdExtras.get('treasures', {}) ?? {};
          await window.jdExtras.set('treasures', { ...treasures, custom: [...(Array.isArray(treasures.custom) ? treasures.custom : []), { id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, member: name, name: wish.name, emoji: '🎁', price, repeatable: false }] });
          await patchProfile(name, { wishes: (profiles()[name]?.wishes ?? []).filter(item => item.id !== wish.id) }); saved('Wish is now a treasure');
        })));
        editor.querySelectorAll('[data-color]').forEach(swatch => swatch.addEventListener('click', () => guard(async () => { await patchProfile(name, { color: swatch.dataset.color }); saved('Profile color saved'); })));
        editor.querySelector('input[type="color"]').addEventListener('change', event => { const value = event.target.value; guard(async () => { await patchProfile(name, { color: value }); saved('Profile color saved'); }); });
        editor.querySelector('input[type="file"]').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; guard(async () => { try { const photo = await fileToDataUrl(file); await patchProfile(name, { photo }); saved('Profile photo saved'); } catch { live().textContent = 'Photo could not be read'; } }); });
        editor.querySelector('[data-photo-remove]')?.addEventListener('click', () => guard(async () => { await patchProfile(name, { photo: '' }); saved('Profile photo saved'); }));
        editor.querySelector('.jd-rename').addEventListener('submit', event => {
          event.preventDefault(); const next = new FormData(event.currentTarget).get('name')?.toString().trim();
          if (!next || next === name || members.includes(next)) return;
          guard(async () => {
            // No rename endpoint: add the new member with the same role, move profile data, then remove the old one.
            const added = await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next, role: roles[name] === 'child' ? 'child' : 'adult' }) });
            if (!added.ok) { live().textContent = 'Rename failed'; return; }
            await fetch(`/api/household/demo/members/${encodeURIComponent(name)}`, { method: 'DELETE' });
            const all = { ...profiles() }; all[next] = { ...(all[name] ?? {}), order: all[name]?.order ?? list.indexOf(name) }; delete all[name]; await saveProfiles(all);
            live().textContent = 'Profile renamed'; close(); rerender(); window.updateGreeting?.();
          });
        });
      };
      build();
      dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog); dialog.showModal();
      dialog.querySelector('input[name="name"]')?.focus();
    }));
    host.querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', () => guard(async () => {
      const name = button.dataset.removeMember;
      if (!window.confirm(`${window.jdT?.('Remove profile') ?? 'Remove profile'} ${name}?`)) return;
      const response = await fetch(`/api/household/demo/members/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (response.ok) { const all = { ...profiles() }; delete all[name]; await saveProfiles(all); live().textContent = 'Member removed'; rerender(); window.updateGreeting?.(); }
    })));
  }

  const FRAME_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', rainbow: 'Rainbow' };
  window.jdProfiles = { FRAMES, FRAME_LABEL, frameOf, bestStreakOf, setFrame: (name, key) => patchProfile(name, { frame: key }), get: name => profiles()[name] ?? {}, color: colorOf, photo: photoOf, sorted, avatarHTML, renderManager, PALETTE };

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({ 'Avatar': 'Avatar', 'Initial': 'Anfangsbuchstabe', 'Gradient (second color)': 'Verlauf (zweite Farbe)', 'No gradient': 'Kein Verlauf', 'Gradient color': 'Verlaufsfarbe', 'Frame': 'Rahmen', 'No frame': 'Kein Rahmen', 'Silver': 'Silber', 'Rainbow': 'Regenbogen', 'days in a row': 'Tage in Folge', 'Badges': 'Abzeichen', '3-day streak': '3 Tage in Folge', '7-day streak': '7 Tage in Folge', '14-day streak': '14 Tage in Folge', '30-day streak': '30 Tage in Folge', '50 coins earned': '50 Münzen verdient', '100 coins earned': '100 Münzen verdient', '250 coins earned': '250 Münzen verdient', 'Wish list': 'Wunschliste', 'Price in coins': 'Preis in Münzen', 'Make it a treasure': 'Als Schatz anlegen', 'I wish for ...': 'Ich wünsche mir ...', 'Wish': 'Wunsch', 'Profile saved': 'Profil gespeichert', 'Wish added': 'Wunsch hinzugefügt', 'Wish removed': 'Wunsch entfernt', 'Wish is now a treasure': 'Wunsch ist jetzt ein Schatz', 'Add': 'Hinzufügen', 'Remove': 'Entfernen', 'open tasks today': 'offene Aufgaben heute', 'all tasks done today': 'alle Aufgaben heute erledigt', 'Move up': 'Nach oben', 'Move down': 'Nach unten', 'Edit profile': 'Profil bearbeiten', 'Rename': 'Umbenennen', 'Done': 'Fertig', 'Close': 'Schließen', 'Profile color': 'Profilfarbe', 'Profile photo': 'Profilfoto', 'Custom color': 'Eigene Farbe', '＋ Custom': '＋ Eigene', 'Upload photo': 'Foto hochladen', 'Remove photo': 'Foto entfernen', 'Profile color saved': 'Profilfarbe gespeichert', 'Profile photo saved': 'Profilfoto gespeichert', 'Photo could not be read': 'Foto konnte nicht gelesen werden', 'Profile renamed': 'Profil umbenannt', 'Rename failed': 'Umbenennen fehlgeschlagen', 'Remove profile': 'Profil entfernen', 'open tasks': 'offene Aufgaben', '🧒 Child': '🧒 Kind', '🧑 Adult': '🧑 Erwachsener' });

  const refreshAll = () => { renderAvatars(); window.jdRefreshCalendarWeek?.(); };
  window.jdExtras?.subscribe('profiles', refreshAll);
  window.jdExtras?.subscribe('settings', () => renderAvatars());
  Promise.resolve(window.jdExtras?.ready?.()).then(refreshAll);
})();
