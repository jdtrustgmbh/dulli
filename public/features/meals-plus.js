// meals-plus: weekly meal planner (7 days x Breakfast/Lunch/Dinner) + recipe box, persisted in the household extras store.
//   extras.recipes  = { categories: [name], items: [{ id, name, emojis: [<=4], photo: dataURL|null, servings, ingredients: 'one per line', prep, categories: [name] }] }
//   extras.mealPlan = { entries: [{ id, date: 'YYYY-MM-DD', slot: 'breakfast'|'lunch'|'dinner', recipeId|null, title, servings,
//                                   repeat?: { days: [0-6 getDay], until: 'YYYY-MM-DD'|null }, skip?: ['YYYY-MM-DD'] }] }
//   A one-off entry on a date overrides a repeating series for that slot. Public: window.jdMeals.render(panel, { backHtml, onRender }).
(() => {
  const SLOTS = [{ key: 'breakfast', label: 'Breakfast', icon: '🌅' }, { key: 'lunch', label: 'Lunch', icon: '☀️' }, { key: 'dinner', label: 'Dinner', icon: '🌙' }];
  const FOOD = ['🍝', '🍕', '🍔', '🌭', '🍟', '🍗', '🍖', '🥩', '🐟', '🍤', '🥔', '🍲', '🥣', '🍜', '🍛', '🍚', '🌯', '🌮', '🥪', '🍞', '🥞', '🧇', '🍳', '🥚', '🧀', '🥦', '🥕', '🌽', '🍅', '🥒', '🥬', '🌶️', '🍎', '🍌', '🍓', '🍇', '🍦', '🍰'];
  const PHOTO_LIMIT = 200 * 1024;
  const T = key => window.jdT?.(key) ?? key;
  const say = message => { const live = document.querySelector('#live-region'); if (live) live.textContent = message; };
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const locale = () => (window.jdLanguage?.() === 'en' ? 'en-GB' : 'de-DE');
  const pad = n => String(n).padStart(2, '0');
  const ymd = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parse = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (date, n) => { const next = new Date(date); next.setDate(next.getDate() + n); return next; };
  const monday = date => { const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()); return addDays(start, -((start.getDay() + 6) % 7)); };
  const fmt = (date, options) => new Intl.DateTimeFormat(locale(), options).format(date);
  const guard = async (area, fn) => (window.jdLock?.guard ? window.jdLock.guard(area, fn) : fn());
  const graphemes = text => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment); } catch { return [...text]; } };
  const emojisOf = text => graphemes(String(text ?? '')).filter(part => /\p{Extended_Pictographic}/u.test(part)).slice(0, 4);

  const recipes = () => { const value = window.jdExtras?.get('recipes', null); return { categories: [...(value?.categories ?? [])], items: [...(value?.items ?? [])] }; };
  const plan = () => ({ entries: [...(window.jdExtras?.get('mealPlan', null)?.entries ?? [])] });
  const saveRecipes = value => window.jdExtras?.set('recipes', value);
  const savePlan = value => window.jdExtras?.set('mealPlan', value);
  const recipeById = id => recipes().items.find(item => item.id === id);
  const ingredientLines = recipe => String(recipe?.ingredients ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  // Scale a leading quantity ("200 g Pasta", "1/2 Zwiebel") to the planned servings.
  const scaleLine = (line, factor) => {
    if (!factor || factor === 1) return line;
    return line.replace(/^(\d+(?:[.,]\d+)?|\d+\/\d+)(?=\s|[a-zA-Z]|$)/, match => { const value = match.includes('/') ? match.split('/').reduce((a, b) => Number(a) / Number(b)) : Number(match.replace(',', '.')); const scaled = Math.round(value * factor * 100) / 100; return String(scaled).replace('.', locale().startsWith('de') ? ',' : '.'); });
  };
  const shoppingLines = entry => { const recipe = recipeById(entry.recipeId); if (!recipe) return []; const factor = recipe.servings && entry.servings ? entry.servings / recipe.servings : 1; return ingredientLines(recipe).map(line => scaleLine(line, factor)); };

  // Which meal shows in a slot on a date: one-off first, then the newest matching repeat series.
  function mealAt(entries, key, slot) {
    const day = parse(key).getDay();
    const once = entries.filter(entry => entry.slot === slot && !entry.repeat && entry.date === key).at(-1);
    if (once) return once;
    return entries.filter(entry => entry.slot === slot && entry.repeat && key >= entry.date && (!entry.repeat.until || key <= entry.repeat.until) && (entry.date === key || entry.repeat.days.includes(day)) && !(entry.skip ?? []).includes(key)).at(-1) ?? null;
  }

  const thumb = (recipe, fallbackTitle) => recipe?.photo ? `<img class="mp-photo" src="${esc(recipe.photo)}" alt="">` : `<span class="mp-emojis" aria-hidden="true">${(recipe?.emojis?.length ? recipe.emojis : ['🍽️']).map(emoji => `<span>${esc(emoji)}</span>`).join('')}</span>`;

  let weekStart = monday(new Date());
  let panelRef = null; let options = {};
  let dialog = null;

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement('dialog'); dialog.className = 'mp-dialog'; dialog.setAttribute('aria-label', 'Meal planner');
    dialog.addEventListener('close', () => { dialog.innerHTML = ''; if (panelRef && !panelRef.hidden) renderWeek(); });
    document.body.append(dialog); return dialog;
  }
  const openDialog = (html, title) => { const box = ensureDialog(); box.innerHTML = `<div class="mp-dialog-inner"><header class="mp-dialog-head"><h2>${title}</h2><button type="button" class="mp-close" aria-label="Close">×</button></header><div class="mp-dialog-body">${html}</div></div>`; box.querySelector('.mp-close').addEventListener('click', () => box.close()); if (!box.open) box.showModal(); window.jdTranslate?.(); return box; };

  // ---------- Week view ----------
  async function render(panel, opts = {}) {
    panelRef = panel; options = opts;
    await window.jdExtras?.ready?.();
    renderWeek();
  }

  // Planner = header pills (Meals | Recipes) + calendar-week pill, then a 7-day x 3-slot grid of tinted tiles (docs/design.md "Essen").
  let view = 'plan';
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  const ICON = {
    meals: icon('<path d="M12 7.5c-1.2-1.3-3-1.6-4.6-.8C5 7.8 4 10.3 4.6 13c.6 2.8 2.4 5.5 4.4 5.5 1.2 0 1.7-.6 3-.6s1.8.6 3 .6c2 0 3.8-2.7 4.4-5.5.6-2.7-.4-5.2-2.8-6.3-1.6-.8-3.4-.5-4.6.8z"/><path d="M12 7.5c0-2 .8-3.4 2.4-4"/>'),
    book: icon('<path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h11M9 8h6"/>'),
    today: icon('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.4"/>'),
    cart: icon('<path d="M3.5 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.4-1.1L20.5 9H7"/><circle cx="10" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>'),
    repeat: icon('<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12"/><path d="M7 20.5 4 17.5l3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>'),
    plus: icon('<path d="M12 6v12M6 12h12"/>'),
    search: icon('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>'),
    edit: icon('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>')
  };
  // ISO 8601 week number (KW).
  const isoWeek = date => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - start) / 86400000 + 1) / 7); };
  const weekLabel = date => `${window.jdLanguage?.() === 'en' ? 'W' : 'KW'}${pad(isoWeek(date))}`;
  const emojiCount = recipe => (recipe?.photo ? 1 : Math.min(4, recipe?.emojis?.length || 1));

  function tileHtml(day, slot, entries) {
    const key = ymd(day); const entry = mealAt(entries, key, slot.key);
    const when = esc(fmt(day, { weekday: 'long', day: 'numeric', month: 'long' }));
    if (!entry) return `<button type="button" class="mp-slot mp-${slot.key} empty" data-date="${key}" data-slot="${slot.key}" aria-label="${slot.label} ${when}: add meal"><span class="mp-plus" aria-hidden="true">${ICON.plus}</span></button>`;
    const recipe = recipeById(entry.recipeId); const title = recipe?.name ?? entry.title ?? '';
    const visual = recipe ? `<span class="mp-thumb" data-count="${emojiCount(recipe)}">${thumb(recipe, title)}</span>` : '';
    return `<button type="button" class="mp-slot mp-${slot.key} filled${recipe ? '' : ' text-only'}" data-date="${key}" data-slot="${slot.key}" data-entry="${esc(entry.id)}" aria-label="${slot.label} ${when}: ${esc(title)}">${visual}<span class="mp-meal-name" data-i18n-skip>${esc(title)}</span>${entry.repeat ? `<span class="mp-repeat" title="Repeats">${ICON.repeat}<span class="sr-only">Repeats</span></span>` : ''}</button>`;
  }

  function headHtml(plannedCount) {
    const isThisWeek = ymd(weekStart) === ymd(monday(new Date()));
    const range = `${fmt(weekStart, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `<div class="mp-head">
      <div class="mp-seg" role="group" aria-label="Meal planner"><button type="button" class="mp-tab mp-open-plan" data-view="plan" aria-pressed="${view === 'plan'}">${ICON.meals}<span>Weekly meals</span></button><button type="button" class="mp-tab mp-open-recipes" data-view="recipes" aria-pressed="${view === 'recipes'}">${ICON.book}<span>Recipes</span></button></div>
      ${view === 'plan' ? `<div class="mp-weeknav"><button type="button" class="mp-icon-btn mp-thisweek" aria-label="This week"${isThisWeek ? ' aria-current="date"' : ''}>${ICON.today}</button><button type="button" class="mp-nav mp-prev" aria-label="Previous week">‹</button><span class="mp-kw" data-i18n-skip title="${esc(range)}">${esc(weekLabel(weekStart))}</span><span class="sr-only mp-range" data-i18n-skip>${esc(range)}</span><button type="button" class="mp-nav mp-next" aria-label="Next week">›</button></div>` : ''}
      <div class="mp-head-right">${view === 'plan' ? `<button type="button" class="mp-pill-btn mp-week-shop" ${plannedCount ? '' : 'disabled'}>${ICON.cart}<span>Add whole week</span></button>` : `<button type="button" class="mp-pill-btn primary mp-new-recipe">${ICON.plus}<span>New recipe</span></button>`}${options.backHtml ?? ''}</div>
    </div>`;
  }

  function renderWeek() {
    const panel = panelRef; if (!panel) return;
    panel.classList.add('mp-panel');
    panel.dataset.view = view;
    if (view === 'recipes') { renderRecipesView(panel); return; }
    const entries = plan().entries; const today = ymd(new Date());
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const plannedCount = days.reduce((sum, day) => sum + SLOTS.filter(slot => mealAt(entries, ymd(day), slot.key)).length, 0);
    const dayHead = day => { const key = ymd(day); const wd = fmt(day, { weekday: 'short' }).replace(/\.$/, ''); return `<div class="mp-day-head" data-i18n-skip>${key === today ? `<span class="sr-only">${esc(T('Today'))}</span>` : ''}<span class="mp-day-pill"><span class="mp-wd">${esc(wd)},</span> <span class="mp-dn">${day.getDate()}.</span></span></div>`; };
    panel.innerHTML = `${headHtml(plannedCount)}
      <div class="mp-scroll"><div class="mp-week">
        <div class="mp-gutter" aria-hidden="true"><span class="mp-gutter-head"></span>${SLOTS.map(slot => `<span class="mp-gutter-cell mp-${slot.key}" title="${slot.label}"><span class="mp-gutter-icon">${slot.icon}</span><span class="mp-gutter-label">${slot.label}</span></span>`).join('')}</div>
        ${days.map(day => `<div class="mp-day${ymd(day) === today ? ' is-today' : ''}" data-date="${ymd(day)}">${dayHead(day)}${SLOTS.map(slot => tileHtml(day, slot, entries)).join('')}</div>`).join('')}
      </div></div>`;
    options.onRender?.(panel);
    wireHead(panel, days);
    panel.querySelectorAll('.mp-slot.empty').forEach(button => button.addEventListener('click', () => openRecipeBox({ date: button.dataset.date, slot: button.dataset.slot })));
    panel.querySelectorAll('.mp-slot.filled').forEach(button => button.addEventListener('click', () => openMeal(button.dataset.date, button.dataset.slot)));
    window.jdTranslate?.();
  }

  function wireHead(panel, days) {
    panel.querySelectorAll('.mp-tab').forEach(tab => tab.addEventListener('click', () => { if (view === tab.dataset.view) return; view = tab.dataset.view; renderWeek(); panel.querySelector(`.mp-tab[data-view="${view}"]`)?.focus(); }));
    panel.querySelector('.mp-prev')?.addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeek(); panel.querySelector('.mp-prev')?.focus(); });
    panel.querySelector('.mp-next')?.addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeek(); panel.querySelector('.mp-next')?.focus(); });
    panel.querySelector('.mp-thisweek')?.addEventListener('click', () => { weekStart = monday(new Date()); renderWeek(); });
    panel.querySelector('.mp-week-shop')?.addEventListener('click', () => pushWeek(days));
    panel.querySelector('.mp-head .mp-new-recipe')?.addEventListener('click', () => openRecipeEditor(null, () => { dialog?.close(); renderWeek(); }));
  }

  // ---------- Recipe box (inline tile grid with category chips) ----------
  function renderRecipesView(panel) {
    panel.innerHTML = `${headHtml(0)}<div class="mp-recipes-view">${recipeToolsHtml()}<div class="mp-scroll"><div class="mp-recipe-grid"></div></div></div>`;
    options.onRender?.(panel);
    wireHead(panel, []);
    wireRecipeBox(panel, null);
    window.jdTranslate?.();
  }
  const recipeToolsHtml = () => {
    const data = recipes(); const count = cat => data.items.filter(item => cat === 'All' || (item.categories ?? []).includes(cat)).length;
    return `<div class="mp-box-tools"><label class="mp-searchbox">${ICON.search}<span class="sr-only">Search recipes</span><input class="mp-search" type="search" placeholder="Search recipes" value="${esc(query)}" autocomplete="off"></label></div>
      <div class="mp-filter" role="group" aria-label="Categories"><button type="button" class="mp-chip mp-cat" data-cat="All" aria-pressed="${filter === 'All'}"><span data-i18n-skip>${window.jdLanguage?.() === 'en' ? 'All' : 'Alle'}</span> <small>${count('All')}</small></button>${data.categories.map(cat => `<button type="button" class="mp-chip mp-cat" data-cat="${esc(cat)}" aria-pressed="${filter === cat}"><span data-i18n-skip>${esc(cat)}</span> <small>${count(cat)}</small></button>`).join('')}</div>`;
  };
  function wireRecipeBox(root, target) {
    const grid = root.querySelector('.mp-recipe-grid');
    const reopen = () => (target ? openRecipeBox(target) : (dialog?.open ? dialog.close() : renderWeek()));
    const draw = () => {
      const q = query.trim().toLowerCase();
      const items = recipes().items.filter(item => (filter === 'All' || (item.categories ?? []).includes(filter)) && (!q || `${item.name}\n${item.ingredients ?? ''}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      grid.innerHTML = items.length ? items.map(item => `<article class="mp-recipe-card"><button type="button" class="mp-recipe-pick" data-id="${esc(item.id)}" aria-label="${target ? 'Plan' : 'Open'} ${esc(item.name)}"><span class="mp-thumb" data-count="${emojiCount(item)}">${thumb(item)}</span><span class="mp-recipe-name" data-i18n-skip>${esc(item.name)}</span>${item.categories?.length ? `<small data-i18n-skip>${esc(item.categories.join(' · '))}</small>` : ''}</button><button type="button" class="mp-recipe-edit" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.name)}">${ICON.edit}</button></article>`).join('') : `<p class="muted mp-empty">${recipes().items.length ? 'No recipe matches.' : 'No recipes yet. Create your first one.'}</p>`;
      grid.querySelectorAll('.mp-recipe-pick').forEach(button => button.addEventListener('click', () => { const recipe = recipeById(button.dataset.id); if (target) planMeal(target, recipe); else openRecipeEditor(recipe, reopen); }));
      grid.querySelectorAll('.mp-recipe-edit').forEach(button => button.addEventListener('click', () => openRecipeEditor(recipeById(button.dataset.id), reopen)));
      window.jdTranslate?.();
    };
    root.querySelector('.mp-search').addEventListener('input', event => { query = event.target.value; draw(); });
    root.querySelectorAll('.mp-cat').forEach(chip => chip.addEventListener('click', () => { filter = chip.dataset.cat; root.querySelectorAll('.mp-cat').forEach(other => other.setAttribute('aria-pressed', String(other === chip))); draw(); }));
    draw();
  }

  async function pushToShopping(lines, doneMessage) {
    if (!lines.length) { say('No ingredients to add'); return null; }
    const result = await window.jdListsPlus?.addItems(window.jdListsPlus.SHOPPING, lines);
    if (!result) { say('Shopping list unavailable; retry when connected'); return null; }
    say(`${result.added} ${T(doneMessage)}${result.skipped ? ` · ${result.skipped} ${T('already on the list')}` : ''}`);
    return result;
  }
  function pushWeek(days) {
    const entries = plan().entries; const lines = [];
    for (const day of days) for (const slot of SLOTS) { const entry = mealAt(entries, ymd(day), slot.key); if (entry) lines.push(...shoppingLines(entry)); }
    return pushToShopping(lines, 'ingredients added to the shopping list');
  }

  // ---------- Plan mutations ----------
  async function planMeal(target, recipe, title) {
    await guard('meals', async () => {
      const value = plan(); const current = target.entryId ? value.entries.find(entry => entry.id === target.entryId) : null;
      const name = recipe?.name ?? title;
      if (current && !current.repeat) Object.assign(current, { recipeId: recipe?.id ?? null, title: name });
      else value.entries.push({ id: uid('meal'), date: target.date, slot: target.slot, recipeId: recipe?.id ?? null, title: name, servings: current?.servings ?? recipe?.servings ?? 2 });
      await savePlan(value);
      const earned = current ? 0 : await rewardPlanning(target, name);
      say(`${name}: ${T('meal planned')}${earned ? ` · +${earned} ${T('coins')}` : ''}`);
      if (earned) setTimeout(() => window.jdFlyCoin?.(document.querySelector(`.mp-slot[data-date="${target.date}"][data-slot="${target.slot}"]`)?.getBoundingClientRect(), earned), 120);
    });
    dialog?.close(); renderWeek();
  }

  // ---------- Reward for planning a meal ----------
  // Picking a meal for a still-empty slot earns coins for the profile that planned it ("Who plans?" in the recipe box).
  // One reward per date + slot, ever: replacing, removing and re-adding a meal cannot be farmed.
  const MEAL_COINS = 1;
  const PLANNER_KEY = 'jd-meal-planner';
  const plannerName = () => { try { return localStorage.getItem(PLANNER_KEY) || ''; } catch { return ''; } };
  const setPlanner = name => { try { if (name) localStorage.setItem(PLANNER_KEY, name); else localStorage.removeItem(PLANNER_KEY); } catch { /* storage blocked */ } };
  async function rewardPlanning(target, name) {
    const member = plannerName(); const X = window.jdExtras; if (!member || !X) return 0;
    const ledger = X.get('coins', []); const all = Array.isArray(ledger) ? ledger : [];
    if (all.some(entry => entry.reason === 'meal' && entry.date === target.date && entry.slot === target.slot)) return 0;
    await X.set('coins', [...all, { id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, member, delta: MEAL_COINS, reason: 'meal', date: target.date, slot: target.slot, label: name, at: new Date().toISOString() }]);
    return MEAL_COINS;
  }
  async function renderPlannerPicker(box) {
    const host = box.querySelector('[data-planner]'); if (!host) return;
    const household = await fetch('/api/household/demo').then(r => (r.ok ? r.json() : null)).catch(() => null);
    const members = window.jdProfiles?.sorted?.(household?.members ?? []) ?? household?.members ?? [];
    if (!members.length || !host.isConnected) return;
    let chosen = members.includes(plannerName()) ? plannerName() : '';
    const draw = () => {
      host.hidden = false;
      host.innerHTML = `<span class="mp-planner-label">${T('Who plans this meal?')} <small>(+${MEAL_COINS} ${T('coin')})</small></span><div class="mp-planner-list" role="group">${members.map(name => `<button type="button" class="mp-planner-chip" data-name="${esc(name)}" aria-pressed="${name === chosen}" data-i18n-skip>${window.jdProfiles?.avatarHTML?.(name, 'jd-avatar') ?? ''}<span>${esc(name)}</span></button>`).join('')}</div>`;
      host.querySelectorAll('.mp-planner-chip').forEach(button => button.addEventListener('click', () => { chosen = chosen === button.dataset.name ? '' : button.dataset.name; setPlanner(chosen); draw(); }));
    };
    draw();
  }
  async function removeMeal(date, slot, allRepeats) {
    await guard('meals', async () => {
      const value = plan(); const entry = mealAt(value.entries, date, slot); if (!entry) return;
      if (allRepeats || !entry.repeat) value.entries = value.entries.filter(item => item !== entry);
      if (!allRepeats) { const series = mealAt(value.entries, date, slot); if (series?.repeat) series.skip = [...(series.skip ?? []), date]; }
      await savePlan(value); say('Meal removed');
    });
    dialog?.close(); renderWeek();
  }
  async function updateEntry(date, slot, patch) {
    await guard('meals', async () => { const value = plan(); const entry = mealAt(value.entries, date, slot); if (!entry) return; Object.assign(entry, patch); for (const key of Object.keys(patch)) if (patch[key] === undefined) delete entry[key]; await savePlan(value); });
  }

  // ---------- Planned meal dialog: swap, remove, repeat, servings, ingredients ----------
  function openMeal(date, slot) {
    const entry = mealAt(plan().entries, date, slot); if (!entry) return;
    const recipe = recipeById(entry.recipeId); const title = recipe?.name ?? entry.title; const slotInfo = SLOTS.find(item => item.key === slot);
    const day = parse(date); const lines = shoppingLines(entry);
    const repeatDays = entry.repeat?.days ?? [day.getDay()];
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const html = `<div class="mp-meal-hero"><span class="mp-thumb big">${thumb(recipe, title)}</span><div><p class="eyebrow">${slotInfo.icon} ${slotInfo.label} · <span data-i18n-skip>${esc(fmt(day, { weekday: 'long', day: 'numeric', month: 'long' }))}</span></p><h3 data-i18n-skip>${esc(title)}</h3>${entry.repeat ? `<p class="muted">🔁 <span>Repeats</span> <span data-i18n-skip>${esc(entry.repeat.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(n => fmt(addDays(monday(new Date()), (n + 6) % 7), { weekday: 'short' })).join(', '))}${entry.repeat.until ? ` → ${esc(fmt(parse(entry.repeat.until), { day: 'numeric', month: 'short' }))}` : ''}</span></p>` : ''}</div></div>
      <div class="mp-servings" role="group" aria-label="Servings"><span>Servings</span><button type="button" class="mp-step" data-step="-1" aria-label="Fewer servings">−</button><output class="mp-servings-value">${esc(entry.servings ?? recipe?.servings ?? 2)}</output><button type="button" class="mp-step" data-step="1" aria-label="More servings">＋</button></div>
      ${recipe ? `<div class="mp-recipe-view">${lines.length ? `<h4>Ingredients</h4><ul data-i18n-skip>${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}${recipe.prep ? `<details><summary>Preparation</summary><p class="mp-prep" data-i18n-skip>${esc(recipe.prep)}</p></details>` : ''}</div>` : ''}
      <div class="mp-dialog-actions"><button type="button" class="jd-btn primary mp-meal-shop" ${lines.length ? '' : 'disabled'}>🛒 Add ingredients to shopping list</button><button type="button" class="jd-btn mp-swap">⇄ Swap meal</button><button type="button" class="jd-btn mp-repeat-toggle" aria-expanded="false">🔁 Repeat</button>${recipe ? '<button type="button" class="jd-btn mp-edit-recipe">✎ Edit recipe</button>' : ''}<button type="button" class="jd-btn danger mp-remove">${entry.repeat ? 'Remove this day' : 'Remove'}</button>${entry.repeat ? '<button type="button" class="jd-btn danger mp-remove-all">Remove all repeats</button>' : ''}</div>
      <form class="mp-repeat-form" hidden><fieldset><legend>Repeat on</legend><div class="mp-weekdays">${weekdayOrder.map(n => `<label class="mp-wd-check"><input type="checkbox" name="day" value="${n}" ${repeatDays.includes(n) ? 'checked' : ''}><span data-i18n-skip>${esc(fmt(addDays(monday(new Date()), (n + 6) % 7), { weekday: 'short' }))}</span></label>`).join('')}</div></fieldset><label class="jd-field">End date (optional)<input type="date" name="until" min="${date}" value="${esc(entry.repeat?.until ?? '')}"></label><div class="mp-dialog-actions"><button type="submit" class="jd-btn primary">Save repeat</button>${entry.repeat ? '<button type="button" class="jd-btn mp-stop-repeat">Stop repeating</button>' : ''}</div></form>`;
    const box = openDialog(html, `<span data-i18n-skip>${esc(title)}</span>`);
    let servings = Number(entry.servings ?? recipe?.servings ?? 2);
    box.querySelectorAll('.mp-step').forEach(button => button.addEventListener('click', async () => { servings = Math.min(20, Math.max(1, servings + Number(button.dataset.step))); box.querySelector('.mp-servings-value').textContent = servings; await updateEntry(date, slot, { servings }); say(`${T('Servings')}: ${servings}`); const fresh = mealAt(plan().entries, date, slot); const list = box.querySelector('.mp-recipe-view ul'); if (fresh && list) list.innerHTML = shoppingLines(fresh).map(line => `<li>${esc(line)}</li>`).join(''); }));
    box.querySelector('.mp-meal-shop').addEventListener('click', () => pushToShopping(shoppingLines(mealAt(plan().entries, date, slot) ?? entry), 'ingredients added to the shopping list'));
    box.querySelector('.mp-swap').addEventListener('click', () => openRecipeBox({ date, slot, entryId: entry.repeat ? null : entry.id }));
    box.querySelector('.mp-edit-recipe')?.addEventListener('click', () => openRecipeEditor(recipe, () => openMeal(date, slot)));
    box.querySelector('.mp-remove').addEventListener('click', () => removeMeal(date, slot, false));
    box.querySelector('.mp-remove-all')?.addEventListener('click', () => { if (window.confirm(T('Remove all repeats of this meal?'))) removeMeal(date, slot, true); });
    const form = box.querySelector('.mp-repeat-form'); const toggle = box.querySelector('.mp-repeat-toggle');
    toggle.addEventListener('click', () => { form.hidden = !form.hidden; toggle.setAttribute('aria-expanded', String(!form.hidden)); if (!form.hidden) form.scrollIntoView({ block: 'nearest' }); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(form); const days = data.getAll('day').map(Number);
      if (!days.length) { say('Choose at least one weekday'); return; }
      await updateEntry(date, slot, { repeat: { days, until: data.get('until') || null }, ...(entry.repeat ? {} : { date }) });
      say('Repeat saved'); dialog.close(); renderWeek();
    });
    box.querySelector('.mp-stop-repeat')?.addEventListener('click', async () => { await updateEntry(date, slot, { repeat: undefined, skip: undefined, date }); say('Repeat stopped'); dialog.close(); renderWeek(); });
  }

  // ---------- Recipe picker dialog (choose a recipe for an empty slot / swap) ----------
  let filter = 'All'; let query = '';
  function openRecipeBox(target) {
    if (filter !== 'All' && !recipes().categories.includes(filter)) filter = 'All';
    if (!target) { view = 'recipes'; if (dialog?.open) dialog.close(); else renderWeek(); return; }
    const slotInfo = SLOTS.find(item => item.key === target.slot);
    const html = `<p class="muted mp-target">${slotInfo.icon} ${slotInfo.label} · <span data-i18n-skip>${esc(fmt(parse(target.date), { weekday: 'long', day: 'numeric', month: 'long' }))}</span></p>
      <div class="mp-planner" data-planner hidden></div>
      ${recipeToolsHtml()}<div class="mp-dialog-actions"><button type="button" class="mp-pill-btn primary mp-new-recipe">${ICON.plus}<span>New recipe</span></button></div>
      <div class="mp-recipe-grid"></div>
      <form class="mp-quick"><label class="jd-field">Or just type a meal<input name="title" maxlength="100" placeholder="e.g. Leftovers" required></label><button type="submit" class="mp-pill-btn">Plan meal</button></form>`;
    const box = openDialog(html, 'Recipe box');
    wireRecipeBox(box, target);
    if (!target.entryId) renderPlannerPicker(box); // only an empty slot can earn coins
    box.querySelector('.mp-new-recipe').addEventListener('click', () => openRecipeEditor(null, saved => (saved ? planMeal(target, saved) : openRecipeBox(target))));
    box.querySelector('.mp-quick').addEventListener('submit', event => { event.preventDefault(); const title = new FormData(event.currentTarget).get('title').trim(); if (title) planMeal(target, null, title); });
  }

  // ---------- Recipe editor ----------
  async function downscale(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      let size = 720; let result = '';
      for (let attempt = 0; attempt < 8; attempt++) {
        const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.7, 0.58]) { result = canvas.toDataURL('image/jpeg', quality); if (result.length <= PHOTO_LIMIT) return result; }
        size = Math.round(size * 0.75);
      }
      throw new Error('photo too large');
    } finally { URL.revokeObjectURL(url); }
  }

  function openRecipeEditor(recipe, after) {
    const data = recipes(); const draft = { id: recipe?.id ?? uid('recipe'), name: recipe?.name ?? '', emojis: [...(recipe?.emojis ?? [])], photo: recipe?.photo ?? null, servings: recipe?.servings ?? 2, ingredients: recipe?.ingredients ?? '', prep: recipe?.prep ?? '', categories: [...(recipe?.categories ?? [])] };
    let categories = [...data.categories];
    const html = `<form class="mp-recipe-form">
      <label class="jd-field">Recipe name<input name="name" required maxlength="80" value="${esc(draft.name)}" placeholder="e.g. Lentil soup"></label>
      <div class="jd-field"><span>Emojis (up to 4)</span><div class="mp-emoji-row"><span class="mp-emoji-current" aria-live="polite"></span><input name="emojiText" class="mp-emoji-input" maxlength="16" placeholder="Type or pick" aria-label="Type emojis"></div><div class="mp-emoji-palette">${FOOD.map(emoji => `<button type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}</div></div>
      <div class="jd-field"><span>Photo (optional)</span><div class="mp-photo-row"><span class="mp-photo-preview"></span><label class="jd-btn mp-photo-pick">📷 Choose photo<input type="file" accept="image/*" class="mp-photo-input" hidden></label><button type="button" class="jd-btn danger mp-photo-remove">Remove photo</button></div></div>
      <label class="jd-field">Servings<input name="servings" type="number" min="1" max="20" value="${esc(draft.servings)}"></label>
      <label class="jd-field">Ingredients (one per line, quantity optional)<textarea name="ingredients" rows="6" placeholder="200 g lentils&#10;2 carrots&#10;1 onion">${esc(draft.ingredients)}</textarea></label>
      <label class="jd-field">Preparation<textarea name="prep" rows="5" placeholder="Steps…">${esc(draft.prep)}</textarea></label>
      <div class="jd-field"><span>Categories</span><div class="mp-cat-edit"></div><div class="mp-cat-add"><input class="mp-cat-new" maxlength="30" placeholder="New category" aria-label="New category"><button type="button" class="jd-btn mp-cat-create">＋ Add</button></div></div>
      <div class="mp-dialog-actions"><button type="submit" class="jd-btn primary">Save recipe</button>${recipe ? '<button type="button" class="jd-btn danger mp-recipe-delete">Delete recipe</button>' : ''}<button type="button" class="jd-btn mp-recipe-cancel">Cancel</button></div></form>`;
    const box = openDialog(html, recipe ? 'Edit recipe' : 'New recipe');
    const form = box.querySelector('form');
    const drawEmojis = () => { const current = box.querySelector('.mp-emoji-current'); current.innerHTML = draft.emojis.length ? draft.emojis.map((emoji, index) => `<button type="button" class="mp-emoji-chip" data-index="${index}" aria-label="Remove ${emoji}">${emoji}</button>`).join('') : '<span class="muted">🍽️</span>'; current.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => { draft.emojis.splice(Number(button.dataset.index), 1); drawEmojis(); })); };
    const addEmojis = list => { for (const emoji of list) if (draft.emojis.length < 4) draft.emojis.push(emoji); if (list.length && draft.emojis.length >= 4) say('Up to 4 emojis'); drawEmojis(); };
    const drawPhoto = () => { box.querySelector('.mp-photo-preview').innerHTML = draft.photo ? `<img src="${esc(draft.photo)}" alt="Recipe photo">` : ''; box.querySelector('.mp-photo-remove').hidden = !draft.photo; };
    const drawCats = () => { const host = box.querySelector('.mp-cat-edit'); host.innerHTML = categories.length ? categories.map(cat => `<span class="mp-cat-toggle"><button type="button" class="jd-chip" data-cat="${esc(cat)}" aria-pressed="${draft.categories.includes(cat)}"><span data-i18n-skip>${esc(cat)}</span></button><button type="button" class="mp-cat-del" data-cat="${esc(cat)}" aria-label="Delete category ${esc(cat)}">×</button></span>`).join('') : '<span class="muted">No categories yet</span>'; host.querySelectorAll('.jd-chip[data-cat]').forEach(chip => chip.addEventListener('click', () => { const cat = chip.dataset.cat; draft.categories = draft.categories.includes(cat) ? draft.categories.filter(item => item !== cat) : [...draft.categories, cat]; drawCats(); })); host.querySelectorAll('.mp-cat-del').forEach(button => button.addEventListener('click', () => { const cat = button.dataset.cat; if (!window.confirm(`${T('Delete category')} ${cat}?`)) return; categories = categories.filter(item => item !== cat); draft.categories = draft.categories.filter(item => item !== cat); drawCats(); })); window.jdTranslate?.(); };
    drawEmojis(); drawPhoto(); drawCats();
    box.querySelectorAll('.mp-emoji-palette [data-emoji]').forEach(button => button.addEventListener('click', () => addEmojis([button.dataset.emoji])));
    const emojiInput = box.querySelector('.mp-emoji-input');
    emojiInput.addEventListener('input', () => { const found = emojisOf(emojiInput.value); if (found.length) { addEmojis(found); emojiInput.value = ''; } });
    box.querySelector('.mp-photo-input').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { draft.photo = await downscale(file); drawPhoto(); say('Photo added'); } catch { say('Photo could not be used; try another image'); } });
    box.querySelector('.mp-photo-remove').addEventListener('click', () => { draft.photo = null; drawPhoto(); });
    const createCat = () => { const input = box.querySelector('.mp-cat-new'); const name = input.value.trim(); if (!name) return; if (!categories.includes(name)) categories.push(name); if (!draft.categories.includes(name)) draft.categories.push(name); input.value = ''; drawCats(); };
    box.querySelector('.mp-cat-create').addEventListener('click', createCat);
    box.querySelector('.mp-cat-new').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); createCat(); } });
    box.querySelector('.mp-recipe-cancel').addEventListener('click', () => (after ? after(null) : dialog.close()));
    box.querySelector('.mp-recipe-delete')?.addEventListener('click', () => guard('recipes', async () => {
      if (!window.confirm(`${T('Delete recipe')} ${draft.name}?`)) return;
      const value = recipes(); value.items = value.items.filter(item => item.id !== draft.id); value.categories = categories; await saveRecipes(value); say('Recipe deleted'); openRecipeBox(null);
    }));
    form.addEventListener('submit', event => { event.preventDefault(); guard('recipes', async () => {
      const values = new FormData(form); const name = String(values.get('name') ?? '').trim(); if (!name) return;
      addEmojis(emojisOf(values.get('emojiText')));
      const saved = { ...draft, name, servings: Math.min(20, Math.max(1, Number(values.get('servings')) || 2)), ingredients: String(values.get('ingredients') ?? '').trim(), prep: String(values.get('prep') ?? '').trim(), categories: draft.categories.filter(cat => categories.includes(cat)) };
      const value = recipes(); value.categories = categories; const index = value.items.findIndex(item => item.id === saved.id); if (index >= 0) value.items[index] = saved; else value.items.push(saved);
      await saveRecipes(value); say(`${name}: ${T('recipe saved')}`);
      if (after) after(saved); else openRecipeBox(null);
    }); });
  }

  // ---------- Today card: today's meals ----------
  function renderToday() {
    const column = document.querySelector('.today-grid .side-column'); if (!column || !window.jdExtras) return;
    const key = ymd(new Date()); const entries = plan().entries; const meals = SLOTS.map(slot => ({ slot, entry: mealAt(entries, key, slot.key) })).filter(item => item.entry);
    let card = column.querySelector('.mp-today-card');
    if (!meals.length) { card?.remove(); return; }
    if (!card) { card = document.createElement('article'); card.className = 'card mp-today-card'; column.prepend(card); }
    card.innerHTML = `<div class="card-heading"><div><p class="eyebrow">Meals today</p></div><a href="#more" class="text-link mp-today-open">Meal plan</a></div><ul class="mp-today-list">${meals.map(({ slot, entry }) => { const recipe = recipeById(entry.recipeId); return `<li class="mp-${slot.key}"><span class="mp-thumb small">${thumb(recipe)}</span><span><small>${slot.icon} ${slot.label}</small><strong data-i18n-skip>${esc(recipe?.name ?? entry.title)}</strong></span></li>`; }).join('')}</ul>`;
    window.jdTranslate?.();
  }
  // Window capture: navigation.js stops propagation of #-link clicks at document level.
  window.addEventListener('click', event => { if (event.target.closest?.('.mp-today-open')) setTimeout(() => document.querySelector('[data-tool="Meals"]')?.click(), 60); }, true);
  window.addEventListener('jd-extras-error', event => { if (['recipes', 'mealPlan'].includes(event.detail)) say('Meal plan could not be saved; retry when connected'); });

  const refreshAll = () => { renderToday(); if (panelRef && !panelRef.hidden && panelRef.isConnected && !dialog?.open) renderWeek(); };
  window.jdExtras?.subscribe('mealPlan', refreshAll);
  window.jdExtras?.subscribe('recipes', refreshAll);
  window.jdExtras?.ready?.()?.then(renderToday);

  window.jdMeals = { render, mealAt, scaleLine, emojisOf, ymd };
  window.jdI18nExtend?.({
    'Who plans this meal?': 'Wer plant das Essen?', 'coin': 'Münze', 'coins': 'Münzen',
    'Breakfast': 'Frühstück', 'Lunch': 'Mittagessen', 'Dinner': 'Abendessen', "What's for dinner this week?": 'Was gibt es diese Woche?', 'Previous week': 'Vorige Woche', 'Next week': 'Nächste Woche', 'This week': 'Diese Woche',
    '📖 Recipe box': '📖 Rezeptbox', 'Recipe box': 'Rezeptbox', '🛒 Add whole week': '🛒 Ganze Woche einkaufen', 'add meal': 'Mahlzeit hinzufügen', 'Repeats': 'Wiederholt sich', 'Servings': 'Portionen', 'Fewer servings': 'Weniger Portionen', 'More servings': 'Mehr Portionen',
    'Ingredients': 'Zutaten', 'Preparation': 'Zubereitung', '🛒 Add ingredients to shopping list': '🛒 Zutaten auf die Einkaufsliste', '⇄ Swap meal': '⇄ Mahlzeit tauschen', '🔁 Repeat': '🔁 Wiederholen', '✎ Edit recipe': '✎ Rezept bearbeiten',
    'Remove this day': 'Nur diesen Tag entfernen', 'Remove all repeats': 'Alle Wiederholungen entfernen', 'Remove all repeats of this meal?': 'Alle Wiederholungen dieser Mahlzeit entfernen?', 'Repeat on': 'Wiederholen am', 'End date (optional)': 'Enddatum (optional)', 'Save repeat': 'Wiederholung speichern', 'Stop repeating': 'Nicht mehr wiederholen',
    'Search recipes': 'Rezepte suchen', 'Weekly meals': 'Mahlzeiten', 'Recipes': 'Rezepte', 'Add whole week': 'Ganze Woche einkaufen', 'Today': 'Heute', '＋ New recipe': '＋ Neues Rezept', 'Categories': 'Kategorien', 'Or just type a meal': 'Oder einfach eine Mahlzeit eintippen', 'e.g. Leftovers': 'z. B. Reste', 'Plan meal': 'Mahlzeit planen', 'No recipe matches.': 'Kein passendes Rezept.', 'No recipes yet. Create your first one.': 'Noch keine Rezepte. Lege das erste an.',
    'Recipe name': 'Rezeptname', 'e.g. Lentil soup': 'z. B. Linsensuppe', 'Emojis (up to 4)': 'Emojis (bis zu 4)', 'Type or pick': 'Tippen oder wählen', 'Type emojis': 'Emojis eingeben', 'Photo (optional)': 'Foto (optional)', '📷 Choose photo': '📷 Foto wählen', 'Remove photo': 'Foto entfernen', 'Recipe photo': 'Rezeptfoto',
    'Ingredients (one per line, quantity optional)': 'Zutaten (eine pro Zeile, Menge optional)', 'Steps…': 'Schritte…', 'New category': 'Neue Kategorie', 'No categories yet': 'Noch keine Kategorien', 'Delete category': 'Kategorie löschen', 'Save recipe': 'Rezept speichern', 'Delete recipe': 'Rezept löschen', 'Edit recipe': 'Rezept bearbeiten', 'New recipe': 'Neues Rezept',
    'meal planned': 'Mahlzeit geplant', 'Meal removed': 'Mahlzeit entfernt', 'Repeat saved': 'Wiederholung gespeichert', 'Repeat stopped': 'Wiederholung beendet', 'Choose at least one weekday': 'Mindestens einen Wochentag wählen', 'recipe saved': 'Rezept gespeichert', 'Recipe deleted': 'Rezept gelöscht',
    'ingredients added to the shopping list': 'Zutaten auf die Einkaufsliste gesetzt', 'already on the list': 'schon auf der Liste', 'No ingredients to add': 'Keine Zutaten vorhanden', 'Shopping list unavailable; retry when connected': 'Einkaufsliste nicht verfügbar; bei Verbindung erneut versuchen',
    'Up to 4 emojis': 'Maximal 4 Emojis', 'Photo added': 'Foto hinzugefügt', 'Photo could not be used; try another image': 'Foto nicht verwendbar; bitte anderes Bild wählen', 'Meals today': 'Heute auf dem Tisch', 'Meal plan': 'Essensplan', 'Meal planner': 'Essensplan', 'MEAL PLANNER': 'ESSENSPLAN', 'Close': 'Schließen', 'Meal plan could not be saved; retry when connected': 'Essensplan konnte nicht gespeichert werden; bei Verbindung erneut versuchen'
  });
})();
