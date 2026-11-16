(() => {
  'use strict';
  if (window.Dock) return;

  const ICONS = {
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2.500 6.500 12 13l9.500-6.500"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  };

  const TABS = [
    {
      id: 'github',
      title: 'GitHub',
      blurb: 'alderjhuynh',
      href: 'https://github.com/alderjhuynh',
      icon: ICONS.github,
      order: 10,
    },
    {
      id: 'atlas',
      title: 'Atlas',
      blurb: 'worldbuilding & conlangs',
      href: 'https://atlas.auraea.fyi',
      icon: ICONS.globe,
      order: 20,
    },
    {
      id: 'stories',
      title: 'Stories',
      blurb: 'tales from my world',
      href: 'https://stories.auraea.fyi',
      icon: ICONS.book,
      order: 30,
    },

    {
      enabled: false,
      id: 'template',
      title: 'Your title',
      blurb: 'a short line about it',
      href: 'https://example.com',
      icon: ICONS.star,
      order: 99,
    },
  ];

  const GAP_FALLBACK = 12;

  const root = document.createElement('div');
  root.className = 'dock';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Quick links');
  document.body.appendChild(root);

  const entries = [];
  const byEl = new Map();

  const gap = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-gap')) || GAP_FALLBACK;

  function layout() {
    const g = gap();
    let y = 0;
    for (const t of entries) {
      if (!t.visible) continue;
      if (t.snap) {
        const el = t.el;
        el.style.transition = 'none';
        el.style.setProperty('--ty', y + 'px');
        void el.offsetWidth;
        el.style.transition = '';
        t.snap = false;
      } else {
        t.el.style.setProperty('--ty', y + 'px');
      }
      y += t.el.offsetHeight + g;
    }
  }

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => layout()) : null;
  window.addEventListener('resize', layout);

  function add(el, opts) {
    if (byEl.has(el)) return;
    const t = { el, order: (opts && opts.order) || 0, visible: false, snap: true };
    entries.push(t);
    entries.sort((a, b) => a.order - b.order);
    byEl.set(el, t);
    el.classList.add('tab', 'is-away');
    el.inert = true;
    root.appendChild(el);
    if (ro) ro.observe(el);
    if (opts && opts.visible) setVisible(el, true);
  }

  function setVisible(el, show) {
    const t = byEl.get(el);
    if (!t || t.visible === !!show) return;
    t.visible = !!show;
    if (show) t.snap = true;
    layout();
    el.classList.toggle('is-away', !show);
    el.inert = !show;
    if (!show) el.classList.remove('is-open', 'is-hold');
  }

  function peekable(el) {
    let timer = 0;
    let swallow = false;
    const open = () => { clearTimeout(timer); el.classList.add('is-open'); };
    const closeSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!el.matches(':hover')) el.classList.remove('is-open'); }, 280);
    };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || el.classList.contains('is-open')) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 500);
      open();
    }, true);
    el.addEventListener('click', (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !el.contains(e.target)) el.classList.remove('is-open');
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
      el.classList.remove('is-open');
    });
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(cfg) {
    const a = document.createElement('a');
    a.className = 'tab-link';
    a.dataset.tab = cfg.id;
    a.href = cfg.href;
    const external = cfg.external != null ? cfg.external : /^https?:/i.test(cfg.href) && new URL(cfg.href, location.href).origin !== location.origin;
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer external'; }
    if (cfg.width) a.style.setProperty('--w', cfg.width + 'px');
    a.innerHTML = `
      <span class="tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${cfg.icon || ICONS.link}</svg></span>
      <span class="tab-text"><b>${esc(cfg.title)}</b>${cfg.blurb ? `<small>${esc(cfg.blurb)}</small>` : ''}</span>`;
    return a;
  }

  window.Dock = { add, setVisible, layout, icons: ICONS };

  const live = TABS.filter((c) => c.enabled !== false);
  live.forEach((cfg) => {
    const el = build(cfg);
    add(el, { order: cfg.order == null ? 10 : cfg.order });
    peekable(el);
  });
  live.forEach((cfg, i) => {
    const el = root.querySelector(`[data-tab="${cfg.id}"]`);
    setTimeout(() => setVisible(el, true), 350 + i * 110);
  });
})();
