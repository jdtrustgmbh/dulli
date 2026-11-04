// Picture mode (Bildermodus) and sleep mode for the app and the shared display.
// extras.photoFrame = { photos: [{ id, dataUrl }], mode: 'picture'|'sleep' }  (mode = what idle time starts)
// Reads extras.settings: idleMinutes (0 = off), quietStart/quietEnd ('HH:MM', forced sleep), photoIntervalMin.
// Also shows the older URL photos from /api/household/demo/photos. API: window.jdPhotoFrame.
(() => {
  const MAX_UPLOADS = 15;
  const t = text => window.jdT?.(text) ?? text;
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const live = text => { const region = document.querySelector('#live-region, #display-status'); if (region) region.textContent = t(text); };
  const svg = (a, b, c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r" cx=".75" cy=".3" r=".6"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/><rect width="1600" height="900" fill="url(#r)"/><path d="M0 700 C400 600 700 820 1100 700 S1500 620 1600 660 V900 H0Z" fill="#fff" opacity=".12"/></svg>`)}`;
  const DEFAULTS = [
    { id: 'default-dawn', dataUrl: svg('#f4b860', '#e97962', '#fff3d6'), builtIn: true },
    { id: 'default-sea', dataUrl: svg('#2b8c87', '#173b4d', '#9fd8d3'), builtIn: true },
    { id: 'default-dusk', dataUrl: svg('#7a6fc4', '#173b4d', '#e3b5d6'), builtIn: true },
    { id: 'default-meadow', dataUrl: svg('#3fa66e', '#2b5d8c', '#e8f5c8'), builtIn: true }
  ];
  const frame = () => ({ photos: [], mode: 'picture', ...(window.jdExtras?.get('photoFrame', {}) ?? {}) });
  const settings = () => ({ idleMinutes: 15, quietStart: '', quietEnd: '', photoIntervalMin: 5, ...(window.jdExtras?.get('settings', {}) ?? {}) });
  let urlPhotos = [];
  const loadUrlPhotos = async () => { try { const response = await fetch('/api/household/demo/photos'); const list = response.ok ? await response.json() : []; urlPhotos = Array.isArray(list) ? list.filter(item => item?.url).map(item => ({ id: item.id, dataUrl: item.url, fromUrl: true })) : []; } catch { /* keep last */ } };
  const allPhotos = () => { const uploads = frame().photos ?? []; const own = [...uploads, ...urlPhotos]; return own.length ? own : DEFAULTS; };

  // ---- overlay ----
  let overlay; let mode = null; let reason = null; let slideTimer; let clockTimer; let index = -1; let front = 0;
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'jd-frame'; overlay.hidden = true; overlay.setAttribute('role', 'button'); overlay.tabIndex = 0;
    overlay.setAttribute('aria-label', 'Tap to wake');
    overlay.innerHTML = '<img class="jd-frame-img" alt=""><img class="jd-frame-img" alt=""><div class="jd-frame-clock"><time></time><span class="jd-frame-date"></span></div><p class="jd-frame-hint">Tap to wake</p>';
    document.body.append(overlay);
    overlay.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); stop(); });
    overlay.addEventListener('keydown', event => { event.preventDefault(); stop(); });
    window.jdTranslate?.();
  }
  const tickClock = () => {
    if (!overlay) return; const now = new Date();
    overlay.querySelector('time').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    overlay.querySelector('.jd-frame-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  function nextSlide() {
    const photos = allPhotos(); if (!photos.length || !overlay) return;
    index = (index + 1) % photos.length;
    const layers = overlay.querySelectorAll('.jd-frame-img');
    const incoming = layers[1 - front];
    incoming.onload = () => { incoming.classList.add('visible'); layers[front].classList.remove('visible'); front = 1 - front; };
    incoming.src = photos[index].dataUrl;
  }
  function start(nextMode = 'picture', why = 'manual') {
    if (!overlay) build();
    mode = nextMode === 'sleep' ? 'sleep' : 'picture'; reason = why;
    overlay.classList.toggle('sleep', mode === 'sleep');
    overlay.hidden = false; document.body.classList.add('jd-frame-active');
    tickClock(); clearInterval(clockTimer); clockTimer = setInterval(tickClock, 15000);
    clearInterval(slideTimer);
    if (mode === 'picture') {
      if (!overlay.querySelector('.jd-frame-img.visible')) nextSlide();
      const minutes = Math.max(0.05, Number(settings().photoIntervalMin) || 5);
      slideTimer = setInterval(nextSlide, minutes * 60000);
    }
    overlay.focus({ preventScroll: true });
  }
  function stop() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true; document.body.classList.remove('jd-frame-active');
    clearInterval(slideTimer); clearInterval(clockTimer); mode = null; reason = null; lastInput = Date.now();
  }

  // ---- idle + quiet window ----
  let lastInput = Date.now();
  const touch = () => { lastInput = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(type => window.addEventListener(type, touch, { capture: true, passive: true }));
  let lastMove = 0; window.addEventListener('pointermove', () => { const now = Date.now(); if (now - lastMove > 1000) { lastMove = now; touch(); } }, { passive: true });
  const minutesOf = value => { const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? ''); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
  function inQuietWindow(date = new Date()) {
    const { quietStart, quietEnd } = settings(); const from = minutesOf(quietStart); const to = minutesOf(quietEnd);
    if (from === null || to === null || from === to) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    return from < to ? now >= from && now < to : now >= from || now < to;
  }
  function check() {
    const idleMs = Date.now() - lastInput;
    const quiet = inQuietWindow();
    if (quiet) { if (mode !== 'sleep' && idleMs >= 60000) start('sleep', 'quiet'); return; }
    if (reason === 'quiet') stop();
    const idleMinutes = Number(settings().idleMinutes);
    if (!mode && idleMinutes > 0 && idleMs >= idleMinutes * 60000 && !document.querySelector('dialog[open]')) start(frame().mode === 'sleep' ? 'sleep' : 'picture', 'idle');
  }
  setInterval(check, 5000);

  // ---- photo management (rendered into the Photos panel by optional.js) ----
  const resize = (file, max = 1600) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let size = max; let quality = 0.8; let result = '';
      for (let attempt = 0; attempt < 6; attempt++) {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= 360000) break; // keep 15 photos inside the household store limit
        quality = Math.max(0.5, quality - 0.1); if (quality === 0.5) size = Math.round(size * 0.8);
      }
      resolve(result);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
  let deleteMode = false;
  function renderManager(host) {
    const { photos = [], mode: idleMode } = frame();
    host.innerHTML = `<div class="jd-frame-manager"><div class="jd-frame-toolbar"><p><strong>Picture mode</strong> · <span data-i18n-skip>${photos.length} / ${MAX_UPLOADS}</span> <span>own photos uploaded</span></p>
      <label class="jd-btn primary jd-file">＋ Upload photos<input type="file" accept="image/*" multiple hidden data-frame-upload></label>
      <button type="button" class="jd-btn ${deleteMode ? 'danger' : ''}" data-frame-delete-mode aria-pressed="${deleteMode}">${deleteMode ? 'Done deleting' : 'Delete mode'}</button>
      <button type="button" class="jd-btn" data-frame-start="picture">▶ Start picture mode</button><button type="button" class="jd-btn" data-frame-start="sleep">☾ Sleep</button>
      <label class="jd-field jd-inline">When idle<select data-frame-mode><option value="picture" ${idleMode !== 'sleep' ? 'selected' : ''}>Picture mode</option><option value="sleep" ${idleMode === 'sleep' ? 'selected' : ''}>Sleep mode</option></select></label></div>
      <p class="jd-frame-msg muted" role="status"></p>
      <div class="jd-frame-grid ${deleteMode ? 'deleting' : ''}">${[...photos, ...DEFAULTS].map(photo => `<figure data-frame-photo="${esc(photo.id)}"><img src="${esc(photo.dataUrl)}" alt="" loading="lazy">${photo.builtIn ? '<figcaption>★ Default</figcaption>' : (deleteMode ? `<button type="button" class="jd-frame-remove" data-frame-remove="${esc(photo.id)}" aria-label="Delete photo">✕</button>` : '')}</figure>`).join('')}</div>
      <p class="muted jd-frame-note">Default images are shown until you add your own and cannot be deleted.</p></div>`;
    const msg = text => { host.querySelector('.jd-frame-msg').textContent = t(text); };
    const rerender = () => { renderManager(host); window.jdTranslate?.(); };
    host.querySelector('[data-frame-upload]').addEventListener('change', async event => {
      const files = [...(event.target.files ?? [])]; if (!files.length) return;
      const current = frame().photos ?? []; const room = MAX_UPLOADS - current.length;
      if (room <= 0) { msg('Upload limit reached: at most 15 photos.'); return; }
      msg('Uploading…');
      const added = [];
      for (const file of files.slice(0, room)) { try { added.push({ id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, dataUrl: await resize(file) }); } catch { /* skip unreadable files */ } }
      await window.jdExtras.set('photoFrame', { ...frame(), photos: [...current, ...added] });
      rerender();
      msg(files.length > room ? 'Upload limit reached: at most 15 photos.' : `${added.length} ${t('photos uploaded')}`);
    });
    host.querySelector('[data-frame-delete-mode]').addEventListener('click', () => { deleteMode = !deleteMode; rerender(); });
    host.querySelectorAll('[data-frame-remove]').forEach(button => button.addEventListener('click', async () => {
      await window.jdExtras.set('photoFrame', { ...frame(), photos: (frame().photos ?? []).filter(photo => photo.id !== button.dataset.frameRemove) });
      rerender(); msg('Photo deleted');
    }));
    host.querySelectorAll('[data-frame-start]').forEach(button => button.addEventListener('click', () => start(button.dataset.frameStart)));
    host.querySelector('[data-frame-mode]').addEventListener('change', event => window.jdExtras.set('photoFrame', { ...frame(), mode: event.target.value }));
  }
  window.addEventListener('jd-extras-error', event => { if (event.detail === 'photoFrame') { live('Photos could not be saved (storage limit). Remove a photo and try again.'); const msg = document.querySelector('.jd-frame-msg'); if (msg) msg.textContent = t('Photos could not be saved (storage limit). Remove a photo and try again.'); } });

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({
    'Tap to wake': 'Zum Aufwecken tippen', 'Picture mode': 'Bildermodus', 'own photos uploaded': 'eigene Fotos hochgeladen', '＋ Upload photos': '＋ Fotos hochladen', 'Delete mode': 'Löschmodus',
    'Done deleting': 'Löschen beenden', '▶ Start picture mode': '▶ Bildermodus starten', '☾ Sleep': '☾ Schlafen', 'When idle': 'Bei Inaktivität', 'Sleep mode': 'Schlafmodus',
    'Default images are shown until you add your own and cannot be deleted.': 'Standardbilder werden gezeigt, bis eigene Fotos hochgeladen sind, und können nicht gelöscht werden.',
    'Upload limit reached: at most 15 photos.': 'Upload-Limit erreicht: höchstens 15 Fotos.', 'Uploading…': 'Wird hochgeladen…', 'photos uploaded': 'Fotos hochgeladen',
    'Photo deleted': 'Foto gelöscht', 'Delete photo': 'Foto löschen', '★ Default': '★ Standard',
    'Photos could not be saved (storage limit). Remove a photo and try again.': 'Fotos konnten nicht gespeichert werden (Speicherlimit). Bitte ein Foto entfernen und erneut versuchen.',
    'Photos from links': 'Fotos aus Links'
  });

  window.jdPhotoFrame = { start, stop, check, inQuietWindow, renderManager, photos: allPhotos, DEFAULTS, get mode() { return mode; }, refresh: loadUrlPhotos,
    // Pretend there was no input for `ms` milliseconds and evaluate idle/quiet rules now (demo + tests).
    simulateIdle: ms => { lastInput = Date.now() - ms; check(); } };
  loadUrlPhotos(); setInterval(loadUrlPhotos, 300000);
  window.jdExtras?.subscribe('settings', () => { if (mode === 'picture') start('picture', reason); });
})();
