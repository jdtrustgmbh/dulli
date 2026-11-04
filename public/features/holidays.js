// Public holidays for the 16 German states (+ Austria), computed offline from the Easter date.
// window.jdHolidays.forRange(from, to, stateCode) -> [{ date:'YYYY-MM-DD', name }] for from <= date < to.
(() => {
  const STATES = {
    BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen',
    MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland',
    SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen', AT: 'Österreich'
  };
  const ALL_DE = Object.keys(STATES).filter(code => code !== 'AT');
  const iso = (y, m, d) => { const date = new Date(Date.UTC(y, m - 1, d)); return date.toISOString().slice(0, 10); };
  const shift = (day, n) => { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); };

  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(year, month, day);
  }

  // Buß- und Bettag: the Wednesday before 23 November.
  const repentanceDay = year => { const date = new Date(Date.UTC(year, 10, 22)); while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };

  // [date, German name, English name, states]
  function germany(year) {
    const e = easter(year);
    const list = [
      [iso(year, 1, 1), 'Neujahr', "New Year's Day", ALL_DE],
      [iso(year, 1, 6), 'Heilige Drei Könige', 'Epiphany', ['BW', 'BY', 'ST']],
      [shift(e, -2), 'Karfreitag', 'Good Friday', ALL_DE],
      [e, 'Ostersonntag', 'Easter Sunday', ['BB']],
      [shift(e, 1), 'Ostermontag', 'Easter Monday', ALL_DE],
      [iso(year, 5, 1), 'Tag der Arbeit', 'Labour Day', ALL_DE],
      [shift(e, 39), 'Christi Himmelfahrt', 'Ascension Day', ALL_DE],
      [shift(e, 49), 'Pfingstsonntag', 'Whit Sunday', ['BB']],
      [shift(e, 50), 'Pfingstmontag', 'Whit Monday', ALL_DE],
      [shift(e, 60), 'Fronleichnam', 'Corpus Christi', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
      [iso(year, 8, 15), 'Mariä Himmelfahrt', 'Assumption Day', ['SL', 'BY']],
      [iso(year, 10, 3), 'Tag der Deutschen Einheit', 'German Unity Day', ALL_DE],
      [iso(year, 10, 31), 'Reformationstag', 'Reformation Day', year === 2017 ? ALL_DE : ['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH']],
      [iso(year, 11, 1), 'Allerheiligen', "All Saints' Day", ['BW', 'BY', 'NW', 'RP', 'SL']],
      [repentanceDay(year), 'Buß- und Bettag', 'Day of Repentance', ['SN']],
      [iso(year, 12, 25), '1. Weihnachtstag', 'Christmas Day', ALL_DE],
      [iso(year, 12, 26), '2. Weihnachtstag', 'Boxing Day', ALL_DE]
    ];
    const womensDay = [...(year >= 2019 ? ['BE'] : []), ...(year >= 2023 ? ['MV'] : [])];
    if (womensDay.length) list.push([iso(year, 3, 8), 'Internationaler Frauentag', "International Women's Day", womensDay]);
    if (year >= 2019) list.push([iso(year, 9, 20), 'Weltkindertag', "World Children's Day", ['TH']]);
    if (year === 2020 || year === 2025) list.push([iso(year, 5, 8), 'Tag der Befreiung', 'Liberation Day', ['BE']]);
    return list;
  }

  function austria(year) {
    const e = easter(year);
    return [
      [iso(year, 1, 1), 'Neujahr', "New Year's Day"], [iso(year, 1, 6), 'Heilige Drei Könige', 'Epiphany'],
      [shift(e, 1), 'Ostermontag', 'Easter Monday'], [iso(year, 5, 1), 'Staatsfeiertag', 'Labour Day'],
      [shift(e, 39), 'Christi Himmelfahrt', 'Ascension Day'], [shift(e, 50), 'Pfingstmontag', 'Whit Monday'],
      [shift(e, 60), 'Fronleichnam', 'Corpus Christi'], [iso(year, 8, 15), 'Mariä Himmelfahrt', 'Assumption Day'],
      [iso(year, 10, 26), 'Nationalfeiertag', 'National Day'], [iso(year, 11, 1), 'Allerheiligen', "All Saints' Day"],
      [iso(year, 12, 8), 'Mariä Empfängnis', 'Immaculate Conception'], [iso(year, 12, 25), 'Christtag', 'Christmas Day'],
      [iso(year, 12, 26), 'Stefanitag', "St. Stephen's Day"]
    ].map(item => [...item, ['AT']]);
  }

  const localIso = value => {
    if (typeof value === 'string') return value.slice(0, 10);
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const english = () => { try { return typeof window.jdLanguage === 'function' && window.jdLanguage() === 'en'; } catch { return false; } };

  function forRange(from, to, stateCode, options = {}) {
    const code = String(stateCode ?? '').toUpperCase();
    if (!STATES[code]) return [];
    const start = localIso(from), end = localIso(to);
    const lang = options.lang ?? (english() ? 'en' : 'de');
    const result = [];
    for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
      for (const [date, de, en, states] of code === 'AT' ? austria(year) : germany(year)) {
        if (date >= start && date < end && states.includes(code)) result.push({ date, name: lang === 'en' ? en : de });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  window.jdHolidays = { forRange, easter, states: STATES };
  window.jdRefreshCalendarWeek?.();
})();
