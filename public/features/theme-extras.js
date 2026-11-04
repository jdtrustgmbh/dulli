// Familienzentrale look for the "rest" of the app (see docs/design.md):
// Verwalten/More tile grid with profile strip, icon tiles for settings headings, school lesson colors.
// Visual/markup only: every tile proxies to the existing [data-tool] buttons and handlers.
(() => {
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONS = {
    family: svg('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.2 2.6-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.4 14.2c2.5 0 4 1.5 4.4 4.3"/>'),
    treasure: svg('<path d="M4 11V9a8 6 0 0 1 16 0v2"/><rect x="3" y="11" width="18" height="9" rx="2.5"/><path d="M3 14.5h18"/><rect x="10.5" y="13" width="3" height="4" rx="1"/>'),
    meals: svg('<path d="M12 7.5c-1.2-1.3-3-1.6-4.6-.8C5 7.8 4 10.3 4.6 13c.6 2.8 2.4 5.5 4.4 5.5 1.2 0 1.7-.6 3-.6s1.8.6 3 .6c2 0 3.8-2.7 4.4-5.5.6-2.7-.4-5.2-2.8-6.3-1.6-.8-3.4-.5-4.6.8z"/><path d="M12 7.5c0-2 .8-3.4 2.4-4"/>'),
    photos: svg('<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>'),
    display: svg('<rect x="3" y="4.5" width="18" height="12.5" rx="2.5"/><path d="M9 20.5h6M12 17v3.5"/>'),
    sparkle: svg('<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6-5.7-1.8L10.2 9z"/><path d="M19 3.5v3M17.5 5h3"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z"/>'),
    school: svg('<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.5M21.5 9.5V15"/>'),
    link: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
    share: svg('<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M5 12.5v5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-5"/>'),
    globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>'),
    moon: svg('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
    palette: svg('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.7 1.8-1.6 0-1-.8-1.4-.8-2.4 0-1 .8-1.6 1.8-1.6h2.1a3.6 3.6 0 0 0 3.6-3.6c0-4.4-3.8-7.8-8.5-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>'),
    lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>'),
    users: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.8 3.3-6 7-6s6.4 2.2 7 6"/>'),
    data: svg('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>'),
    info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    chevron: svg('<path d="m9.5 6 6 6-6 6"/>'),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    trash: svg('<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>'),
    up: svg('<path d="m6 15 6-6 6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>')
  };
  window.jdIcons = ICONS;

  window.jdI18nExtend?.({ 'Settings': 'Einstellungen', 'Connect calendar': 'Kalender verbinden', 'Share & export': 'Teilen & Export', 'Display & language': 'Anzeige & Sprache', 'Add profile': 'Profil hinzufügen', 'Profiles': 'Profile', 'Good morning': 'Guten Morgen', 'Good afternoon': 'Guten Tag', 'Good evening': 'Guten Abend', 'TODAY': 'HEUTE' });

  // [data-tool] -> [icon, pastel, English label]. Tiles are re-decorated after other modules rewrite their text.
  const TOOLS = {
    Family: ['family', 'rose', 'Family'], Rewards: ['treasure', 'sun', 'Treasures'], Meals: ['meals', 'peach', 'Meals'],
    Photos: ['photos', 'sky', 'Photos'], 'Shared display': ['display', 'lav', 'Shared display'], 'Smart capture': ['sparkle', 'mint', 'Smart capture'],
    Settings: ['gear', 'grey', 'Settings']
  };
  const PROXIES = [
    { key: 'school', icon: 'school', tone: 'teal', label: 'School', run: () => document.querySelector('.tabs a[href="#school"]')?.click() },
    { key: 'connect', icon: 'link', tone: 'sky', label: 'Connect calendar', run: () => { const el = document.querySelector('.jd-more-providers'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.querySelector('button')?.focus({ preventScroll: true }); } },
    { key: 'share', icon: 'share', tone: 'mint', label: 'Share & export', run: () => { document.querySelector('.tool-grid [data-tool="Settings"]')?.click(); setTimeout(() => { const b = document.querySelector('.settings-panel [data-export]'); b?.scrollIntoView({ behavior: 'smooth', block: 'center' }); b?.focus({ preventScroll: true }); }, 250); } }
  ];
  const tileInner = (icon, label) => `<span class="jd-tile-ic" aria-hidden="true">${ICONS[icon]}</span><span class="jd-tile-label">${label}</span>`;

  function decorateTiles(grid) {
    grid.querySelectorAll(':scope > [data-tool]').forEach(button => {
      const spec = TOOLS[button.dataset.tool]; if (!spec) return;
      button.classList.add('jd-tile'); button.dataset.tone = spec[1];
      if (!button.querySelector('.jd-tile-ic')) { button.innerHTML = tileInner(spec[0], spec[2]); button.removeAttribute('data-i18n-skip'); }
    });
    for (const proxy of PROXIES) {
      if (grid.querySelector(`[data-jd-proxy="${proxy.key}"]`)) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'jd-tile'; button.dataset.jdProxy = proxy.key; button.dataset.tone = proxy.tone;
      button.innerHTML = tileInner(proxy.icon, proxy.label);
      button.addEventListener('click', proxy.run);
      grid.append(button);
    }
    const providers = grid.querySelector('[data-provider-grid]');
    if (providers && !grid.querySelector('.jd-more-providers-head')) {
      const head = document.createElement('h3'); head.className = 'jd-more-section jd-more-providers-head'; head.textContent = 'Connect calendar';
      grid.append(head);
    }
    providers?.classList.add('jd-more-providers');
    providers?.querySelectorAll('.provider-card').forEach(card => { if (!card.querySelector('.jd-tile-ic')) card.insertAdjacentHTML('afterbegin', `<span class="jd-tile-ic" data-tone="sky" aria-hidden="true">${ICONS.link}</span>`); });
  }

  const memberColor = name => window.jdMemberColor?.(name) ?? 'var(--teal)';
  let profileSig = '';
  async function renderProfiles(card) {
    let strip = card.querySelector('.jd-more-profiles');
    if (!strip) {
      strip = document.createElement('div'); strip.className = 'jd-more-profiles';
      strip.innerHTML = '<h3 class="jd-more-section">Profiles</h3><ul class="jd-more-profile-list"></ul>';
      card.querySelector('.jd-more-title')?.after(strip);
    }
    // Reuse the topbar avatar chips (photo/color already resolved by profiles-plus).
    const chips = [...document.querySelectorAll('.topbar .avatar-row .avatar-chip')];
    const sig = chips.map(c => c.title + c.style.cssText).join('|');
    if (sig === profileSig && strip.querySelector('li')) return;
    profileSig = sig;
    const list = strip.querySelector('ul'); list.replaceChildren();
    for (const chip of chips) {
      const li = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'jd-more-profile'; button.dataset.i18nSkip = '';
      const color = chip.style.backgroundColor || memberColor(chip.title);
      button.style.setProperty('--ring', color);
      const avatar = document.createElement('span'); avatar.className = 'jd-more-avatar'; avatar.setAttribute('aria-hidden', 'true');
      avatar.style.background = color;
      if (chip.classList.contains('has-photo')) avatar.style.backgroundImage = chip.style.backgroundImage; else avatar.textContent = (chip.title || '?').trim().charAt(0).toUpperCase();
      const name = document.createElement('span'); name.className = 'jd-more-name'; name.textContent = chip.title;
      button.append(avatar, name);
      button.addEventListener('click', () => document.querySelector('.tool-grid [data-tool="Family"]')?.click());
      li.append(button); list.append(li);
    }
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="jd-more-profile jd-more-add"><span class="jd-more-avatar" aria-hidden="true">${ICONS.plus}</span><span class="jd-more-name">Add profile</span></button>`;
    li.querySelector('button').addEventListener('click', () => { document.querySelector('.tool-grid [data-tool="Family"]')?.click(); setTimeout(() => document.querySelector('.members-panel .member-form input[name="name"]')?.focus(), 400); });
    list.append(li);
    window.jdTranslate?.();
  }

  function enhanceMore() {
    const grid = document.querySelector('.tool-grid'); const card = grid?.closest('.card'); if (!card) return;
    card.classList.add('jd-more');
    if (!card.querySelector('.jd-more-title')) {
      const title = document.createElement('h2'); title.className = 'jd-more-title'; title.textContent = 'Manage';
      (card.querySelector('h2') ?? grid).before(title);
    }
    decorateTiles(grid);
    // Language + moon rows -> one preference sheet below the tiles.
    let prefs = card.querySelector('.jd-more-prefs');
    if (!prefs) {
      prefs = document.createElement('section'); prefs.className = 'jd-more-prefs';
      prefs.innerHTML = '<h3 class="jd-more-section">Display & language</h3><div class="jd-sheet"></div>';
      card.append(prefs);
    }
    const sheet = prefs.querySelector('.jd-sheet');
    card.querySelectorAll(':scope > .language-row').forEach(row => {
      const moon = row.classList.contains('moon-row');
      if (!row.querySelector('.jd-tile-ic')) row.insertAdjacentHTML('afterbegin', `<span class="jd-tile-ic" data-tone="${moon ? 'lav' : 'sky'}" aria-hidden="true">${moon ? ICONS.moon : ICONS.globe}</span>`);
      row.classList.add('jd-row-item'); row.querySelector('input[type="checkbox"]')?.classList.add('jd-toggle');
      if (moon) sheet.append(row); else sheet.prepend(row);
    });
    renderProfiles(card);
  }

  const run = () => { try { enhanceMore(); } catch { /* purely visual */ } };
  if (window.__jdRegisterEnhancer) window.__jdRegisterEnhancer(run); else { run(); setTimeout(run, 400); }
  // Re-render profile strip whenever the More page is opened or avatars change.
  new MutationObserver(() => run()).observe(document.querySelector('.topbar') ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
})();
