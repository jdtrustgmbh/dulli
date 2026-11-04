(() => {
  const limits = new Map([
    ['#task-list', 4],
    ['.list-items', 5],
    ['.timeline', 4],
    ['.module-data .check-list', 8],
    ['.module-data .list-items', 8],
    ['.member-list', 5]
  ]);
  // Today's schedule and tasks cards sit side by side on desktop but stack and split the
  // viewport height on mobile, leaving roughly half the room per card — the desktop limits
  // don't leave enough space for the pager itself at that height, silently clipping it (this
  // doesn't show up as page-level scroll, since overflow:hidden on the card hides it instead).
  const mobileLimits = new Map([['#task-list', 2], ['.timeline', 2]]);
  const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
  const pages = new WeakMap();
  const enhance = () => {
    for (const [selector, defaultLimit] of limits) { const limit = (isMobile() && mobileLimits.get(selector)) || defaultLimit; document.querySelectorAll(selector).forEach(list => {
      if (list.closest('.pager')) return;
      const rows = [...list.children].filter(row => !row.matches('[data-density-more]'));
      const totalPages = Math.max(1, Math.ceil(rows.length / limit));
      let page = Math.min(pages.get(list) ?? 0, totalPages - 1);
      pages.set(list, page);
      const firstVisible = page * limit;
      rows.forEach((row, index) => { row.hidden = index < firstVisible || index >= firstVisible + limit; });
      let pager = list.nextElementSibling?.matches('[data-density-more]') ? list.nextElementSibling : null;
      if (rows.length <= limit) { pager?.remove(); return; }
      if (!pager) {
        pager = document.createElement('div'); pager.dataset.densityMore = 'true'; pager.className = 'pager';
        pager.innerHTML = '<button type="button" data-density-prev aria-label="Previous page">‹</button><span data-density-label></span><button type="button" data-density-next aria-label="Next page">›</button>';
        pager.querySelector('[data-density-prev]').addEventListener('click', () => { pages.set(list, Math.max(0, (pages.get(list) ?? 0) - 1)); enhance(); });
        pager.querySelector('[data-density-next]').addEventListener('click', () => { pages.set(list, Math.min(totalPages - 1, (pages.get(list) ?? 0) + 1)); enhance(); });
        list.after(pager);
      }
      pager.querySelector('[data-density-label]').textContent = `${page + 1} / ${totalPages}`;
      pager.querySelector('[data-density-prev]').disabled = page === 0;
      pager.querySelector('[data-density-next]').disabled = page >= totalPages - 1;
    }); }
  };
  window.__jdRegisterEnhancer(enhance);
})();
