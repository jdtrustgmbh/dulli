// Sub-pages of the Manage (More) screen: Frames, Timetables, Connect calendar and Recommend Dulli.
// Each tile in theme-extras.js calls window.jdHub.open(name); every page has a "< Manage" link back to the tile grid.
(() => {
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const say = text => { const el = document.querySelector('#live-region'); if (el) el.textContent = window.jdT?.(text) ?? text; };
  const guard = fn => (window.jdLock?.guard ? window.jdLock.guard('settings', fn) : fn());
  const moreCard = () => document.querySelector('.tool-grid')?.closest('.card');
  const OTHER_PANELS = '.school-panel, .calendar-week-panel, .rewards-panel, .meals-panel, .photos-panel, .members-panel, .routines-panel, .settings-panel';
  const SHARE_URL = 'https://dulli.jdtrust.de';
  const SHARE_TEXT = 'We organise our family life with Dulli - calendar, tasks, lists and rewards in one place:';

  function panelFor(name, title, intro) {
    let panel = document.querySelector(`.hub-panel[data-hub="${name}"]`);
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'card hub-panel'; panel.dataset.hub = name; panel.hidden = true;
      panel.innerHTML = `<div class="card-heading"><button type="button" class="text-link" data-hub-back>‹ Manage</button><div><h2>${title}</h2><p class="muted">${intro}</p></div></div><div class="hub-body"></div>`;
      panel.querySelector('[data-hub-back]').addEventListener('click', () => { panel.hidden = true; moreCard()?.removeAttribute('hidden'); });
      document.querySelector('.shell')?.append(panel);
    }
    return panel;
  }
  const reveal = panel => {
    moreCard()?.setAttribute('hidden', '');
    document.querySelectorAll(OTHER_PANELS).forEach(el => { el.hidden = true; });
    document.querySelectorAll('.hub-panel').forEach(el => { el.hidden = el !== panel; });
    window.jdTranslate?.(); panel.scrollIntoView?.({ block: 'start' });
  };
  // Leaving through a tab or another tool hides the sub-pages again.
  window.addEventListener('click', event => { if (event.target.closest?.('.hub-panel')) return; if (event.target.closest?.('.tabs a, [data-tool]')) document.querySelectorAll('.hub-panel').forEach(el => { el.hidden = true; }); }, true);

  const members = async () => { try { const household = await (await fetch('/api/household/demo')).json(); return window.jdProfiles?.sorted ? window.jdProfiles.sorted(household?.members ?? []) : (household?.members ?? []); } catch { return []; } };

  // ---- Frames -------------------------------------------------------------------------------------------
  async function renderFrames(panel) {
    const P = window.jdProfiles; if (!P) return;
    const body = panel.querySelector('.hub-body');
    const ladder = P.FRAMES.map(frame => `<li><span class="jd-avatar large jd-has-frame jd-ring-${frame.key}" aria-hidden="true">★</span><strong>${P.FRAME_LABEL[frame.key]}</strong><small>${frame.days} <span>days in a row</span></small></li>`).join('');
    const cards = (await members()).map(name => {
      const streak = window.jdTasks?.streakOf?.(name) ?? 0; const best = P.bestStreakOf(name); const current = P.frameOf(name);
      const options = [{ key: '', label: 'No frame', days: 0 }, ...P.FRAMES.map(frame => ({ key: frame.key, label: P.FRAME_LABEL[frame.key], days: frame.days }))].map(option => {
        const unlocked = best >= option.days;
        return `<button type="button" class="jd-chipbtn${option.key ? ` jd-ring-pick jd-ring-${option.key}` : ''}${current === option.key ? ' selected' : ''}" data-hub-frame="${option.key}" data-member="${esc(name)}" aria-pressed="${current === option.key}" ${unlocked ? '' : 'disabled'}>${unlocked ? '' : '🔒 '}${option.label}${option.days ? `<small>${option.days} <span>days in a row</span></small>` : ''}</button>`;
      }).join('');
      return `<article class="hub-card"><header>${P.avatarHTML(name, 'jd-avatar large')}<div><strong data-i18n-skip>${esc(name)}</strong><small><span>Streak</span>: ${streak} <span>days</span> · <span>Best</span>: ${best} <span>days</span></small></div></header><div class="jd-ring-row">${options}</div></article>`;
    }).join('');
    body.innerHTML = `<div class="hub-explain"><p><strong>How frames work</strong></p><p>Frames are a little reward for sticking with it. Whoever finishes their tasks day after day unlocks frames around the profile picture. A day counts when at least one task was done and no daily or weekly task that was scheduled for that day stayed open. Missing a day ends the streak, but frames that were unlocked stay unlocked.</p><ul class="hub-ladder">${ladder}</ul></div>${cards || '<p class="muted">No members yet</p>'}`;
    body.querySelectorAll('[data-hub-frame]').forEach(button => button.addEventListener('click', () => guard(async () => { await P.setFrame(button.dataset.member, button.dataset.hubFrame); say('Profile saved'); window.renderAvatars?.(); renderFrames(panel); })));
    window.jdTranslate?.();
  }

  // ---- Timetables ---------------------------------------------------------------------------------------
  async function renderSchool(panel) {
    const body = panel.querySelector('.hub-body'); let entries = [];
    try { entries = await (await fetch('/api/school')).json(); } catch { /* offline */ }
    const byChild = new Map(); for (const entry of Array.isArray(entries) ? entries : []) byChild.set(entry.child, [...(byChild.get(entry.child) ?? []), entry]);
    body.innerHTML = byChild.size
      ? `<ul class="hub-list">${[...byChild].map(([child, list]) => `<li><div><strong data-i18n-skip>${esc(child)}</strong><small>${list.length} <span>lessons</span></small></div><button type="button" class="jd-btn danger" data-school-clear="${esc(child)}">Delete timetable</button></li>`).join('')}</ul>${byChild.size > 1 ? '<button type="button" class="jd-btn danger" data-school-clear-all>Delete all timetables</button>' : ''}`
      : '<p class="muted">No timetables saved yet. Add lessons under School.</p>';
    const remove = async (list, label) => {
      if (!window.confirm(`${window.jdT?.(label) ?? label}`)) return;
      let failed = 0; for (const entry of list) { const response = await fetch(`/api/school/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }).catch(() => null); if (!response?.ok) failed += 1; }
      say(failed ? 'Some lessons could not be deleted' : 'Timetable deleted'); renderSchool(panel);
    };
    body.querySelectorAll('[data-school-clear]').forEach(button => button.addEventListener('click', () => guard(() => remove(byChild.get(button.dataset.schoolClear) ?? [], 'Delete this whole timetable? This cannot be undone.'))));
    body.querySelector('[data-school-clear-all]')?.addEventListener('click', () => guard(() => remove([...byChild.values()].flat(), 'Delete the timetables of all children? This cannot be undone.')));
    window.jdTranslate?.();
  }

  // ---- Meals ---------------------------------------------------------------------------------------------
  const MEAL_SLOTS = [{ key: 'breakfast', label: 'Breakfast', icon: '🌅' }, { key: 'lunch', label: 'Lunch', icon: '☀️' }, { key: 'dinner', label: 'Dinner', icon: '🌙' }];
  const mealSettings = () => ({ slots: {}, weekStart: 1, servings: null, ...(window.jdExtras?.get('mealSettings', null) ?? {}) });
  const saveMealSettings = patch => window.jdExtras.set('mealSettings', { ...mealSettings(), ...patch });
  function renderMeals(panel) {
    const body = panel.querySelector('.hub-body'); const current = mealSettings();
    const on = key => current.slots?.[key] !== false; const enabled = MEAL_SLOTS.filter(slot => on(slot.key)).length;
    const recipes = window.jdExtras.get('recipes', null); const items = [...(recipes?.items ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const days = [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']];
    body.innerHTML = `<section class="hub-card"><h3>Meals to plan</h3><p class="muted">Choose which meals show up in the weekly plan. At least one stays on.</p><div class="hub-checks">${MEAL_SLOTS.map(slot => `<label class="hub-check"><input type="checkbox" data-meal-slot="${slot.key}" ${on(slot.key) ? 'checked' : ''} ${on(slot.key) && enabled === 1 ? 'disabled' : ''}><span>${slot.icon} ${slot.label}</span></label>`).join('')}</div></section>
      <section class="hub-card"><h3>Week starts on</h3><select data-meal-weekstart aria-label="Week starts on">${days.map(([value, label]) => `<option value="${value}" ${Number(current.weekStart) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></section>
      <section class="hub-card"><h3>Default servings</h3><p class="muted">How many people usually eat. Planned meals and the shopping list are scaled to this number.</p><select data-meal-servings aria-label="Default servings"><option value="">As in the recipe</option>${Array.from({ length: 12 }, (_, i) => i + 1).map(n => `<option value="${n}" ${Number(current.servings) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></section>
      <section class="hub-card"><h3>Recipes <small>(${items.length})</small></h3>${items.length ? `<ul class="hub-list hub-recipes">${items.map(item => `<li data-recipe="${esc(item.id)}"><div><strong data-i18n-skip>${esc((item.emojis ?? []).join(' '))} ${esc(item.name)}</strong><small data-i18n-skip>${item.servings ? `${item.servings} · ` : ''}${esc((item.categories ?? []).join(', '))}</small></div><button type="button" class="jd-btn danger" data-recipe-delete>Delete</button></li>`).join('')}</ul>` : '<p class="muted">No recipes yet. Create them in the meal planner under Recipe box.</p>'}</section>`;
    body.querySelectorAll('[data-meal-slot]').forEach(box => box.addEventListener('change', () => guard(async () => { await saveMealSettings({ slots: { ...(mealSettings().slots ?? {}), [box.dataset.mealSlot]: box.checked } }); say('Settings saved'); renderMeals(panel); })));
    body.querySelector('[data-meal-weekstart]').addEventListener('change', event => guard(async () => { await saveMealSettings({ weekStart: Number(event.target.value) }); say('Settings saved'); }));
    body.querySelector('[data-meal-servings]').addEventListener('change', event => guard(async () => { await saveMealSettings({ servings: event.target.value ? Number(event.target.value) : null }); say('Settings saved'); }));
    body.querySelectorAll('[data-recipe-delete]').forEach(button => button.addEventListener('click', () => guard(async () => {
      const id = button.closest('li').dataset.recipe; const item = items.find(entry => entry.id === id); if (!item) return;
      if (!window.confirm(`${window.jdT?.('Delete recipe') ?? 'Delete recipe'} "${item.name}"? ${window.jdT?.('Planned meals keep their name.') ?? 'Planned meals keep their name.'}`)) return;
      const latest = window.jdExtras.get('recipes', null) ?? {};
      await window.jdExtras.set('recipes', { ...latest, items: (latest.items ?? []).filter(entry => entry.id !== id) }); say('Recipe deleted'); renderMeals(panel);
    })));
    window.jdTranslate?.();
  }

  // ---- Connect calendar ---------------------------------------------------------------------------------
  function renderConnect(panel) {
    const body = panel.querySelector('.hub-body');
    const attach = (tries = 0) => { const grid = document.querySelector('[data-provider-grid]'); if (grid) { if (grid.parentElement !== body) body.append(grid); grid.style.display = ''; window.jdTranslate?.(); } else if (tries < 40) setTimeout(() => attach(tries + 1), 250); };
    attach();
  }

  // ---- Recommend Dulli ----------------------------------------------------------------------------------
  function renderShare(panel) {
    const body = panel.querySelector('.hub-body');
    const text = window.jdT?.(SHARE_TEXT) ?? SHARE_TEXT; const enc = encodeURIComponent;
    const targets = [
      { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${SHARE_URL}`)}` },
      { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL)}` },
      { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(SHARE_URL)}` },
      { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(SHARE_URL)}` },
      { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(SHARE_URL)}&text=${enc(text)}` },
      { key: 'mail', label: 'E-mail', href: `mailto:?subject=${enc('Dulli')}&body=${enc(`${text}\n${SHARE_URL}`)}` }
    ];
    body.innerHTML = `<div class="hub-share"><p class="hub-share-text" data-i18n-skip>${esc(text)} ${esc(SHARE_URL)}</p><div class="hub-share-grid">${targets.map(item => `<a class="jd-btn hub-share-${item.key}" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer" data-i18n-skip>${item.label}</a>`).join('')}<button type="button" class="jd-btn" data-share-instagram data-i18n-skip>Instagram</button>${navigator.share ? '<button type="button" class="jd-btn primary" data-share-native>Share…</button>' : ''}<button type="button" class="jd-btn" data-share-copy>Copy link</button></div><p class="muted">Instagram has no share link for websites: we copy the text, paste it into a story, a post or your bio.</p><p class="muted">Your household data export is in Settings under Data.</p></div>`;
    const copy = async () => { try { await navigator.clipboard.writeText(`${text} ${SHARE_URL}`); say('Link copied'); } catch { window.prompt(window.jdT?.('Copy this text') ?? 'Copy this text', `${text} ${SHARE_URL}`); } };
    body.querySelector('[data-share-copy]').addEventListener('click', copy);
    body.querySelector('[data-share-instagram]').addEventListener('click', async () => { await copy(); window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer'); });
    body.querySelector('[data-share-native]')?.addEventListener('click', () => navigator.share({ title: 'Dulli', text, url: SHARE_URL }).catch(() => {}));
    window.jdTranslate?.();
  }

  const PAGES = {
    frames: { title: 'Frames', intro: 'Reward streaks with frames around the profile picture.', render: renderFrames },
    meals: { title: 'Meal settings', intro: 'Choose the meals, the first day of the week and the servings for the meal planner.', render: renderMeals },
    school: { title: 'Timetables', intro: 'Delete the timetable of a child, for example when a new school year starts.', render: renderSchool },
    connect: { title: 'Connect calendar', intro: 'Bring events from Google, CalDAV or an ICS link into Dulli. They are shown read-only.', render: renderConnect },
    share: { title: 'Recommend Dulli', intro: 'Tell other families about Dulli.', render: renderShare }
  };
  window.jdHub = {
    open(name) { const page = PAGES[name]; if (!page) return; const panel = panelFor(name, page.title, page.intro); reveal(panel); return page.render(panel); }
  };
  const refreshFrames = () => { const panel = document.querySelector('.hub-panel[data-hub="frames"]'); if (panel && !panel.hidden) renderFrames(panel); };
  ['profiles', 'taskMeta', 'streaks'].forEach(key => window.jdExtras?.subscribe(key, refreshFrames));

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({
    '‹ Manage': '‹ Verwalten', 'Meal settings': 'Essen-Einstellungen', 'Choose the meals, the first day of the week and the servings for the meal planner.': 'Lege Mahlzeiten, ersten Wochentag und Portionen für den Essensplan fest.', 'Meals to plan': 'Zu planende Mahlzeiten', 'Choose which meals show up in the weekly plan. At least one stays on.': 'Wähle, welche Mahlzeiten im Wochenplan erscheinen. Mindestens eine bleibt aktiv.', 'Week starts on': 'Woche beginnt am', 'Default servings': 'Standard-Portionen', 'How many people usually eat. Planned meals and the shopping list are scaled to this number.': 'Wie viele Personen normalerweise essen. Geplante Mahlzeiten und die Einkaufsliste werden auf diese Zahl umgerechnet.', 'As in the recipe': 'Wie im Rezept', 'Recipes': 'Rezepte', 'Delete': 'Löschen', 'No recipes yet. Create them in the meal planner under Recipe box.': 'Noch keine Rezepte. Lege sie im Essensplan unter Rezeptbox an.', 'Delete recipe': 'Rezept löschen', 'Planned meals keep their name.': 'Geplante Mahlzeiten behalten ihren Namen.', 'Recipe deleted': 'Rezept gelöscht', 'Settings saved': 'Einstellungen gespeichert', 'Monday': 'Montag', 'Sunday': 'Sonntag', 'Saturday': 'Samstag', 'Breakfast': 'Frühstück', 'Lunch': 'Mittagessen', 'Dinner': 'Abendessen', 'Frames': 'Rahmen', 'Timetables': 'Stundenpläne', 'Recommend Dulli': 'Dulli weiterempfehlen',
    'Reward streaks with frames around the profile picture.': 'Serien mit Rahmen um das Profilbild belohnen.',
    'Delete the timetable of a child, for example when a new school year starts.': 'Lösche den Stundenplan eines Kindes, zum Beispiel zu Beginn eines neuen Schuljahres.',
    'Bring events from Google, CalDAV or an ICS link into Dulli. They are shown read-only.': 'Hole Termine aus Google, CalDAV oder einem ICS-Link nach Dulli. Sie werden nur zum Lesen angezeigt.',
    'Tell other families about Dulli.': 'Erzähl anderen Familien von Dulli.',
    'How frames work': 'So funktionieren Rahmen',
    'Frames are a little reward for sticking with it. Whoever finishes their tasks day after day unlocks frames around the profile picture. A day counts when at least one task was done and no daily or weekly task that was scheduled for that day stayed open. Missing a day ends the streak, but frames that were unlocked stay unlocked.': 'Rahmen sind eine kleine Belohnung fürs Dranbleiben. Wer seine Aufgaben Tag für Tag erledigt, schaltet Rahmen um das Profilbild frei. Ein Tag zählt, wenn mindestens eine Aufgabe erledigt wurde und keine tägliche oder wöchentliche Aufgabe dieses Tages offen blieb. Ein verpasster Tag beendet die Serie, freigeschaltete Rahmen bleiben aber erhalten.',
    'Streak': 'Serie', 'days': 'Tage', 'Best': 'Rekord', 'lessons': 'Stunden',
    'Delete timetable': 'Stundenplan löschen', 'Delete all timetables': 'Alle Stundenpläne löschen',
    'No timetables saved yet. Add lessons under School.': 'Noch keine Stundenpläne gespeichert. Stunden fügst du unter Schule hinzu.',
    'Delete this whole timetable? This cannot be undone.': 'Den ganzen Stundenplan löschen? Das kann nicht rückgängig gemacht werden.',
    'Delete the timetables of all children? This cannot be undone.': 'Die Stundenpläne aller Kinder löschen? Das kann nicht rückgängig gemacht werden.',
    'Timetable deleted': 'Stundenplan gelöscht', 'Some lessons could not be deleted': 'Einige Stunden konnten nicht gelöscht werden',
    'We organise our family life with Dulli - calendar, tasks, lists and rewards in one place:': 'Wir organisieren unseren Familienalltag mit Dulli - Kalender, Aufgaben, Listen und Belohnungen an einem Ort:',
    'Instagram has no share link for websites: we copy the text, paste it into a story, a post or your bio.': 'Instagram hat keinen Teilen-Link für Webseiten: Wir kopieren den Text, füge ihn in eine Story, einen Beitrag oder deine Bio ein.',
    'Your household data export is in Settings under Data.': 'Den Export deiner Haushaltsdaten findest du unter Einstellungen bei Daten.',
    'Share…': 'Teilen…', 'Copy link': 'Link kopieren', 'Link copied': 'Link kopiert', 'Copy this text': 'Diesen Text kopieren', 'E-mail': 'E-Mail'
  });
})();
