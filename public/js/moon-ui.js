(() => {
  const KEY = 'jd-moon';
  const rad = deg => (deg % 360) * Math.PI / 180;
  const cache = new Map();

  // Meeus, Astronomical Algorithms ch. 49 (main periodic terms; accurate to a few minutes).
  function phaseTime(k, full) {
    const t = k / 1236.85;
    const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t * t - 0.00000015 * t ** 3 + 0.00000000073 * t ** 4;
    const e = 1 - 0.002516 * t - 0.0000074 * t * t;
    const m = rad(2.5534 + 29.1053567 * k - 0.0000014 * t * t - 0.00000011 * t ** 3);
    const mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * t * t + 0.00001238 * t ** 3 - 0.000000058 * t ** 4);
    const f = rad(160.7108 + 390.67050284 * k - 0.0016118 * t * t - 0.00000227 * t ** 3 + 0.000000011 * t ** 4);
    const om = rad(124.7746 - 1.56375588 * k + 0.0020672 * t * t + 0.00000215 * t ** 3);
    const c = full
      ? [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
      : [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208];
    const corr = c[0] * Math.sin(mp) + c[1] * e * Math.sin(m) + c[2] * Math.sin(2 * mp) + c[3] * Math.sin(2 * f)
      + c[4] * e * Math.sin(mp - m) + c[5] * e * Math.sin(mp + m) + c[6] * e * e * Math.sin(2 * m)
      - 0.00111 * Math.sin(mp - 2 * f) - 0.00057 * Math.sin(mp + 2 * f) + 0.00056 * e * Math.sin(2 * mp + m)
      - 0.00042 * Math.sin(3 * mp) + 0.00042 * e * Math.sin(m + 2 * f) + 0.00038 * e * Math.sin(m - 2 * f)
      - 0.00024 * e * Math.sin(2 * mp - m) - 0.00017 * Math.sin(om);
    return new Date((jde + corr - 2440587.5) * 86400000);
  }

  // All full/new moons between two dates, as { type, at }.
  function phases(from, to) {
    const result = [];
    const k0 = Math.floor((from.getFullYear() + (from.getMonth() / 12) - 2000) * 12.3685) - 2;
    const k1 = Math.ceil((to.getFullYear() + (to.getMonth() / 12) - 2000) * 12.3685) + 2;
    for (let k = k0; k <= k1; k++) {
      for (const full of [false, true]) {
        const key = `${k}${full ? 'f' : 'n'}`;
        if (!cache.has(key)) cache.set(key, { type: full ? 'full' : 'new', at: phaseTime(k + (full ? 0.5 : 0), full) });
        const phase = cache.get(key);
        if (phase.at >= from && phase.at < to) result.push(phase);
      }
    }
    return result.sort((a, b) => a.at - b.at);
  }

  const enabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
  const setEnabled = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* keep in-memory default */ } };
  const german = () => (window.jdLanguage ? window.jdLanguage() === 'de' : true);

  window.jdMoonEnabled = enabled;
  window.jdMoonPhases = phases;
  window.jdMoonLabel = phase => {
    const time = phase.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const name = phase.type === 'full' ? (german() ? 'Vollmond' : 'Full moon') : (german() ? 'Neumond' : 'New moon');
    return { icon: phase.type === 'full' ? '🌕' : '🌑', name, time };
  };

  const placeToggle = () => {
    if (document.querySelector('#moon-toggle')) return;
    const grid = document.querySelector('.tool-grid');
    if (!grid || !grid.closest('.card')) return;
    const row = document.createElement('div');
    row.className = 'language-row moon-row';
    row.innerHTML = '<label for="moon-toggle">Show full and new moon</label><input type="checkbox" id="moon-toggle" role="switch">';
    const box = row.querySelector('input');
    box.checked = enabled();
    box.addEventListener('change', () => { setEnabled(box.checked); window.jdRefreshCalendarWeek?.(); });
    grid.before(row);
    window.jdTranslate?.();
  };
  window.__jdRegisterEnhancer ? window.__jdRegisterEnhancer(placeToggle) : placeToggle();
})();
