// lists-plus: Lists tab (overview of unlimited lists, pinned Shopping list, per-list emoji + sort mode,
// checked items sink to the bottom, quick-add, clear completed + undo).
// Shopping list = tile grid (docs/design.md "Listen / Einkauf"): tabs "Shopping list | Products", search/add field,
// category chips, beige tiles with emoji + quantity stepper; a built-in product catalog allows one-tap adding.
// Quantities live in the item title ("2 Milch", "400 g Spaghetti") so the list API stays unchanged.
// Per-list settings live in extras.listMeta = { [listName]: { sort: 'manual' | 'alpha', emoji } }.
// Public: window.jdListsPlus.render(moduleEl), .addItems(listName, titles) -> { added, skipped }, .SHOPPING, .catalog
(() => {
  const SHOP = 'Shopping', SHARED = 'Shared list';
  const LIST_EMOJIS = ['🛒', '📝', '🎒', '🎯', '🏠', '🎁', '✈️', '💊', '🧹', '📚', '🛠️', '🌱', '🧺', '🎉', '🐾', '💡'];
  const T = key => window.jdT?.(key) ?? key;
  const de = () => window.jdLanguage?.() !== 'en';
  const say = message => { const live = document.querySelector('#live-region'); if (live) live.textContent = message; };
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const listOf = item => item.listName || SHARED;
  // Built-in list names are translatable; user-created names are user data (never translated).
  const nameHtml = (name, cls) => (name === SHOP ? `<span class="${cls}">Groceries</span>` : name === SHARED ? `<span class="${cls}">Shared list</span>` : `<span class="${cls}" data-i18n-skip>${esc(name)}</span>`);
  const meta = () => window.jdExtras?.get('listMeta', {}) ?? {};
  const metaFor = name => ({ sort: 'manual', emoji: name === SHOP ? '🛒' : '📝', ...(meta()[name] ?? {}) });
  const setMeta = (name, patch) => window.jdExtras?.set('listMeta', { ...meta(), [name]: { ...(meta()[name] ?? {}), ...patch } });
  const guard = async fn => (window.jdLock?.guard ? window.jdLock.guard('lists', fn) : fn());
  const api = async (path, method = 'GET', body) => { const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status }); return response.json(); };
  const normalize = title => String(title ?? '').toLowerCase().replace(/^[\d.,/½¼¾\s-]+\s*(g|kg|ml|l|el|tl|tbsp|tsp|cup|cups|stk|stück|pck|packung|prise|dose|bund)?\.?\s+/i, '').replace(/\s+/g, ' ').trim();
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  const ICON = {
    check: svg('<path d="m5.5 12.5 4.2 4.2 8.8-9.4"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>'),
    plus: svg('<path d="M12 6v12M6 12h12"/>'),
    dots: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
    cart: svg('<path d="M3.5 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.4-1.1L20.5 9H7"/><circle cx="10" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>'),
    basket: svg('<path d="M4 10h16l-1.6 8.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z"/><path d="m8.5 10 3.5-5.5 3.5 5.5M9.5 14v2.5M14.5 14v2.5"/>')
  };

  // ---------- Built-in product catalog (German names, English fallback) ----------
  const CATEGORIES = [
    { key: 'produce', de: 'Obst & Gemüse', en: 'Fruit & Veg', emoji: '🥦' },
    { key: 'dairy', de: 'Milch & Eier', en: 'Dairy & Eggs', emoji: '🧀' },
    { key: 'bakery', de: 'Brot & Gebäck', en: 'Bread', emoji: '🥖' },
    { key: 'meat', de: 'Fleisch & Fisch', en: 'Meat & Fish', emoji: '🥩' },
    { key: 'pantry', de: 'Vorrat', en: 'Pantry', emoji: '🥫' },
    { key: 'drinks', de: 'Getränke', en: 'Drinks', emoji: '🧃' },
    { key: 'sweets', de: 'Süßes & Snacks', en: 'Snacks', emoji: '🍫' },
    { key: 'household', de: 'Haushalt', en: 'Household', emoji: '🧻' },
    { key: 'other', de: 'Sonstiges', en: 'Other', emoji: '🛒' }
  ];
  // [key, German, English, emoji, category, aliases]
  const CATALOG = [
    ['apples', 'Äpfel', 'Apples', '🍎', 'produce', 'apfel'], ['bananas', 'Bananen', 'Bananas', '🍌', 'produce'], ['strawberries', 'Erdbeeren', 'Strawberries', '🍓', 'produce'],
    ['grapes', 'Trauben', 'Grapes', '🍇', 'produce', 'weintrauben'], ['lemons', 'Zitronen', 'Lemons', '🍋', 'produce'], ['oranges', 'Orangen', 'Oranges', '🍊', 'produce', 'mandarinen'],
    ['pears', 'Birnen', 'Pears', '🍐', 'produce'], ['blueberries', 'Heidelbeeren', 'Blueberries', '🫐', 'produce', 'blaubeeren'], ['kiwi', 'Kiwis', 'Kiwis', '🥝', 'produce'],
    ['avocado', 'Avocados', 'Avocados', '🥑', 'produce'], ['tomatoes', 'Tomaten', 'Tomatoes', '🍅', 'produce', 'cherrytomaten'], ['cucumber', 'Gurke', 'Cucumber', '🥒', 'produce', 'gurken'],
    ['pepper', 'Paprika', 'Bell peppers', '🫑', 'produce'], ['carrots', 'Karotten', 'Carrots', '🥕', 'produce', 'möhren|karotte'], ['broccoli', 'Brokkoli', 'Broccoli', '🥦', 'produce'],
    ['lettuce', 'Salat', 'Lettuce', '🥬', 'produce', 'kopfsalat|spinat'], ['potatoes', 'Kartoffeln', 'Potatoes', '🥔', 'produce'], ['onions', 'Zwiebeln', 'Onions', '🧅', 'produce'],
    ['garlic', 'Knoblauch', 'Garlic', '🧄', 'produce'], ['corn', 'Mais', 'Sweetcorn', '🌽', 'produce'], ['mushrooms', 'Champignons', 'Mushrooms', '🍄', 'produce', 'pilze'],
    ['herbs', 'Basilikum', 'Basil', '🌿', 'produce', 'petersilie|kräuter|herbs'],
    ['milk', 'Milch', 'Milk', '🥛', 'dairy', 'vollmilch'], ['butter', 'Butter', 'Butter', '🧈', 'dairy'], ['cheese', 'Käse', 'Cheese', '🧀', 'dairy', 'parmesan|gouda|mozzarella|reibekäse'],
    ['yogurt', 'Joghurt', 'Yogurt', '🥣', 'dairy', 'quark|yoghurt'], ['eggs', 'Eier', 'Eggs', '🥚', 'dairy', 'ei'], ['cream', 'Sahne', 'Cream', '🍶', 'dairy', 'schmand|creme fraiche'],
    ['bread', 'Brot', 'Bread', '🍞', 'bakery', 'vollkornbrot'], ['rolls', 'Brötchen', 'Bread rolls', '🥖', 'bakery', 'baguette'], ['croissants', 'Croissants', 'Croissants', '🥐', 'bakery', 'butter croissant'],
    ['pretzels', 'Brezeln', 'Pretzels', '🥨', 'bakery', 'breze'], ['toast', 'Toastbrot', 'Sliced bread', '🍞', 'bakery', 'toast'], ['bagels', 'Bagels', 'Bagels', '🥯', 'bakery'],
    ['chicken', 'Hähnchen', 'Chicken', '🍗', 'meat', 'hühnchen|hähnchenbrust'], ['beef', 'Rindfleisch', 'Beef', '🥩', 'meat', 'steak'], ['mince', 'Hackfleisch', 'Minced meat', '🥩', 'meat', 'hack'],
    ['sausages', 'Würstchen', 'Sausages', '🌭', 'meat', 'wurst|wiener'], ['ham', 'Schinken', 'Ham', '🥓', 'meat', 'speck|bacon'], ['fish', 'Fisch', 'Fish', '🐟', 'meat', 'lachs|salmon'],
    ['shrimp', 'Garnelen', 'Prawns', '🦐', 'meat', 'shrimps'],
    ['pasta', 'Nudeln', 'Pasta', '🍝', 'pantry', 'spaghetti|penne|fusilli'], ['rice', 'Reis', 'Rice', '🍚', 'pantry'], ['flour', 'Mehl', 'Flour', '🌾', 'pantry'],
    ['sugar', 'Zucker', 'Sugar', '🍬', 'pantry'], ['salt', 'Salz', 'Salt', '🧂', 'pantry', 'pfeffer'], ['oil', 'Olivenöl', 'Olive oil', '🫒', 'pantry', 'öl|oil'],
    ['honey', 'Honig', 'Honey', '🍯', 'pantry'], ['jam', 'Marmelade', 'Jam', '🫙', 'pantry', 'konfitüre'], ['cereal', 'Müsli', 'Cereal', '🥣', 'pantry', 'haferflocken|cornflakes'],
    ['cans', 'Dosentomaten', 'Canned tomatoes', '🥫', 'pantry', 'passierte tomaten|tomatensoße'], ['coffee', 'Kaffee', 'Coffee', '☕', 'pantry'], ['tea', 'Tee', 'Tea', '🍵', 'pantry'],
    ['peanutbutter', 'Erdnussbutter', 'Peanut butter', '🥜', 'pantry', 'nüsse|nuts'],
    ['water', 'Wasser', 'Water', '💧', 'drinks', 'mineralwasser|sprudel'], ['juice', 'Saft', 'Juice', '🧃', 'drinks', 'orangensaft|apfelsaft'], ['lemonade', 'Limonade', 'Lemonade', '🥤', 'drinks', 'cola|schorle'],
    ['beer', 'Bier', 'Beer', '🍺', 'drinks'], ['wine', 'Wein', 'Wine', '🍷', 'drinks', 'rotwein|weißwein'],
    ['chocolate', 'Schokolade', 'Chocolate', '🍫', 'sweets'], ['cookies', 'Kekse', 'Biscuits', '🍪', 'sweets', 'cookies'], ['popcorn', 'Popcorn', 'Popcorn', '🍿', 'sweets', 'chips'],
    ['icecream', 'Eis', 'Ice cream', '🍨', 'sweets', 'eiscreme'], ['cake', 'Kuchen', 'Cake', '🍰', 'sweets', 'torte'], ['candy', 'Gummibärchen', 'Gummy bears', '🍬', 'sweets', 'süßigkeiten'],
    ['toiletpaper', 'Toilettenpapier', 'Toilet paper', '🧻', 'household', 'klopapier|küchenrolle'], ['dishsoap', 'Spülmittel', 'Washing-up liquid', '🧽', 'household', 'schwamm|spülschwamm'],
    ['detergent', 'Waschmittel', 'Laundry detergent', '🧺', 'household', 'weichspüler'], ['soap', 'Seife', 'Soap', '🧼', 'household', 'duschgel|shampoo'],
    ['toothpaste', 'Zahnpasta', 'Toothpaste', '🪥', 'household', 'zahnbürste|toothbrush'], ['binbags', 'Müllbeutel', 'Bin bags', '🗑️', 'household', 'müllsäcke'], ['batteries', 'Batterien', 'Batteries', '🔋', 'household']
  ].map(([key, deName, enName, emoji, cat, aliases]) => ({ key, de: deName, en: enName, emoji, cat, names: [deName, enName, ...(aliases ? aliases.split('|') : [])].map(name => name.toLowerCase()) }));
  // Extra emoji hints for non-shopping lists (packing, errands).
  const HINTS = [['sonnencreme|sunscreen', '🧴'], ['bade|swim', '🩱'], ['handtuch|towel', '🧺'], ['ladekabel|charger|kabel', '🔌'], ['pass|ausweis|passport', '🛂'], ['geschenk|gift|present', '🎁'], ['buch|book', '📚'], ['medikament|tablette|medicine', '💊'], ['schuhe|shoes', '👟'], ['jacke|jacket', '🧥'], ['brille|glasses', '👓'], ['schlafsack|sleeping bag', '🛌'], ['zelt|tent', '⛺'], ['spielzeug|toy', '🧸'], ['paket|parcel', '📦'], ['blumen|flowers', '💐'], ['müll|trash', '🗑️']];
  const productName = product => (de() ? product.de : product.en);
  const catLabel = key => { const cat = CATEGORIES.find(item => item.key === key) ?? CATEGORIES.at(-1); return de() ? cat.de : cat.en; };
  const sameWord = (a, b) => a === b || [a, b].some((x, i) => { const y = i ? a : b; return x.length > 3 && ['n', 's', 'e', 'en', 'es', 'er'].some(suffix => x + suffix === y); });
  function productFor(title) {
    const name = splitQty(title).name.toLowerCase().trim();
    if (!name) return null;
    return CATALOG.find(product => product.names.some(candidate => sameWord(candidate, name))) ?? null;
  }
  const leadingEmoji = text => { const match = String(text).match(/^\s*(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/u); return match?.[1] ?? null; };
  function emojiFor(title) {
    const own = leadingEmoji(title); if (own) return { emoji: own, own: true };
    const product = productFor(title); if (product) return { emoji: product.emoji };
    const lower = String(title).toLowerCase(); const hint = HINTS.find(([words]) => words.split('|').some(word => lower.includes(word)));
    return hint ? { emoji: hint[1] } : null;
  }

  // ---------- Quantity inside the title ----------
  const QTY_RE = /^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼|¾)\s*(g|kg|ml|l|el|tl|stk\.?|stück|pck\.?|packung(?:en)?|prise|dosen?|bund|becher|flaschen?|x|×)?\s+(?=\S)/i;
  function splitQty(title) {
    const text = String(title ?? '').trim(); const match = text.match(QTY_RE);
    if (!match) return { qty: 1, unit: '', name: text };
    const raw = match[1]; const qty = { '½': 0.5, '¼': 0.25, '¾': 0.75 }[raw] ?? (raw.includes('/') ? raw.split('/').reduce((a, b) => Number(a) / Number(b)) : Number(raw.replace(',', '.')));
    const unit = match[2] && !/^(x|×)$/i.test(match[2]) ? match[2] : '';
    return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit, name: text.slice(match[0].length) };
  }
  const stepFor = unit => (/^(g|ml)$/i.test(unit) ? 50 : /^(kg|l)$/i.test(unit) ? 0.5 : 1);
  const fmtQty = qty => { const rounded = Math.round(qty * 100) / 100; return de() ? String(rounded).replace('.', ',') : String(rounded); };
  const joinQty = (qty, unit, name) => (!unit && qty === 1 ? name : `${fmtQty(qty)} ${unit ? `${unit} ` : ''}${name}`);
  const qtyLabel = ({ qty, unit }) => `${fmtQty(qty)} ${unit || (de() ? 'Stück' : 'pcs')}`;

  let selected = (() => { try { return localStorage.getItem('jd-list-selected') || SHOP; } catch { return SHOP; } })();
  const select = name => { selected = name; try { localStorage.setItem('jd-list-selected', name); } catch { /* storage optional */ } };
  let host = null; let undoVisible = false; let localPending = [];
  let shopTab = 'list'; let shopCat = 'all'; let searchText = '';
  let lastItems = []; let lastQueued = [];

  async function loadOverview() {
    const [names, items] = await Promise.all([api('/api/lists').catch(() => []), api('/api/lists/items?limit=200').catch(() => [])]);
    const order = [SHOP];
    for (const { name } of names) if (!order.includes(name)) order.push(name);
    for (const item of items) if (!order.includes(listOf(item))) order.push(listOf(item));
    if (!names.some(entry => entry.name === SHOP)) api('/api/lists', 'POST', { name: SHOP }).catch(() => {});
    const open = Object.fromEntries(order.map(name => [name, items.filter(item => listOf(item) === name && !item.completed).length]));
    return { order, open };
  }

  const sortItems = (items, mode) => mode === 'alpha' ? [...items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })) : items;

  // Plain list row (non-shopping lists): round blue checkbox, emoji, title, move/delete.
  function rowHtml(item, manual) {
    const title = esc(item.title); const pending = item.pending ? ' pending' : '';
    const found = emojiFor(item.title);
    const moves = manual && !item.completed && !item.pending ? `<button type="button" class="lp-icon lp-move" data-move="up" aria-label="Move up ${title}">↑</button><button type="button" class="lp-icon lp-move" data-move="down" aria-label="Move down ${title}">↓</button>` : '';
    return `<li class="lp-item lp-row${item.completed ? ' completed' : ''}${pending}" data-id="${esc(item.id ?? '')}" data-title="${title}" data-action-ready="true"><button type="button" class="lp-check" aria-pressed="${item.completed ? 'true' : 'false'}" aria-label="${item.completed ? 'Undo' : 'Check'} ${title}" ${item.pending ? 'disabled' : ''}><span class="lp-box" aria-hidden="true">${ICON.check}</span></button>${found && !found.own ? `<span class="lp-row-emoji" aria-hidden="true">${found.emoji}</span>` : ''}<button type="button" class="lp-title" aria-label="Edit ${title}" ${item.pending ? 'disabled' : ''}><span data-i18n-skip>${title}</span>${item.pending ? '<small>sync pending</small>' : ''}</button>${moves}${item.pending ? '' : `<button type="button" class="lp-icon lp-del" aria-label="Delete ${title}">✕</button>`}</li>`;
  }

  // Shopping tile: tap = check off; stepper changes the quantity in the title; ⋯ menu = edit / move / delete.
  function tileHtml(item, manual) {
    const title = esc(item.title); const parts = splitQty(item.title); const product = productFor(item.title);
    const found = emojiFor(item.title); const name = esc(found?.own ? parts.name.replace(found.emoji, '').trim() : parts.name);
    const emoji = found?.emoji ?? CATEGORIES.find(cat => cat.key === 'other').emoji;
    const step = stepFor(parts.unit); const canLess = parts.qty - step >= step - 1e-9;
    const head = `<button type="button" class="lp-check" aria-pressed="${item.completed ? 'true' : 'false'}" aria-label="${item.completed ? 'Undo' : 'Check'} ${title}" ${item.pending ? 'disabled' : ''}><span class="lp-tile-name" data-i18n-skip>${name}</span><span class="lp-tile-emoji" aria-hidden="true">${emoji}</span><span class="lp-tick" aria-hidden="true">${ICON.check}</span></button>`;
    if (item.pending) return `<li class="lp-item lp-tile pending" data-title="${title}" data-cat="${product?.cat ?? 'other'}">${head}<div class="lp-tile-foot"><small class="lp-pending-note">sync pending</small></div></li>`;
    const foot = item.completed
      ? `<div class="lp-tile-foot"><span class="lp-qty-static" data-i18n-skip>${esc(qtyLabel(parts))}</span>`
      : `<div class="lp-tile-foot"><div class="lp-stepper" role="group" aria-label="Quantity ${title}"><button type="button" class="lp-step" data-step="-1" aria-label="Fewer of ${title}" ${canLess ? '' : 'disabled'}>−</button><output data-i18n-skip>${esc(qtyLabel(parts))}</output><button type="button" class="lp-step" data-step="1" aria-label="More of ${title}">+</button></div>`;
    const menu = `<button type="button" class="lp-more" aria-haspopup="true" aria-expanded="false" aria-label="Options for ${title}">${ICON.dots}</button></div><div class="lp-menu" hidden><button type="button" class="lp-title" aria-label="Edit ${title}">✎ <span>Edit</span><span class="sr-only" data-i18n-skip>${title}</span></button>${manual && !item.completed ? `<button type="button" class="lp-move" data-move="up" aria-label="Move up ${title}">↑ <span>Move up</span></button><button type="button" class="lp-move" data-move="down" aria-label="Move down ${title}">↓ <span>Move down</span></button>` : ''}<button type="button" class="lp-del" aria-label="Delete ${title}">✕ <span>Delete</span></button></div>`;
    return `<li class="lp-item lp-tile${item.completed ? ' completed' : ''}" data-id="${esc(item.id ?? '')}" data-title="${title}" data-cat="${product?.cat ?? 'other'}" data-action-ready="true">${head}${foot}${menu}</li>`;
  }

  // Catalog tile (Products tab) for a product that is not open on the list: tap = add (or reopen a checked one).
  function productTileHtml(product, completedItem) {
    const name = esc(productName(product));
    return `<li class="lp-item lp-tile lp-product" data-action-ready="true" data-product="${product.key}" data-cat="${product.cat}"${completedItem ? ` data-reopen="${esc(completedItem.id)}"` : ''}><button type="button" class="lp-add" aria-label="Add ${name}"><span class="lp-tile-name" data-i18n-skip>${name}</span><span class="lp-tile-emoji" aria-hidden="true">${product.emoji}</span><span class="lp-add-badge" aria-hidden="true">${ICON.plus}</span></button></li>`;
  }

  async function renderItems() {
    if (!host?.isConnected) return;
    const data = host.querySelector('.module-data');
    let items;
    try { items = (await api(`/api/lists/items?list=${encodeURIComponent(selected)}&limit=200`)).reverse(); } catch { data.innerHTML = '<p class="muted">Shared data unavailable; Today remains available.</p>'; return; }
    // Pending = waiting in lists-ui's queue (fetch threw) or in offline-ui's generic queue (synthesized {queued:true}).
    const present = new Set(items.map(item => item.title));
    localPending = localPending.filter(item => !present.has(item.title));
    lastItems = items;
    lastQueued = [...(window.jdListQueue?.pending(selected) ?? []), ...localPending.filter(item => item.listName === selected)].map(item => ({ title: item.title, pending: true }));
    drawItems();
  }

  const matchesSearch = text => { const q = searchText.trim().toLowerCase(); return !q || String(text).toLowerCase().includes(q); };

  function drawItems() {
    if (!host?.isConnected) return;
    const data = host.querySelector('.module-data'); if (!data) return;
    const { sort } = metaFor(selected); const manual = sort === 'manual';
    const items = lastItems;
    if (selected !== SHOP) {
      const open = [...sortItems(items.filter(item => !item.completed), sort), ...lastQueued];
      const done = sortItems(items.filter(item => item.completed), sort);
      data.innerHTML = `<div class="lp-card">${open.length ? `<ul class="lp-items lp-rows">${open.map(item => rowHtml(item, manual)).join('')}</ul>` : `<p class="muted lp-empty">${done.length ? 'Everything checked off.' : 'No items yet. Add the first one above.'}</p>`}
        ${done.length ? `<p class="lp-done-label">Checked off <span class="lp-count">${done.length}</span></p><ul class="lp-items lp-rows lp-done">${done.map(item => rowHtml(item, false)).join('')}</ul>` : ''}</div>`;
      wireItems(data, items);
      window.jdTranslate?.();
      return;
    }
    // Shopping: category chips + tile grid (list tab) or catalog grid (products tab).
    const catOf = item => productFor(item.title)?.cat ?? 'other';
    const openItems = [...sortItems(items.filter(item => !item.completed), sort), ...lastQueued];
    const doneItems = sortItems(items.filter(item => item.completed), sort);
    const inCat = cat => entry => shopCat === 'all' || cat(entry) === shopCat;
    let chips; let body;
    if (shopTab === 'list') {
      const visible = [...openItems, ...doneItems].filter(item => matchesSearch(item.title));
      const counts = Object.fromEntries(CATEGORIES.map(cat => [cat.key, visible.filter(item => catOf(item) === cat.key).length]));
      chips = [['all', de() ? 'Alle' : 'All', visible.length], ...CATEGORIES.filter(cat => counts[cat.key]).map(cat => [cat.key, `${cat.emoji} ${de() ? cat.de : cat.en}`, counts[cat.key]])];
      const open = openItems.filter(item => matchesSearch(item.title)).filter(inCat(catOf));
      const done = doneItems.filter(item => matchesSearch(item.title)).filter(inCat(catOf));
      const hint = searchText.trim() ? `<p class="muted lp-empty">${open.length + done.length ? '' : '<span>No matches.</span> '}<span>Press Enter to add</span> <strong data-i18n-skip>„${esc(searchText.trim())}“</strong></p>` : '';
      body = (open.length ? `<ul class="lp-items lp-grid">${open.map(item => tileHtml(item, manual)).join('')}</ul>` : (searchText.trim() ? '' : `<p class="muted lp-empty">${done.length ? 'Everything checked off.' : 'Nothing to buy yet. Tap a product or type an item above.'}</p>`))
        + hint
        + (done.length ? `<p class="lp-done-label">Checked off <span class="lp-count">${done.length}</span></p><ul class="lp-items lp-grid lp-done">${done.map(item => tileHtml(item, false)).join('')}</ul>` : '');
    } else {
      const openByProduct = new Map(); const doneByProduct = new Map();
      for (const item of items) { const product = productFor(item.title); if (!product) continue; const map = item.completed ? doneByProduct : openByProduct; if (!map.has(product.key)) map.set(product.key, item); }
      const products = CATALOG.filter(product => matchesSearch(`${product.de} ${product.en} ${product.names.join(' ')}`));
      const counts = Object.fromEntries(CATEGORIES.map(cat => [cat.key, products.filter(product => product.cat === cat.key).length]));
      chips = [['all', de() ? 'Alle' : 'All', products.length], ...CATEGORIES.filter(cat => counts[cat.key]).map(cat => [cat.key, `${cat.emoji} ${de() ? cat.de : cat.en}`, counts[cat.key]])];
      const shown = products.filter(product => shopCat === 'all' || product.cat === shopCat);
      const free = searchText.trim() && !CATALOG.some(product => product.names.includes(searchText.trim().toLowerCase())) ? `<li class="lp-item lp-tile lp-product lp-free" data-action-ready="true"><button type="button" class="lp-add lp-add-free" aria-label="Add ${esc(searchText.trim())}"><span class="lp-tile-name" data-i18n-skip>${esc(searchText.trim())}</span><span class="lp-tile-emoji" aria-hidden="true">${ICON.plus}</span><span class="lp-add-badge" aria-hidden="true">${ICON.plus}</span></button></li>` : '';
      body = `<ul class="lp-items lp-grid lp-catalog">${free}${shown.map(product => (openByProduct.has(product.key) ? tileHtml(openByProduct.get(product.key), false) : productTileHtml(product, doneByProduct.get(product.key)))).join('')}</ul>`;
    }
    if (!chips.some(([key]) => key === shopCat)) { shopCat = 'all'; return drawItems(); }
    data.innerHTML = `<div class="lp-cats" role="group" aria-label="Categories" data-i18n-skip>${chips.map(([key, label, count]) => `<button type="button" class="lp-cat" data-cat="${key}" aria-pressed="${key === shopCat}"><span>${esc(label)}</span><small>${count}</small></button>`).join('')}</div>${body}`;
    data.querySelectorAll('.lp-cat').forEach(chip => chip.addEventListener('click', () => { shopCat = chip.dataset.cat; drawItems(); host.querySelector(`.lp-cat[data-cat="${shopCat}"]`)?.focus(); }));
    data.querySelectorAll('.lp-product .lp-add').forEach(button => button.addEventListener('click', () => guard(async () => {
      const tile = button.closest('.lp-product');
      if (tile.dataset.reopen) { try { await api(`/api/lists/items/${tile.dataset.reopen}/reopen`, 'POST'); say('List item reopened'); } catch { say('List item action unavailable; Today remains available'); } refresh(); return; }
      const product = CATALOG.find(entry => entry.key === tile.dataset.product);
      const title = product ? productName(product) : searchText.trim();
      if (!product) { searchText = ''; const input = host.querySelector('#module-list-input'); if (input) input.value = ''; }
      await addOne(title, SHOP);
    })));
    wireItems(data, items);
    window.jdTranslate?.();
  }

  async function addOne(title, listName) {
    if (!navigator.onLine && window.jdListQueue) { window.jdListQueue.push({ title, listName }); say('List item saved locally; sync pending'); await renderItems(); return; }
    try { const created = await api('/api/lists/items', 'POST', { title, listName }); if (created?.queued) { localPending.push({ title, listName }); say('List item saved locally; sync pending'); } else say('List item added'); }
    catch { window.jdListQueue?.push({ title, listName }); say('List item saved locally; sync pending'); }
    await refresh();
  }

  function closeMenus(except) { host?.querySelectorAll('.lp-menu:not([hidden])').forEach(menu => { if (menu === except) return; menu.hidden = true; menu.closest('.lp-item')?.querySelector('.lp-more')?.setAttribute('aria-expanded', 'false'); }); }

  function wireItems(data, items) {
    data.querySelectorAll('.lp-item[data-id]').forEach(row => {
      const id = row.dataset.id; const title = row.dataset.title; const item = items.find(entry => entry.id === id);
      if (!item) return;
      row.querySelector('.lp-check')?.addEventListener('click', async () => {
        try { await api(`/api/lists/items/${id}/${item.completed ? 'reopen' : 'check'}`, 'POST'); say(item.completed ? 'List item reopened' : 'List item checked'); window.loadSharedData?.(); refresh(); } catch { say('List item action unavailable; Today remains available'); }
      });
      row.querySelector('.lp-title')?.addEventListener('click', () => guard(async () => {
        const next = window.prompt(T('List item'), title)?.trim(); if (!next || next === title) return;
        try { await api(`/api/lists/items/${id}`, 'PUT', { title: next }); say('List item updated'); refresh(); } catch { say('List item update unavailable; retry when connected'); }
      }));
      row.querySelector('.lp-del')?.addEventListener('click', () => guard(async () => {
        if (!window.confirm(`${T('Delete')} ${title}?`)) return;
        try { await api(`/api/lists/items/${id}`, 'DELETE'); say('List item deleted'); refresh(); } catch { say('List item deletion unavailable; retry when connected'); }
      }));
      row.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => guard(async () => {
        try { await api(`/api/lists/items/${id}/move`, 'POST', { direction: button.dataset.move }); say(`List item moved ${button.dataset.move}`); await renderItems(); host.querySelector(`.lp-item[data-id="${CSS.escape(id)}"] [data-move="${button.dataset.move}"]`)?.focus(); } catch { say('List order unavailable; retry when connected'); }
      })));
      row.querySelectorAll('.lp-step').forEach(button => button.addEventListener('click', () => guard(async () => {
        const parts = splitQty(item.title); const step = stepFor(parts.unit);
        const qty = Math.max(step, Math.round((parts.qty + step * Number(button.dataset.step)) * 100) / 100);
        const next = joinQty(qty, parts.unit, parts.name); if (next === item.title) return;
        try { await api(`/api/lists/items/${id}`, 'PUT', { title: next }); say(`${T('Quantity')}: ${qtyLabel({ qty, unit: parts.unit })}`); await renderItems(); host.querySelector(`.lp-item[data-id="${CSS.escape(id)}"] .lp-step[data-step="${button.dataset.step}"]`)?.focus(); } catch { say('List item update unavailable; retry when connected'); }
      })));
      const more = row.querySelector('.lp-more'); const menu = row.querySelector('.lp-menu');
      more?.addEventListener('click', event => { event.stopPropagation(); const open = menu.hidden; closeMenus(menu); menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button')?.focus(); });
      menu?.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); more.focus(); } });
    });
  }

  async function render(module) {
    host = module ?? host; if (!host) return;
    const { order, open } = await loadOverview();
    if (!order.includes(selected)) select(SHOP);
    const current = metaFor(selected);
    const isShop = selected === SHOP;
    const shopOpen = open[SHOP] ?? 0;
    host.innerHTML = `<div class="lists-plus${isShop ? ' is-shop' : ''}">
      <nav class="lp-overview" aria-label="All lists">${order.map(name => `<button type="button" class="lp-list-chip${name === SHOP ? ' pinned' : ''}" data-list="${esc(name)}" aria-pressed="${name === selected}"><span class="lp-emoji" aria-hidden="true">${esc(metaFor(name).emoji)}</span>${nameHtml(name, 'lp-name')}<span class="lp-count" aria-label="${open[name]} open">${open[name] || ''}</span></button>`).join('')}<button type="button" class="lp-list-chip new-list">＋ New list</button></nav>
      <section class="lp-detail" aria-label="Selected list">
        ${isShop ? `<div class="lp-shop-tabs" role="group" aria-label="Shopping"><button type="button" class="lp-shop-tab" data-tab="list" aria-pressed="${shopTab === 'list'}">${ICON.basket}<span>Shopping list</span><span class="lp-badge lp-shop-count" aria-label="${shopOpen} open">${shopOpen || ''}</span></button><button type="button" class="lp-shop-tab" data-tab="catalog" aria-pressed="${shopTab === 'catalog'}">${ICON.cart}<span>Products</span><span class="lp-badge muted-badge">${CATALOG.length}</span></button></div>`
        : `<header class="lp-head"><button type="button" class="lp-emoji-btn" aria-label="Change list emoji" aria-expanded="false">${esc(current.emoji)}</button><h3>${nameHtml(selected, '')}</h3><div class="lp-tools"><button type="button" class="lp-tool lp-rename">Rename</button><button type="button" class="lp-tool lp-delete">Delete list</button></div></header>
        <div class="lp-emoji-palette" hidden>${LIST_EMOJIS.map(emoji => `<button type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}</div>`}
        <form class="list-fast-entry"><span class="lp-search-icon" aria-hidden="true">${isShop ? ICON.search : ICON.plus}</span><label class="sr-only" for="module-list-input">${isShop ? 'Search or add an item' : 'Add list item'}</label><input id="module-list-input" maxlength="100" autocomplete="off" enterkeyhint="done" placeholder="${isShop ? 'Search or add an item' : 'Add an item and press Enter'}" value="${isShop ? esc(searchText) : ''}"><button type="submit" class="lp-add-btn" aria-label="Add">${ICON.plus}<span>Add</span></button></form>
        <div class="module-data"><p class="muted">Loading shared data…</p></div>
        <div class="lp-footer"><div class="lp-sort" role="group" aria-label="Sort order"><button type="button" data-sort="manual" aria-pressed="${current.sort !== 'alpha'}">Manual</button><button type="button" data-sort="alpha" aria-pressed="${current.sort === 'alpha'}">A–Z</button></div><span class="lp-footer-spacer"></span><button type="button" class="lp-tool lp-clear">Clear completed</button><button type="button" class="lp-tool lp-undo"${undoVisible ? '' : ' hidden'}>Undo</button></div>
      </section></div>`;
    const root = host.querySelector('.lists-plus');
    root.querySelectorAll('[data-list]').forEach(chip => chip.addEventListener('click', () => { select(chip.dataset.list); undoVisible = false; searchText = ''; render(); }));
    root.querySelector('.new-list').addEventListener('click', () => guard(async () => {
      const name = window.prompt(T('List name'))?.trim(); if (!name) return;
      try { await api('/api/lists', 'POST', { name }); select(name); say(`${name}: ${T('list created')}`); render(); } catch { say('List unavailable; retry when connected'); }
    }));
    root.querySelectorAll('.lp-shop-tab').forEach(tab => tab.addEventListener('click', () => { shopTab = tab.dataset.tab; shopCat = 'all'; root.querySelectorAll('.lp-shop-tab').forEach(other => other.setAttribute('aria-pressed', String(other === tab))); drawItems(); }));
    const palette = root.querySelector('.lp-emoji-palette'); const emojiButton = root.querySelector('.lp-emoji-btn');
    emojiButton?.addEventListener('click', () => guard(() => { palette.hidden = !palette.hidden; emojiButton.setAttribute('aria-expanded', String(!palette.hidden)); }));
    palette?.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', async () => { await setMeta(selected, { emoji: button.dataset.emoji }); say('List emoji updated'); render(); }));
    root.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', async () => { await setMeta(selected, { sort: button.dataset.sort }); say(button.dataset.sort === 'alpha' ? 'Sorted alphabetically' : 'Manual order'); render(); }));
    root.querySelector('.lp-rename')?.addEventListener('click', () => guard(async () => {
      const next = window.prompt(T('List name'), selected)?.trim(); if (!next || next === selected) return;
      try { await api(`/api/lists/${encodeURIComponent(selected)}`, 'PUT', { name: next }); const all = { ...meta() }; if (all[selected]) { all[next] = all[selected]; delete all[selected]; await window.jdExtras?.set('listMeta', all); } select(next); say('List renamed'); render(); } catch (error) { say(error.status === 409 ? 'A list with this name already exists' : 'List unavailable; retry when connected'); }
    }));
    root.querySelector('.lp-delete')?.addEventListener('click', () => guard(async () => {
      if (!window.confirm(`${T('Delete list')} ${selected}?`)) return;
      try { await api(`/api/lists/${encodeURIComponent(selected)}`, 'DELETE'); const all = { ...meta() }; delete all[selected]; await window.jdExtras?.set('listMeta', all); select(SHOP); say('List deleted'); render(); } catch { say('List unavailable; retry when connected'); }
    }));
    const form = root.querySelector('.list-fast-entry'); const input = form.querySelector('input');
    if (isShop) input.addEventListener('input', () => { searchText = input.value; drawItems(); });
    form.addEventListener('submit', event => { event.preventDefault(); guard(async () => {
      const title = input.value.trim(); if (!title) return; const listName = selected;
      input.value = ''; searchText = '';
      if (!navigator.onLine && window.jdListQueue) { window.jdListQueue.push({ title, listName }); say('List item saved locally; sync pending'); await renderItems(); input.focus(); return; }
      try { const created = await api('/api/lists/items', 'POST', { title, listName }); if (created?.queued) { localPending.push({ title, listName }); say('List item saved locally; sync pending'); } else say('List item added'); }
      catch { window.jdListQueue?.push({ title, listName }); say('List item saved locally; sync pending'); }
      await renderItems(); refreshCounts(); input.focus();
    }); });
    root.querySelector('.lp-clear').addEventListener('click', () => guard(async () => {
      if (!window.confirm(T('Clear completed list items?'))) return;
      try { await api(`/api/lists/items/clear-completed?list=${encodeURIComponent(selected)}`, 'POST'); undoVisible = true; root.querySelector('.lp-undo').hidden = false; say('Completed list items cleared'); renderItems(); } catch { say('List cleanup unavailable; retry when connected'); }
    }));
    root.querySelector('.lp-undo').addEventListener('click', async () => {
      try { await api('/api/lists/items/restore-cleared', 'POST'); undoVisible = false; root.querySelector('.lp-undo').hidden = true; say('Completed list items restored'); renderItems(); } catch { say('List cleanup unavailable; retry when connected'); }
    });
    await renderItems();
  }

  // Counts in the overview chips + the shopping tab badge.
  async function refreshCounts() {
    if (!host?.isConnected || !host.querySelector('.lists-plus')) return;
    const { open } = await loadOverview();
    host.querySelectorAll('[data-list]').forEach(chip => { const count = chip.querySelector('.lp-count'); count.textContent = open[chip.dataset.list] || ''; count.setAttribute('aria-label', `${open[chip.dataset.list] ?? 0} ${window.jdT?.('open items') ?? 'open'}`); window.jdRetranslateAttr?.(count, 'aria-label'); });
    const badge = host.querySelector('.lp-shop-count'); if (badge) { badge.textContent = open[SHOP] || ''; badge.setAttribute('aria-label', `${open[SHOP] ?? 0} ${window.jdT?.('open items') ?? 'open'}`); window.jdRetranslateAttr?.(badge, 'aria-label'); }
    window.jdTranslate?.();
  }

  // Refresh only the visible parts: counts in the overview chips + the selected list.
  async function refresh() {
    if (!host?.isConnected || host.hidden || !host.querySelector('.lists-plus')) return;
    await refreshCounts();
    await renderItems();
  }

  // Add many titles to a list, skipping ones already open there (case/quantity-insensitive).
  async function addItems(listName, titles) {
    const existing = await api(`/api/lists/items?list=${encodeURIComponent(listName)}&limit=200`).catch(() => []);
    const seen = new Set(existing.filter(item => !item.completed).map(item => normalize(item.title)));
    let added = 0; let skipped = 0;
    for (const raw of titles) {
      const title = String(raw ?? '').trim(); const key = normalize(title);
      if (!title || seen.has(key)) { if (title) skipped += 1; continue; }
      seen.add(key);
      try { await api('/api/lists/items', 'POST', { title, listName }); } catch { window.jdListQueue?.push({ title, listName }); }
      added += 1;
    }
    window.dispatchEvent(new CustomEvent('jd-lists-changed'));
    return { added, skipped };
  }

  window.jdListsPlus = { render, refresh, addItems, normalize, splitQty, productFor, catalog: CATALOG, SHOPPING: SHOP };
  window.addEventListener('jd-lists-changed', () => refresh());
  window.addEventListener('online', () => setTimeout(refresh, 1200));
  document.addEventListener('click', event => { if (!event.target.closest?.('.lp-menu, .lp-more')) closeMenus(); });
  // Window capture runs before navigation.js's document-capture handler (which stops propagation).
  window.addEventListener('click', event => { if (event.target.closest?.('.lp-open-shopping')) { select(SHOP); shopTab = 'list'; } }, true);
  window.jdExtras?.subscribe('listMeta', () => { if (host?.isConnected && !host.hidden && host.querySelector('.lists-plus') && !document.activeElement?.closest?.('.lists-plus')) render(); });
  window.jdI18nExtend?.({
    'Shopping list': 'Einkaufsliste', 'All lists': 'Alle Listen', '＋ New list': '＋ Neue Liste', 'Change list emoji': 'Listen-Emoji ändern', 'Sort order': 'Sortierung', 'Manual': 'Manuell', 'Rename': 'Umbenennen', 'Delete list': 'Liste löschen',
    'Add an item and press Enter': 'Neuer Eintrag …', 'Clear completed': 'Erledigte löschen', 'Everything checked off.': 'Alles abgehakt.', 'No items yet. Add the first one above.': 'Noch keine Einträge. Füge oben den ersten hinzu.',
    'Checked off': 'Abgehakt', 'sync pending': 'Sync ausstehend', 'Selected list': 'Ausgewählte Liste', 'open items': 'offene Einträge', 'Nothing to buy right now.': 'Gerade nichts einzukaufen.', 'List emoji updated': 'Listen-Emoji geändert',
    'Sorted alphabetically': 'Alphabetisch sortiert', 'Manual order': 'Manuelle Reihenfolge', 'List renamed': 'Liste umbenannt', 'List deleted': 'Liste gelöscht', 'A list with this name already exists': 'Eine Liste mit diesem Namen gibt es schon', 'List unavailable; retry when connected': 'Liste nicht verfügbar; bei Verbindung erneut versuchen',
    'Products': 'Zutaten', 'Groceries': 'Einkauf', 'Search or add an item': 'Suchen oder hinzufügen …', 'Press Enter to add': 'Enter fügt hinzu:', 'No matches.': 'Nichts gefunden.', 'Nothing to buy yet. Tap a product or type an item above.': 'Noch nichts auf der Liste. Tippe auf eine Zutat oder gib oben etwas ein.',
    'Quantity': 'Menge', 'Fewer of': 'Weniger', 'More of': 'Mehr', 'Options for': 'Optionen für', 'Move up': 'Nach oben', 'Move down': 'Nach unten', 'List item reopened': 'Listeneintrag wieder geöffnet'
  });
})();
